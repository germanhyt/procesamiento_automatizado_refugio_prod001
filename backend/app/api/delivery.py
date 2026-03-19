from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import os
import re
from typing import Optional, List, Set, Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app.core.delivery_constants import (
    DEFAULT_QUERY_LIMIT,
    MATCH_CANDIDATES_LIMIT,
    FUZZY_MATCH_THRESHOLD,
    FIDELIO_API_KEY_ENV,
    ORDER_TIMEOUT_MINUTES,
    DRIVER_TIMEOUT_MINUTES,
    ORDER_STATUS_LISTO,
    ORDER_STATUS_PENDIENTE_RECOJO,
    ORDER_STATUS_LISTO_PARA_ENTREGAR,
    ORDER_STATUS_PROCESO_ENTREGA,
    ORDER_STATUS_ENTREGADO,
    ORDER_STATUS_DEVOLUCION,
    ORDER_STATUS_CANCELADO,
    DRIVER_STATUS_ESPERANDO,
    DRIVER_STATUS_EN_MATCH,
    DRIVER_STATUS_ABANDONO,
    DRIVER_STATUS_DESPACHADO,
)
from app.database import get_db, SessionLocal
from app.api.auth import get_current_user
from app.models.auth import User
from app.models.delivery import Restaurant, Order, DriverArrival
# from app.core.constants import LOCATARIO_CODES, build_codigo_comunicacion
from app.core import security
from jose import jwt, JWTError
from app.schemas.delivery import (
    DeliveryStatus,
    FidelioOrderReadyIn,
    KioskArrivalIn,
    KioskArrivalResult,
    ManualMatchIn,
    AdminCancelIn,
    AdminUnlockIn,
    OrderOut,
    DriverArrivalOut,
)

from fuzzywuzzy import fuzz


router = APIRouter(prefix="/delivery", tags=["Delivery"])

EVENT_PRIORITY_UPDATE = "PRIORITY_UPDATE"
EVENT_ORDER_UPDATED = "ORDER_UPDATED"
EVENT_DRIVER_UPDATED = "DRIVER_UPDATED"
EVENT_TIMEOUTS_APPLIED = "TIMEOUTS_APPLIED"


class DeliveryConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        dead: List[WebSocket] = []
        for ws in list(self.active_connections):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


ws_manager = DeliveryConnectionManager()


async def _emit(event_type: str, payload: Dict[str, Any]) -> None:
    await ws_manager.broadcast(
        {
            "type": event_type,
            "ts": _utcnow().isoformat(),
            "payload": payload,
        }
    )


# def _extract_locatario_codigo(value: str) -> str:
#     """
#     Extrae un código tipo A03, IS01, L17 desde un string y lo valida contra LOCATARIO_CODES.
#     """
#     if not value:
#         return ""
#     s = str(value).strip().upper()
#     # IS01, A03, L17, etc.
#     m = re.search(r"\b([A-Z]{1,2}\d{2})\b", s)
#     if not m:
#         return ""
#     code = m.group(1)
#     return code if code in LOCATARIO_CODES else ""


def _try_match_waiting_driver_for_order(db: Session, order: Order) -> Optional[DriverArrival]:
    """
    Escenario Early Bird:
    Si existe un driver ESPERANDO con el mismo código (exacto o fuzzy), matchea y retorna el driver.
    """
    if not order or order.estado != ORDER_STATUS_LISTO:
        return None
    if order.matched_driver_arrival:
        return None

    codigo_norm = _normalize_code(order.codigo_pedido)
    if not codigo_norm:
        return None

    drivers = (
        db.query(DriverArrival)
        .filter(
            DriverArrival.plataforma == order.plataforma,
            DriverArrival.estado == DRIVER_STATUS_ESPERANDO,
        )
        .order_by(DriverArrival.id.desc())
        .limit(MATCH_CANDIDATES_LIMIT)
        .all()
    )
    if not drivers:
        return None

    best: Optional[DriverArrival] = None
    best_score = -1

    for d in drivers:
        score = fuzz.ratio(_normalize_code(d.codigo_ingresado), codigo_norm)
        if score > best_score:
            best_score = score
            best = d

    if not best or best_score < FUZZY_MATCH_THRESHOLD:
        return None

    now = _utcnow()
    best.matched_order_id = order.id
    best.estado = DRIVER_STATUS_EN_MATCH
    best.estado_changed_at = now

    order.estado = ORDER_STATUS_LISTO_PARA_ENTREGAR
    order.estado_changed_at = now

    db.commit()
    db.refresh(best)
    db.refresh(order)
    return best


def _normalize_code(s: str) -> str:
    return "".join(ch for ch in (s or "").strip().upper() if ch.isalnum())


def _utcnow():
    return datetime.now(timezone.utc)


def _lima_today_range_utc() -> tuple[datetime, datetime]:
    """
    Rango [inicio, fin) del día actual en zona horaria Lima convertido a UTC.
    """
    lima_tz = ZoneInfo("America/Lima")
    now_lima = datetime.now(lima_tz)
    start_lima = now_lima.replace(hour=0, minute=0, second=0, microsecond=0)
    end_lima = start_lima.replace(day=start_lima.day)  # same date object baseline
    # Sumamos un día usando timestamp para evitar dependencias extra.
    end_lima = datetime.fromtimestamp(start_lima.timestamp() + 86400, tz=lima_tz)
    return start_lima.astimezone(timezone.utc), end_lima.astimezone(timezone.utc)


def _get_state_ts(obj) -> datetime:
    return getattr(obj, "estado_changed_at", None) or getattr(obj, "updated_at", None) or getattr(obj, "created_at")


def apply_timeouts(db: Session) -> dict:
    """
    Aplica expiraciones operativas:
    - orders en PROCESO_ENTREGA por > ORDER_TIMEOUT_MINUTES -> DEVOLUCION
    - driver_arrivals en ESPERANDO por > DRIVER_TIMEOUT_MINUTES -> ABANDONO
    """
    now = _utcnow()
    order_cutoff = now.timestamp() - (ORDER_TIMEOUT_MINUTES * 60)
    driver_cutoff = now.timestamp() - (DRIVER_TIMEOUT_MINUTES * 60)

    expired_orders = 0
    expired_drivers = 0

    orders = db.query(Order).filter(Order.estado == ORDER_STATUS_PROCESO_ENTREGA).all()
    for o in orders:
        ts = _get_state_ts(o)
        if ts and ts.timestamp() <= order_cutoff:
            o.estado = ORDER_STATUS_DEVOLUCION
            o.estado_changed_at = now
            expired_orders += 1

    drivers = db.query(DriverArrival).filter(DriverArrival.estado == DRIVER_STATUS_ESPERANDO).all()
    for d in drivers:
        ts = _get_state_ts(d)
        if ts and ts.timestamp() <= driver_cutoff:
            d.estado = DRIVER_STATUS_ABANDONO
            d.estado_changed_at = now
            expired_drivers += 1

    if expired_orders or expired_drivers:
        db.commit()

    return {"expired_orders": expired_orders, "expired_drivers": expired_drivers}

def _require_webhook_key(x_api_key: Optional[str]) -> None:
    expected = (os.getenv(FIDELIO_API_KEY_ENV) or "").strip()
    if not expected:
        return
    if not x_api_key or x_api_key.strip() != expected:
        raise HTTPException(status_code=401, detail="Webhook no autorizado")


@router.get("/status", response_model=DeliveryStatus)
async def delivery_status():
    return DeliveryStatus(module="delivery", status="ok", timestamp=datetime.now(timezone.utc))


@router.websocket("/ws")
async def delivery_ws(websocket: WebSocket):
    """
    WebSocket simple de broadcast.
    Seguridad: requiere token JWT en query param (?token=...).
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return
    db = SessionLocal()
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            await websocket.close(code=1008)
            return
    except JWTError:
        await websocket.close(code=1008)
        return

    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_active:
        await websocket.close(code=1008)
        return
    if not (user.is_superuser or _user_has_permission(user, "delivery:view")):
        await websocket.close(code=1008)
        return

    await ws_manager.connect(websocket)
    try:
        while True:
            # Mantener conexión viva (si el cliente envía mensajes, los ignoramos por ahora)
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)
    finally:
        db.close()


@router.post("/webhooks/fidelio/order-ready", response_model=OrderOut)
async def fidelio_order_ready(
    payload: FidelioOrderReadyIn,
    db: Session = Depends(get_db),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    """
    Webhook S2S (Fidelio -> Backend): marca pedido como LISTO.
    Seguridad inicial: X-API-Key opcional via env FIDELIO_API_KEY.
    """
    _require_webhook_key(x_api_key)
    timeouts_res = apply_timeouts(db)
    if timeouts_res.get("expired_orders") or timeouts_res.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, timeouts_res)

    rest = (
        db.query(Restaurant)
        .filter(Restaurant.fidelio_id == payload.restaurant_fidelio_id)
        .first()
    )
    if not rest:
        raise HTTPException(
            status_code=404,
            detail=f"Restaurante con fidelio_id '{payload.restaurant_fidelio_id}' no registrado en la base de datos"
        )

    plataforma = payload.plataforma.strip().upper()
    codigo = payload.codigo_pedido.strip()

    # Buscar pedido activo (si existe). Si ya está entregado/cancelado, creamos uno nuevo.
    order = (
        db.query(Order)
        .filter(
            Order.restaurant_id == rest.id,
            Order.plataforma == plataforma,
            Order.codigo_pedido == codigo,
            Order.estado.notin_([ORDER_STATUS_ENTREGADO, ORDER_STATUS_CANCELADO]),
        )
        .order_by(Order.id.desc())
        .first()
    )

    if not order:
        order = Order(
            restaurant_id=rest.id,
            plataforma=plataforma,
            codigo_pedido=codigo,
            estado=ORDER_STATUS_LISTO,
            numero_bolsas=payload.numero_bolsas,
        )
        order.estado_changed_at = _utcnow()
        db.add(order)
        db.commit()
        db.refresh(order)
        await _emit(
            EVENT_ORDER_UPDATED,
            {"order_id": order.id, "estado": order.estado, "source": "fidelio_webhook"},
        )
        # Early Bird: si hay driver esperando, matchear al toque
        matched_driver = _try_match_waiting_driver_for_order(db, order)
        if matched_driver:
            await _emit(
                EVENT_PRIORITY_UPDATE,
                {
                    "order_id": order.id,
                    "driver_arrival_id": matched_driver.id,
                    "plataforma": order.plataforma,
                    "codigo_ingresado": matched_driver.codigo_ingresado,
                    "match_score": None,
                    "source": "early_bird",
                },
            )
            await _emit(EVENT_ORDER_UPDATED, {"order_id": order.id, "estado": order.estado, "source": "early_bird"})
            await _emit(EVENT_DRIVER_UPDATED, {"driver_arrival_id": matched_driver.id, "estado": matched_driver.estado, "source": "early_bird"})
        return order

    # Actualizar estado a LISTO si aún no se había marcado
    order.estado = ORDER_STATUS_LISTO
    order.estado_changed_at = _utcnow()
    if payload.numero_bolsas is not None:
        order.numero_bolsas = payload.numero_bolsas
    db.commit()
    db.refresh(order)
    await _emit(
        EVENT_ORDER_UPDATED,
        {"order_id": order.id, "estado": order.estado, "source": "fidelio_webhook"},
    )
    matched_driver = _try_match_waiting_driver_for_order(db, order)
    if matched_driver:
        await _emit(
            EVENT_PRIORITY_UPDATE,
            {
                "order_id": order.id,
                "driver_arrival_id": matched_driver.id,
                "plataforma": order.plataforma,
                "codigo_ingresado": matched_driver.codigo_ingresado,
                "match_score": None,
                "source": "early_bird",
            },
        )
        await _emit(EVENT_ORDER_UPDATED, {"order_id": order.id, "estado": order.estado, "source": "early_bird"})
        await _emit(EVENT_DRIVER_UPDATED, {"driver_arrival_id": matched_driver.id, "estado": matched_driver.estado, "source": "early_bird"})
    return order


@router.post("/kiosk/arrivals", response_model=KioskArrivalResult)
async def kiosk_arrival(
    payload: KioskArrivalIn,
    db: Session = Depends(get_db),
):
    """
    Registro de llegada de driver en kiosco.
    Implementa:
    - Driver ESPERANDO
    - Colisión de código (doble driver): marca previos como ABANDONO
    - Match exacto básico contra pedidos LISTO/PROCESO_ENTREGA
    """
    timeouts_res = apply_timeouts(db)
    if timeouts_res.get("expired_orders") or timeouts_res.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, timeouts_res)
    plataforma = payload.plataforma.strip().upper()
    codigo_ingresado = payload.codigo_ingresado.strip()
    codigo_norm = _normalize_code(codigo_ingresado)

    # Colisión: si existe otro arrival activo con mismo código/plataforma, lo marcamos ABANDONO
    prevs = (
        db.query(DriverArrival)
        .filter(
            DriverArrival.plataforma == plataforma,
            DriverArrival.codigo_ingresado == codigo_ingresado,
            DriverArrival.estado.in_([DRIVER_STATUS_ESPERANDO, DRIVER_STATUS_EN_MATCH]),
        )
        .all()
    )
    for p in prevs:
        p.estado = DRIVER_STATUS_ABANDONO
        p.estado_changed_at = _utcnow()
    if prevs:
        db.commit()

    arrival = DriverArrival(
        plataforma=plataforma,
        placa=(payload.placa.strip().upper() if payload.placa else None),
        alias_conductor=(payload.alias_conductor.strip() if payload.alias_conductor else None),
        codigo_ingresado=codigo_ingresado,
        estado=DRIVER_STATUS_ESPERANDO,
    )
    arrival.estado_changed_at = _utcnow()
    db.add(arrival)
    db.commit()
    db.refresh(arrival)

    # Match exacto básico (normalizado) contra pedidos activos
    candidates = (
        db.query(Order)
        .filter(
            Order.plataforma == plataforma,
            Order.estado.in_([ORDER_STATUS_LISTO, ORDER_STATUS_PROCESO_ENTREGA]),
        )
        .order_by(Order.id.desc())
        .limit(MATCH_CANDIDATES_LIMIT)
        .all()
    )
    matched_order: Optional[Order] = None
    match_score: int = 0
    for o in candidates:
        if _normalize_code(o.codigo_pedido) == codigo_norm:
            matched_order = o
            match_score = 100
            break

    if not matched_order:
        # Fuzzy matching como fallback (tolerancia a typos)
        best_score = -1
        best_order: Optional[Order] = None
        for o in candidates:
            score = fuzz.ratio(_normalize_code(o.codigo_pedido), codigo_norm)
            if score > best_score:
                best_score = score
                best_order = o

        if best_order and best_score >= FUZZY_MATCH_THRESHOLD:
            matched_order = best_order
            match_score = int(best_score)
        else:
            return KioskArrivalResult(
                driver_arrival=DriverArrivalOut.model_validate(arrival),
                matched=False,
                matched_order=None,
            )

    if not matched_order:
        return KioskArrivalResult(
            driver_arrival=DriverArrivalOut.model_validate(arrival),
            matched=False,
            matched_order=None,
        )

    # Enlazar (si el pedido ya estaba enlazado a otro driver, liberamos)
    if matched_order.matched_driver_arrival and matched_order.matched_driver_arrival.id != arrival.id:
        matched_order.matched_driver_arrival.estado = DRIVER_STATUS_ABANDONO
        matched_order.matched_driver_arrival.estado_changed_at = _utcnow()

    arrival.matched_order_id = matched_order.id
    arrival.estado = DRIVER_STATUS_EN_MATCH
    matched_order.estado = ORDER_STATUS_LISTO_PARA_ENTREGAR
    now = _utcnow()
    arrival.estado_changed_at = now
    matched_order.estado_changed_at = now

    db.commit()
    db.refresh(arrival)
    db.refresh(matched_order)

    await _emit(
        EVENT_PRIORITY_UPDATE,
        {
            "order_id": matched_order.id,
            "driver_arrival_id": arrival.id,
            "plataforma": plataforma,
            "codigo_ingresado": codigo_ingresado,
            "match_score": match_score,
        },
    )
    await _emit(
        EVENT_ORDER_UPDATED,
        {"order_id": matched_order.id, "estado": matched_order.estado, "source": "kiosk_match"},
    )
    await _emit(
        EVENT_DRIVER_UPDATED,
        {"driver_arrival_id": arrival.id, "estado": arrival.estado, "source": "kiosk_match"},
    )

    return KioskArrivalResult(
        driver_arrival=DriverArrivalOut.model_validate(arrival),
        matched=True,
        matched_order=OrderOut.model_validate(matched_order),
    )


@router.get("/orders/active", response_model=List[OrderOut])
async def list_active_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pedidos activos para operación (runner).
    En esta iteración: excluye ENTREGADO y CANCELADO.
    """
    _require_permission(current_user, "delivery:view")
    timeouts_res = apply_timeouts(db)
    if timeouts_res.get("expired_orders") or timeouts_res.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, timeouts_res)
    orders = (
        db.query(Order)
        .filter(Order.estado.notin_([ORDER_STATUS_ENTREGADO, ORDER_STATUS_CANCELADO]))
        .order_by(Order.id.desc())
        .limit(DEFAULT_QUERY_LIMIT)
        .all()
    )
    return orders

@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order_by_id(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Obtener detalles de un pedido específico.
    """
    _require_permission(current_user, "delivery:view")
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return order


@router.get("/drivers/waiting", response_model=List[DriverArrivalOut])
async def list_waiting_drivers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:view")
    timeouts_res = apply_timeouts(db)
    if timeouts_res.get("expired_orders") or timeouts_res.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, timeouts_res)
    drivers = (
        db.query(DriverArrival)
        .filter(DriverArrival.estado.in_([DRIVER_STATUS_ESPERANDO, DRIVER_STATUS_EN_MATCH]))
        .order_by(DriverArrival.id.desc())
        .limit(DEFAULT_QUERY_LIMIT)
        .all()
    )
    return drivers


@router.get("/kiosk/drivers/waiting", response_model=List[DriverArrivalOut])
async def kiosk_list_waiting_drivers(
    db: Session = Depends(get_db),
):
    """
    Endpoint público para Kiosk (sin JWT).
    Retorna drivers en estados ESPERANDO/EN_MATCH para mostrar cola en SUNMI.
    """
    timeouts_res = apply_timeouts(db)
    if timeouts_res.get("expired_orders") or timeouts_res.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, timeouts_res)
    drivers = (
        db.query(DriverArrival)
        .filter(DriverArrival.estado.in_([DRIVER_STATUS_ESPERANDO, DRIVER_STATUS_EN_MATCH]))
        .order_by(DriverArrival.id.desc())
        .limit(DEFAULT_QUERY_LIMIT)
        .all()
    )
    return drivers


@router.get("/kiosk/orders/delivered/today", response_model=List[OrderOut])
async def kiosk_list_delivered_orders_today(
    db: Session = Depends(get_db),
):
    """
    Endpoint público para Kiosk (sin JWT).
    Retorna pedidos ENTREGADO del día actual (zona Lima), ordenados por más recientes.
    """
    timeouts_res = apply_timeouts(db)
    if timeouts_res.get("expired_orders") or timeouts_res.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, timeouts_res)

    start_utc, end_utc = _lima_today_range_utc()
    orders = (
        db.query(Order)
        .filter(
            Order.estado == ORDER_STATUS_ENTREGADO,
            Order.estado_changed_at.isnot(None),
            Order.estado_changed_at >= start_utc,
            Order.estado_changed_at < end_utc,
        )
        .order_by(Order.estado_changed_at.desc(), Order.id.desc())
        .limit(DEFAULT_QUERY_LIMIT)
        .all()
    )
    return orders


@router.post("/orders/{order_id}/manual-match", response_model=KioskArrivalResult)
async def manual_match_order(
    order_id: int,
    payload: ManualMatchIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Match manual: enlaza un driver_arrival existente con un order existente.
    Útil cuando el fuzzy match no supera el umbral.
    """
    _require_permission(current_user, "delivery:operate")
    timeouts_res = apply_timeouts(db)
    if timeouts_res.get("expired_orders") or timeouts_res.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, timeouts_res)
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if order.estado in [ORDER_STATUS_ENTREGADO, ORDER_STATUS_CANCELADO]:
        raise HTTPException(status_code=400, detail="Pedido no es matchable por estado")

    arrival = db.query(DriverArrival).filter(DriverArrival.id == payload.driver_arrival_id).first()
    if not arrival:
        raise HTTPException(status_code=404, detail="DriverArrival no encontrado")
    if arrival.estado == DRIVER_STATUS_ABANDONO:
        raise HTTPException(status_code=400, detail="DriverArrival no es matchable por estado")

    # Si el pedido estaba enlazado, liberamos
    if order.matched_driver_arrival and order.matched_driver_arrival.id != arrival.id:
        order.matched_driver_arrival.estado = DRIVER_STATUS_ABANDONO
        order.matched_driver_arrival.estado_changed_at = _utcnow()

    # Si el driver estaba enlazado a otro pedido, liberamos ese pedido (lo dejamos en LISTO)
    if arrival.matched_order and arrival.matched_order.id != order.id:
        arrival.matched_order.estado = ORDER_STATUS_LISTO
        arrival.matched_order.estado_changed_at = _utcnow()

    arrival.matched_order_id = order.id
    arrival.estado = DRIVER_STATUS_EN_MATCH
    order.estado = ORDER_STATUS_LISTO_PARA_ENTREGAR
    now = _utcnow()
    arrival.estado_changed_at = now
    order.estado_changed_at = now

    db.commit()
    db.refresh(arrival)
    db.refresh(order)

    await _emit(
        EVENT_PRIORITY_UPDATE,
        {
            "order_id": order.id,
            "driver_arrival_id": arrival.id,
            "plataforma": arrival.plataforma,
            "codigo_ingresado": arrival.codigo_ingresado,
            "match_score": None,
            "manual": True,
        },
    )
    await _emit(EVENT_ORDER_UPDATED, {"order_id": order.id, "estado": order.estado, "source": "manual_match"})
    await _emit(EVENT_DRIVER_UPDATED, {"driver_arrival_id": arrival.id, "estado": arrival.estado, "source": "manual_match"})

    return KioskArrivalResult(
        driver_arrival=DriverArrivalOut.model_validate(arrival),
        matched=True,
        matched_order=OrderOut.model_validate(order),
    )


@router.post("/maintenance/apply-timeouts")
async def maintenance_apply_timeouts(db: Session = Depends(get_db)):
    """
    Endpoint de mantenimiento para ejecutar expiraciones de estado.
    Útil si aún no hay scheduler/worker.
    """
    result = apply_timeouts(db)
    if result.get("expired_orders") or result.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, result)
    return {"success": True, **result}


@router.post("/orders/{order_id}/accept", response_model=OrderOut)
async def runner_accept_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:operate")
    timeouts_res = apply_timeouts(db)
    if timeouts_res.get("expired_orders") or timeouts_res.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, timeouts_res)
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update(skip_locked=True)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if order.estado in [ORDER_STATUS_ENTREGADO, ORDER_STATUS_CANCELADO, ORDER_STATUS_DEVOLUCION]:
        raise HTTPException(status_code=400, detail="Pedido no es aceptable por estado")

    if order.locked_by_runner_id and order.locked_by_runner_id != current_user.id:
        raise HTTPException(status_code=409, detail="Pedido ya fue tomado por otro runner")

    order.locked_by_runner_id = current_user.id
    order.estado = ORDER_STATUS_PENDIENTE_RECOJO
    order.estado_changed_at = _utcnow()
    db.commit()
    db.refresh(order)
    await _emit(
        EVENT_ORDER_UPDATED,
        {"order_id": order.id, "estado": order.estado, "locked_by_runner_id": order.locked_by_runner_id, "source": "runner_accept"},
    )
    return order


@router.post("/orders/{order_id}/shelf", response_model=OrderOut)
async def runner_shelf_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:operate")
    timeouts_res = apply_timeouts(db)
    if timeouts_res.get("expired_orders") or timeouts_res.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, timeouts_res)
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update(skip_locked=True)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if order.locked_by_runner_id and order.locked_by_runner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="No tiene permisos sobre este pedido")
    if order.estado in [ORDER_STATUS_ENTREGADO, ORDER_STATUS_CANCELADO, ORDER_STATUS_DEVOLUCION]:
        raise HTTPException(status_code=400, detail="Pedido no es shelfable por estado")

    order.estado = ORDER_STATUS_PROCESO_ENTREGA
    order.estado_changed_at = _utcnow()
    db.commit()
    db.refresh(order)
    await _emit(
        EVENT_ORDER_UPDATED,
        {"order_id": order.id, "estado": order.estado, "source": "runner_shelf"},
    )
    return order


@router.post("/orders/{order_id}/deliver", response_model=OrderOut)
async def runner_deliver_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:operate")
    timeouts_res = apply_timeouts(db)
    if timeouts_res.get("expired_orders") or timeouts_res.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, timeouts_res)
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update(skip_locked=True)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if order.locked_by_runner_id and order.locked_by_runner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="No tiene permisos sobre este pedido")
    if order.estado in [ORDER_STATUS_CANCELADO, ORDER_STATUS_DEVOLUCION]:
        raise HTTPException(status_code=400, detail="Pedido no es entregable por estado")

    # REGLA DE NEGOCIO: No se puede entregar sin driver matcheado
    if not order.matched_driver_arrival:
        raise HTTPException(
            status_code=400,
            detail="No se puede entregar: no hay driver matcheado para este pedido"
        )

    now = _utcnow()
    order.estado = ORDER_STATUS_ENTREGADO
    order.estado_changed_at = now

    if order.matched_driver_arrival:
        order.matched_driver_arrival.estado = DRIVER_STATUS_DESPACHADO
        order.matched_driver_arrival.estado_changed_at = now

    db.commit()
    db.refresh(order)
    await _emit(
        EVENT_ORDER_UPDATED,
        {"order_id": order.id, "estado": order.estado, "source": "runner_deliver"},
    )
    if order.matched_driver_arrival:
        await _emit(
            EVENT_DRIVER_UPDATED,
            {"driver_arrival_id": order.matched_driver_arrival.id, "estado": order.matched_driver_arrival.estado, "source": "runner_deliver"},
        )
    return order


def _require_admin(current_user: User) -> None:
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="No tiene permisos de administrador")


def _user_has_permission(user: User, codename: str) -> bool:
    try:
        for role in getattr(user, "roles", []) or []:
            for perm in getattr(role, "permissions", []) or []:
                if getattr(perm, "codename", None) == codename:
                    return True
    except Exception:
        return False
    return False


def _require_permission(current_user: User, codename: str) -> None:
    if current_user.is_superuser:
        return
    if not _user_has_permission(current_user, codename):
        raise HTTPException(status_code=403, detail="No tiene permisos")


@router.get("/admin/orders/by-status/{status}", response_model=List[OrderOut])
async def admin_list_orders_by_status(
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:admin")
    apply_timeouts(db)
    orders = (
        db.query(Order)
        .filter(Order.estado == status.strip().upper())
        .order_by(Order.id.desc())
        .limit(DEFAULT_QUERY_LIMIT)
        .all()
    )
    return orders


@router.post("/admin/orders/{order_id}/mark-devolucion", response_model=OrderOut)
async def admin_mark_devolucion(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:admin")
    apply_timeouts(db)
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update(skip_locked=True)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if order.estado in [ORDER_STATUS_CANCELADO, ORDER_STATUS_ENTREGADO]:
        raise HTTPException(status_code=400, detail="Pedido no puede pasar a devolución por estado")

    order.estado = ORDER_STATUS_DEVOLUCION
    order.estado_changed_at = _utcnow()
    db.commit()
    db.refresh(order)
    await _emit(EVENT_ORDER_UPDATED, {"order_id": order.id, "estado": order.estado, "source": "admin_mark_devolucion"})
    return order


@router.post("/admin/orders/{order_id}/cancel", response_model=OrderOut)
async def admin_cancel_order(
    order_id: int,
    payload: AdminCancelIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:admin")
    apply_timeouts(db)
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update(skip_locked=True)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if order.estado == ORDER_STATUS_ENTREGADO:
        raise HTTPException(status_code=400, detail="No se puede cancelar un pedido entregado")

    order.estado = ORDER_STATUS_CANCELADO
    order.estado_changed_at = _utcnow()
    # liberamos lock si existía
    order.locked_by_runner_id = None
    db.commit()
    db.refresh(order)
    await _emit(
        EVENT_ORDER_UPDATED,
        {
            "order_id": order.id,
            "estado": order.estado,
            "reason": payload.reason,
            "note": payload.note,
            "source": "admin_cancel",
        },
    )
    return order


@router.post("/admin/orders/{order_id}/unlock", response_model=OrderOut)
async def admin_unlock_order(
    order_id: int,
    payload: AdminUnlockIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:admin")
    apply_timeouts(db)
    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update(skip_locked=True)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    order.locked_by_runner_id = None
    db.commit()
    db.refresh(order)
    await _emit(
        EVENT_ORDER_UPDATED,
        {"order_id": order.id, "estado": order.estado, "locked_by_runner_id": None, "note": payload.note, "source": "admin_unlock"},
    )
    return order

