from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import logging
import os
import re
import requests
from typing import Optional, List, Set, Any, Dict

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session, contains_eager, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql import func as sql_func
from starlette.responses import FileResponse, Response

from app.core.delivery_constants import (
    ADMIN_ORDERS_MAX_DATE_RANGE_DAYS,
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
    RUNNER_PUSH_APP_SLUG,
    DRIVER_STATUS_ESPERANDO,
    DRIVER_STATUS_EN_MATCH,
    DRIVER_STATUS_ABANDONO,
    DRIVER_STATUS_DESPACHADO,
    DRIVER_DOCUMENTO_TIPO_DNI,
    DRIVER_DOCUMENTO_TIPO_CE,
    PERMISSION_DELIVERY_OPERATE,
    PERMISSION_DELIVERY_SIMULATE_ORDER_READY,
)
from app.database import db_session, get_db, SessionLocal
from app.api.auth import authenticate_token, get_current_user, oauth2_scheme
from app.models.auth import User
from app.models.delivery import (
    Restaurant,
    RestaurantNotificationEmail,
    Order,
    DriverArrival,
    DeliveryRunnerPushToken,
    RunnerNotification,
)
# from app.core.constants import LOCATARIO_CODES, build_codigo_comunicacion
from app.core import security
from jose import jwt, JWTError
from app.schemas.delivery import (
    DeliveryMetricsOut,
    DeliveryStatus,
    FidelioOrderReadyIn,
    FidelioOrderReadyOut,
    KioskArrivalIn,
    KioskArrivalResult,
    ManualMatchIn,
    AdminCancelIn,
    AdminUnlockIn,
    AdminForceEntregadoIn,
    OrderOut,
    PaginatedOrders,
    DriverArrivalOut,
    RestaurantOut,
    RestaurantAdminOut,
    RestaurantCreateIn,
    RestaurantUpdateIn,
    RestaurantNotificationEmailOut,
    RestaurantNotificationEmailCreateIn,
    order_orm_to_dict,
    driver_arrival_orm_to_dict,
    RunnerPushRegisterIn,
    RunnerPushUnregisterIn,
    RunnerPushRegisterOut,
    RunnerNotificationOut,
    KioskConfigPublicOut,
    KioskConfigPatchIn,
    AdminAppConfigOut,
    RunnerFeatureFlagsOut,
)

from app.services.delivery_metrics_service import compute_delivery_metrics
from app.services.delivery_push import (
    notify_runners_kiosk_match_sync,
    notify_runners_new_driver_waiting_sync,
    notify_runners_order_listo_sync,
)
from app.services.delivery_runner_notifications import (
    delete_all_runner_notifications_for_user,
    mark_all_runner_notifications_read,
)
from app.services.delivery_decolecta import fetch_reniec_dni_dict, fetch_reniec_full_name_optional
from app.services.delivery_config import get_delivery_config
from app.services.delivery_driver_photo import save_kiosk_driver_photo_file
from app.services.file_store_service import get_upload_base
from app.services.fidelio_webhook_service import process_fidelio_order_ready

from fuzzywuzzy import fuzz


logger = logging.getLogger(__name__)

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


async def _emit_nuevo_driver_esperando(
    driver_arrival_id: int,
    plataforma: str,
    codigo_ingresado: str,
    restaurant_nombre: Optional[str] = None,
) -> None:
    payload: Dict[str, Any] = {
        "driver_arrival_id": driver_arrival_id,
        "estado": DRIVER_STATUS_ESPERANDO,
        "source": "kiosk_arrival",
        "kind": "NUEVO_DRIVER_ESPERANDO",
        "plataforma": plataforma,
        "codigo_ingresado": codigo_ingresado,
    }
    rn = (restaurant_nombre or "").strip()
    if rn:
        payload["restaurant_nombre"] = rn
    await _emit(EVENT_DRIVER_UPDATED, payload)


def _apply_order_driver_match(order: Order, arrival: DriverArrival, now: datetime) -> None:
    """Enlaza pedido y driver; marca tiempos de match y atención al driver."""
    arrival.matched_order_id = order.id
    arrival.estado = DRIVER_STATUS_EN_MATCH
    arrival.estado_changed_at = now
    if arrival.atendido_at is None:
        arrival.atendido_at = now
    order.estado = ORDER_STATUS_LISTO_PARA_ENTREGAR
    order.estado_changed_at = now
    if order.match_at is None:
        order.match_at = now


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
    Si existe un driver ESPERANDO en el mismo restaurante + plataforma con código compatible
    (exacto vía normalización o fuzzy), matchea y retorna el driver.
    """
    if not order or order.estado != ORDER_STATUS_LISTO:
        return None
    if order.matched_driver_arrival:
        return None

    codigo_norm = _normalize_code(order.codigo_pedido)
    if not codigo_norm:
        return None

    da_filters = [
        DriverArrival.plataforma == order.plataforma,
        DriverArrival.estado == DRIVER_STATUS_ESPERANDO,
    ]
    if order.restaurant_id is not None:
        da_filters.append(DriverArrival.restaurant_id == order.restaurant_id)

    drivers = (
        db.query(DriverArrival)
        .filter(*da_filters)
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
    _apply_order_driver_match(order, best, now)

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


def _parse_lima_date(date_str: str) -> date:
    try:
        return datetime.strptime(date_str.strip(), "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Formato de fecha inválido: '{date_str}'. Use YYYY-MM-DD.",
        )


def _lima_date_range_utc(date_str: str) -> tuple[datetime, datetime]:
    """
    Convierte una fecha YYYY-MM-DD (zona Lima) al rango UTC equivalente [inicio, fin).
    Lanza HTTPException 422 si el formato no es válido.
    """
    lima_tz = ZoneInfo("America/Lima")
    parsed = _parse_lima_date(date_str)
    start_lima = datetime(parsed.year, parsed.month, parsed.day, tzinfo=lima_tz)
    end_lima = datetime.fromtimestamp(start_lima.timestamp() + 86400, tz=lima_tz)
    return start_lima.astimezone(timezone.utc), end_lima.astimezone(timezone.utc)


def _lima_created_at_bounds_utc(
    fecha_desde: Optional[str],
    fecha_hasta: Optional[str],
) -> tuple[Optional[datetime], Optional[datetime]]:
    """Límites UTC [inicio, fin) sobre Order.created_at según fechas Lima inclusive."""
    start_utc: Optional[datetime] = None
    end_utc: Optional[datetime] = None
    if fecha_desde:
        start_utc, _ = _lima_date_range_utc(fecha_desde)
    if fecha_hasta:
        _, end_utc = _lima_date_range_utc(fecha_hasta)
    if fecha_desde and fecha_hasta:
        d0 = _parse_lima_date(fecha_desde)
        d1 = _parse_lima_date(fecha_hasta)
        if d0 > d1:
            raise HTTPException(status_code=422, detail="fecha_desde no puede ser posterior a fecha_hasta")
        if (d1 - d0).days > ADMIN_ORDERS_MAX_DATE_RANGE_DAYS:
            raise HTTPException(
                status_code=422,
                detail=f"El rango de fechas no puede superar {ADMIN_ORDERS_MAX_DATE_RANGE_DAYS} días",
            )
    return start_utc, end_utc


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
            o.devolucion_at = now
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
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            await websocket.close(code=1008)
            return
    except JWTError:
        await websocket.close(code=1008)
        return

    # Validar token/usuario usando una sesión corta para no retener conexiones DB
    # durante toda la vida del WebSocket (evita agotar el pool en reconexiones).
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        allowed = bool(user and user.is_active and (user.is_superuser or _user_has_permission(user, "delivery:view")))
    finally:
        db.close()
    if not allowed:
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


def _load_order_dict(db: Session, order_id: int) -> Dict[str, Any]:
    """Re-carga Order con driver matcheado para serializar sin lazy-load."""
    o = (
        db.query(Order)
        .options(
            joinedload(Order.matched_driver_arrival),
            joinedload(Order.restaurant),
            joinedload(Order.locked_by_runner),
        )
        .filter(Order.id == order_id)
        .one()
    )
    return order_orm_to_dict(o)


def _orders_to_dicts(orders: List[Order]) -> List[Dict[str, Any]]:
    return [order_orm_to_dict(o) for o in orders]


async def _fidelio_apply_order_ready_side_effects(
    db: Session,
    background_tasks: BackgroundTasks,
    order_id: int,
    plataforma: str,
    codigo: str,
    restaurant_nombre: str,
    *,
    notify_runners: bool,
    emit_order_updated: bool,
    try_early_bird: bool,
) -> None:
    if emit_order_updated:
        order = db.query(Order).filter(Order.id == order_id).first()
        if order:
            await _emit(
                EVENT_ORDER_UPDATED,
                {
                    "order_id": order.id,
                    "estado": order.estado,
                    "source": "fidelio_webhook",
                    "restaurant_nombre": restaurant_nombre,
                },
            )
    if notify_runners:
        background_tasks.add_task(notify_runners_order_listo_sync, order_id, plataforma, codigo)
    if try_early_bird:
        order = db.query(Order).filter(Order.id == order_id).first()
        if order:
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
                await _emit(
                    EVENT_ORDER_UPDATED,
                    {"order_id": order.id, "estado": order.estado, "source": "early_bird"},
                )
                await _emit(
                    EVENT_DRIVER_UPDATED,
                    {
                        "driver_arrival_id": matched_driver.id,
                        "estado": matched_driver.estado,
                        "source": "early_bird",
                    },
                )


async def _fidelio_order_ready_legacy(
    payload: FidelioOrderReadyIn,
    background_tasks: BackgroundTasks,
    db: Session,
) -> Dict[str, Any]:
    """
    Lógica anterior del webhook (idempotente sobre pedido activo).
    Usada por simulación Runner — sin contrato `{ order, reception }`.
    """
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
            detail=f"Restaurante con fidelio_id '{payload.restaurant_fidelio_id}' no registrado en la base de datos",
        )

    plataforma = payload.plataforma.strip().upper()
    codigo = payload.codigo_pedido.strip()

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
        t0 = _utcnow()
        order = Order(
            restaurant_id=rest.id,
            plataforma=plataforma,
            codigo_pedido=codigo,
            estado=ORDER_STATUS_LISTO,
            numero_bolsas=payload.numero_bolsas,
        )
        order.estado_changed_at = t0
        order.listo_at = t0
        db.add(order)
        db.commit()
        db.refresh(order)
        await _fidelio_apply_order_ready_side_effects(
            db,
            background_tasks,
            order.id,
            plataforma,
            codigo,
            rest.nombre,
            notify_runners=True,
            emit_order_updated=True,
            try_early_bird=True,
        )
        return _load_order_dict(db, order.id)

    prev_estado = order.estado
    t1 = _utcnow()
    order.estado = ORDER_STATUS_LISTO
    order.estado_changed_at = t1
    order.listo_at = t1
    if payload.numero_bolsas is not None:
        order.numero_bolsas = payload.numero_bolsas
    db.commit()
    db.refresh(order)

    await _emit(
        EVENT_ORDER_UPDATED,
        {
            "order_id": order.id,
            "estado": order.estado,
            "source": "fidelio_webhook",
            "restaurant_nombre": rest.nombre,
        },
    )
    if prev_estado != ORDER_STATUS_LISTO:
        background_tasks.add_task(notify_runners_order_listo_sync, order.id, plataforma, codigo)
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
        await _emit(
            EVENT_ORDER_UPDATED,
            {"order_id": order.id, "estado": order.estado, "source": "early_bird"},
        )
        await _emit(
            EVENT_DRIVER_UPDATED,
            {"driver_arrival_id": matched_driver.id, "estado": matched_driver.estado, "source": "early_bird"},
        )
    return _load_order_dict(db, order.id)


@router.post("/webhooks/fidelio/order-ready", response_model=FidelioOrderReadyOut)
async def fidelio_order_ready(
    payload: FidelioOrderReadyIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    """
    Webhook S2S (Fidelio -> Backend): marca pedido como LISTO.
    Respuesta `{ order, reception }` con kind created | duplicate | new_cycle.
    Seguridad: X-API-Key opcional via env FIDELIO_API_KEY.
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
            detail=f"Restaurante con fidelio_id '{payload.restaurant_fidelio_id}' no registrado en la base de datos",
        )

    plataforma = payload.plataforma.strip().upper()
    codigo = payload.codigo_pedido.strip()

    result = process_fidelio_order_ready(
        db,
        rest,
        plataforma,
        codigo,
        payload.numero_bolsas,
    )
    await _fidelio_apply_order_ready_side_effects(
        db,
        background_tasks,
        result.order_id,
        result.plataforma,
        result.codigo_pedido,
        rest.nombre,
        notify_runners=result.notify_runners,
        emit_order_updated=result.emit_order_updated,
        try_early_bird=result.try_early_bird,
    )
    return result.response


@router.post("/runner/simulate/order-ready", response_model=OrderOut)
async def runner_simulate_order_ready(
    payload: FidelioOrderReadyIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Simulación operativa desde app Runner (lógica legacy, respuesta OrderOut completa).
    Autorización: permiso explícito `delivery:simulate_order_ready`, o bien `delivery:operate`
    si el flag `enable_runner_simulate_order_ready` está activo en config.
    """
    cfg = get_delivery_config(db)
    db.commit()
    if current_user.is_superuser:
        pass
    elif _user_has_permission(current_user, PERMISSION_DELIVERY_SIMULATE_ORDER_READY):
        pass
    elif cfg.enable_runner_simulate_order_ready and _user_has_permission(
        current_user, PERMISSION_DELIVERY_OPERATE
    ):
        pass
    else:
        raise HTTPException(
            status_code=403,
            detail="No tiene permisos para simular pedido listo.",
        )
    return await _fidelio_order_ready_legacy(payload, background_tasks, db)


@router.get("/runner/feature-flags", response_model=RunnerFeatureFlagsOut)
def runner_feature_flags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Flags de producto para la app Runner (JWT + delivery:view)."""
    _require_permission(current_user, "delivery:view")
    cfg = get_delivery_config(db)
    db.commit()
    return RunnerFeatureFlagsOut(
        enable_runner_simulate_order_ready=bool(cfg.enable_runner_simulate_order_ready),
    )


@router.get("/kiosk/restaurants", response_model=List[RestaurantOut])
async def kiosk_list_restaurants(db: Session = Depends(get_db)):
    """Listado público de restaurantes activos para selector en Kiosk."""
    rows = (
        db.query(Restaurant)
        .filter(Restaurant.is_active.is_(True))
        .order_by(Restaurant.nombre.asc())
        .all()
    )
    return rows


@router.get("/kiosk/config", response_model=KioskConfigPublicOut)
def kiosk_public_config(db: Session = Depends(get_db)):
    """Flags públicos para que el kiosk oculte consulta RENIEC / cámara sin JWT."""
    cfg = get_delivery_config(db)
    db.commit()
    return KioskConfigPublicOut(
        enable_driver_dni_lookup=bool(cfg.enable_driver_dni_lookup),
        enable_driver_photo_capture=bool(cfg.enable_driver_photo_capture),
    )


@router.get("/kiosk/dni-lookup", response_model=Dict[str, Any])
def kiosk_dni_lookup(
    numero: str = Query(..., min_length=8, max_length=12, description="Número de DNI (8 dígitos)"),
    db: Session = Depends(get_db),
):
    """
    Proxy público hacia DeColecta/RENIEC para consulta de datos del conductor por DNI.
    Sin JWT — sólo para uso interno del Kiosk. La API key se mantiene server-side.
    """
    cfg = get_delivery_config(db)
    db.commit()
    if not cfg.enable_driver_dni_lookup:
        raise HTTPException(status_code=403, detail="Consulta DNI deshabilitada para este kiosko.")
    if not re.match(r"^\d{8,12}$", numero.strip()):
        raise HTTPException(status_code=422, detail="Número de DNI inválido. Se esperan 8 a 12 dígitos.")

    try:
        d = fetch_reniec_dni_dict(numero.strip())
    except ValueError as exc:
        msg = str(exc)
        if "DECOLECTA_API_KEY" in msg:
            raise HTTPException(status_code=503, detail="Servicio de consulta DNI no configurado.")
        if msg == "DNI no encontrado":
            raise HTTPException(status_code=404, detail="DNI no encontrado en RENIEC.")
        logger.warning("DeColecta DNI lookup error: %s", msg)
        raise HTTPException(status_code=502, detail="Respuesta inesperada del servicio de consulta DNI.")
    except requests.RequestException as exc:
        logger.error("DeColecta DNI lookup error: %s", exc)
        raise HTTPException(status_code=502, detail="Error al contactar el servicio de consulta DNI.")

    raw = d.get("_raw")
    return {
        "first_name": d["first_name"],
        "first_last_name": d["first_last_name"],
        "second_last_name": d["second_last_name"],
        "full_name": d["full_name"],
        "document_number": d["document_number"],
        "_raw": raw,
    }


def _kiosk_resolve_documento_eff(
    payload: KioskArrivalIn,
) -> tuple[str, Optional[str], Optional[str]]:
    """
    Tipo y valores finales (DNI/CE) tras validar el body.
    Refuerza coherencia si el flag y los números no coinciden.
    """
    dni = re.sub(r"[\s-]", "", str(payload.conductor_dni or "").strip())
    ce = re.sub(r"[\s-]", "", str(payload.conductor_carne_extranjeria or "").strip().upper())
    dni_ok = bool(dni.isdigit() and 8 <= len(dni) <= 12)
    ce_ok = bool(ce and re.match(r"^[A-Z0-9]{4,20}$", ce))
    t = (payload.conductor_documento_tipo or DRIVER_DOCUMENTO_TIPO_DNI).strip().upper()
    if t not in (DRIVER_DOCUMENTO_TIPO_DNI, DRIVER_DOCUMENTO_TIPO_CE):
        t = DRIVER_DOCUMENTO_TIPO_DNI
    if t == DRIVER_DOCUMENTO_TIPO_DNI and ce_ok and not dni_ok:
        t = DRIVER_DOCUMENTO_TIPO_CE
    elif t == DRIVER_DOCUMENTO_TIPO_CE and dni_ok and not ce_ok:
        t = DRIVER_DOCUMENTO_TIPO_DNI
    if t == DRIVER_DOCUMENTO_TIPO_CE:
        return t, None, payload.conductor_carne_extranjeria
    return t, payload.conductor_dni, None


@router.post("/kiosk/arrivals", response_model=KioskArrivalResult)
async def kiosk_arrival(
    payload: KioskArrivalIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Registro de llegada de driver en kiosco.
    Implementa:
    - Driver ESPERANDO
    - Colisión de código (doble driver): marca previos como ABANDONO
    - Match contra pedidos LISTO/PROCESO_ENTREGA del mismo restaurante (kiosko), misma plataforma y código compatible.
    """
    timeouts_res = apply_timeouts(db)
    if timeouts_res.get("expired_orders") or timeouts_res.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, timeouts_res)
    rest = (
        db.query(Restaurant)
        .filter(Restaurant.id == payload.restaurant_id, Restaurant.is_active.is_(True))
        .first()
    )
    if not rest:
        raise HTTPException(status_code=400, detail="Restaurante no válido o inactivo")

    delivery_cfg = get_delivery_config(db)
    db.commit()
    doc_tipo, conductor_dni_val, ce_val = _kiosk_resolve_documento_eff(payload)
    if delivery_cfg.enable_driver_dni_lookup:
        if doc_tipo == DRIVER_DOCUMENTO_TIPO_DNI:
            if not (conductor_dni_val and str(conductor_dni_val).strip()):
                raise HTTPException(status_code=400, detail="DNI del conductor es obligatorio.")
        else:
            if not (ce_val and str(ce_val).strip()):
                raise HTTPException(
                    status_code=400,
                    detail="Carné de extranjería del conductor es obligatorio.",
                )

    plataforma = payload.plataforma.strip().upper()
    codigo_ingresado = payload.codigo_ingresado.strip().upper()
    codigo_norm = _normalize_code(codigo_ingresado)

    # Colisión: mismo local + plataforma + código (no cruzar restaurantes ni kioskos)
    prevs = (
        db.query(DriverArrival)
        .filter(
            DriverArrival.restaurant_id == rest.id,
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

    nombre_reniec: Optional[str] = None
    if doc_tipo == DRIVER_DOCUMENTO_TIPO_DNI and conductor_dni_val:
        nombre_reniec = fetch_reniec_full_name_optional(conductor_dni_val)

    arrival = DriverArrival(
        plataforma=plataforma,
        placa=payload.placa.strip().upper(),
        alias_conductor=payload.alias_conductor.strip(),
        codigo_ingresado=codigo_ingresado,
        restaurant_id=rest.id,
        conductor_documento_tipo=doc_tipo,
        conductor_dni=conductor_dni_val,
        conductor_carne_extranjeria=ce_val,
        conductor_nombre_completo=nombre_reniec,
        estado=DRIVER_STATUS_ESPERANDO,
    )
    arrival.estado_changed_at = _utcnow()
    db.add(arrival)
    db.commit()
    db.refresh(arrival)

    # Match: mismo restaurante (kiosko) + plataforma + código de pedido (normalizado / fuzzy)
    candidates = (
        db.query(Order)
        .filter(
            Order.restaurant_id == rest.id,
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
            await _emit_nuevo_driver_esperando(arrival.id, plataforma, codigo_ingresado, rest.nombre)
            background_tasks.add_task(
                notify_runners_new_driver_waiting_sync,
                arrival.id,
                plataforma,
                codigo_ingresado,
            )
            arrival.restaurant = rest
            return {
                "driver_arrival": driver_arrival_orm_to_dict(arrival),
                "matched": False,
                "matched_order": None,
            }

    # Sin match: el bloque anterior ya emitió y retornó. Con match: matched_order viene de exacto o fuzzy.

    # Enlazar (si el pedido ya estaba enlazado a otro driver, liberamos)
    if matched_order.matched_driver_arrival and matched_order.matched_driver_arrival.id != arrival.id:
        matched_order.matched_driver_arrival.estado = DRIVER_STATUS_ABANDONO
        matched_order.matched_driver_arrival.estado_changed_at = _utcnow()

    now = _utcnow()
    _apply_order_driver_match(matched_order, arrival, now)

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

    background_tasks.add_task(
        notify_runners_kiosk_match_sync,
        matched_order.id,
        arrival.id,
        plataforma,
        matched_order.codigo_pedido,
    )

    arrival.restaurant = rest
    return {
        "driver_arrival": driver_arrival_orm_to_dict(arrival),
        "matched": True,
        "matched_order": _load_order_dict(db, matched_order.id),
    }


@router.post("/kiosk/arrivals/{arrival_id}/photo", response_model=DriverArrivalOut)
async def kiosk_upload_driver_photo(
    arrival_id: int,
    conductor_dni: str = Form(
        "",
        description="Si el arribo es DNI, debe coincidir si se envía. Vacío: se usa el documento del arribo.",
    ),
    conductor_carne_extranjeria: str = Form(
        "",
        description="Si el arribo es CE, debe coincidir si se envía. Vacío: se usa el CE del arribo.",
    ),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Sube la foto del conductor al FileStore (público para el kiosk; valida documento vs fila)."""
    cfg = get_delivery_config(db)
    db.commit()
    if not cfg.enable_driver_photo_capture:
        raise HTTPException(status_code=403, detail="Captura de foto deshabilitada para este kiosko.")

    arrival = db.query(DriverArrival).filter(DriverArrival.id == arrival_id).first()
    if not arrival:
        raise HTTPException(status_code=404, detail="Registro de arribo no encontrado.")

    row_tipo = (arrival.conductor_documento_tipo or DRIVER_DOCUMENTO_TIPO_DNI).upper()
    if row_tipo not in (DRIVER_DOCUMENTO_TIPO_DNI, DRIVER_DOCUMENTO_TIPO_CE):
        row_tipo = DRIVER_DOCUMENTO_TIPO_DNI

    row_dni = re.sub(r"[\s-]", "", (arrival.conductor_dni or "").strip())
    row_ce = re.sub(r"[\s-]", "", (arrival.conductor_carne_extranjeria or "").strip().upper())
    form_dni = re.sub(r"[\s-]", "", (conductor_dni or "").strip())
    form_ce = re.sub(r"[\s-]", "", (conductor_carne_extranjeria or "").strip().upper())

    if row_tipo == DRIVER_DOCUMENTO_TIPO_CE:
        if row_ce:
            if form_ce:
                if not re.match(r"^[A-Z0-9]{4,20}$", form_ce):
                    raise HTTPException(status_code=400, detail="Carné de extranjería inválido.")
                if form_ce != row_ce:
                    raise HTTPException(
                        status_code=400,
                        detail="El carné de extranjería no coincide con el registro del conductor.",
                    )
                storage_stem = form_ce
            else:
                storage_stem = row_ce
        else:
            if form_ce and not re.match(r"^[A-Z0-9]{4,20}$", form_ce):
                raise HTTPException(status_code=400, detail="Carné de extranjería inválido.")
            storage_stem = form_ce if form_ce else "unknown"
    else:
        if row_dni:
            if form_dni:
                if not form_dni.isdigit() or len(form_dni) < 8 or len(form_dni) > 12:
                    raise HTTPException(status_code=400, detail="DNI inválido.")
                if form_dni != row_dni:
                    raise HTTPException(status_code=400, detail="El DNI no coincide con el registro del conductor.")
                storage_stem = form_dni
            else:
                storage_stem = row_dni
        else:
            if form_dni and (not form_dni.isdigit() or len(form_dni) < 8 or len(form_dni) > 12):
                raise HTTPException(status_code=400, detail="DNI inválido.")
            storage_stem = form_dni if form_dni else "unknown"

    content = await file.read()
    try:
        rel, mime = save_kiosk_driver_photo_file(storage_stem, content, content_type=file.content_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    arrival.foto_path = rel
    arrival.foto_mime = mime
    arrival.foto_uploaded_at = _utcnow()
    db.commit()
    db.refresh(arrival)
    return driver_arrival_orm_to_dict(arrival)


@router.post("/push/register", response_model=RunnerPushRegisterOut)
def register_runner_push_token(
    body: RunnerPushRegisterIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Asocia un token Expo Push al usuario autenticado (app Runner)."""
    _require_permission(current_user, "delivery:view")
    if body.app_slug != RUNNER_PUSH_APP_SLUG:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="app_slug no soportado")
    tok = body.expo_push_token
    if not tok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="token vacío")
    plat = (body.platform or "unknown").lower()
    if plat not in ("android", "ios", "web", "unknown"):
        plat = "unknown"
    row = db.query(DeliveryRunnerPushToken).filter(DeliveryRunnerPushToken.expo_push_token == tok).first()
    if row:
        row.user_id = current_user.id
        row.platform = plat
        row.is_active = True
    else:
        db.add(
            DeliveryRunnerPushToken(
                user_id=current_user.id,
                expo_push_token=tok,
                platform=plat,
                is_active=True,
            )
        )
    db.commit()
    logger.info("Runner push token registrado (user_id=%s, platform=%s)", current_user.id, plat)
    return RunnerPushRegisterOut()


@router.post("/push/unregister", response_model=RunnerPushRegisterOut)
def unregister_runner_push_token(
    body: RunnerPushUnregisterIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:view")
    if body.expo_push_token:
        row = (
            db.query(DeliveryRunnerPushToken)
            .filter(
                DeliveryRunnerPushToken.user_id == current_user.id,
                DeliveryRunnerPushToken.expo_push_token == body.expo_push_token,
            )
            .first()
        )
        if row:
            row.is_active = False
    else:
        db.query(DeliveryRunnerPushToken).filter(DeliveryRunnerPushToken.user_id == current_user.id).update(
            {"is_active": False},
            synchronize_session=False,
        )
    db.commit()
    return RunnerPushRegisterOut()


@router.get("/runner/notifications", response_model=List[RunnerNotificationOut])
def list_runner_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=200),
):
    """Historial de avisos operativos para el usuario Runner (alineado con push)."""
    _require_permission(current_user, "delivery:view")
    rows = (
        db.query(RunnerNotification)
        .filter(RunnerNotification.user_id == current_user.id)
        .order_by(RunnerNotification.created_at.desc())
        .limit(limit)
        .all()
    )
    return rows


@router.patch("/runner/notifications/read-all", response_model=RunnerPushRegisterOut)
def runner_notifications_mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:view")
    mark_all_runner_notifications_read(db, current_user.id)
    db.commit()
    return RunnerPushRegisterOut()


@router.delete("/runner/notifications", response_model=RunnerPushRegisterOut)
def runner_notifications_clear_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Elimina todas las filas de bandeja del usuario (acción «Vaciar» en app)."""
    _require_permission(current_user, "delivery:view")
    delete_all_runner_notifications_for_user(db, current_user.id)
    db.commit()
    return RunnerPushRegisterOut()


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
        .options(
            joinedload(Order.matched_driver_arrival),
            joinedload(Order.restaurant),
            joinedload(Order.locked_by_runner),
        )
        .filter(Order.estado.notin_([ORDER_STATUS_ENTREGADO, ORDER_STATUS_CANCELADO]))
        .order_by(Order.id.desc())
        .limit(DEFAULT_QUERY_LIMIT)
        .all()
    )
    return _orders_to_dicts(orders)


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
    order = (
        db.query(Order)
        .options(
            joinedload(Order.matched_driver_arrival),
            joinedload(Order.restaurant),
            joinedload(Order.locked_by_runner),
        )
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return order_orm_to_dict(order)


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
        .options(joinedload(DriverArrival.restaurant))
        .filter(DriverArrival.estado.in_([DRIVER_STATUS_ESPERANDO, DRIVER_STATUS_EN_MATCH]))
        .order_by(DriverArrival.id.desc())
        .limit(DEFAULT_QUERY_LIMIT)
        .all()
    )
    return [driver_arrival_orm_to_dict(d) for d in drivers]


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
        .options(joinedload(DriverArrival.restaurant))
        .filter(DriverArrival.estado.in_([DRIVER_STATUS_ESPERANDO, DRIVER_STATUS_EN_MATCH]))
        .order_by(DriverArrival.id.desc())
        .limit(DEFAULT_QUERY_LIMIT)
        .all()
    )
    return [driver_arrival_orm_to_dict(d) for d in drivers]


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
    delivered_ts = sql_func.coalesce(Order.entregado_at, Order.estado_changed_at)
    orders = (
        db.query(Order)
        .join(Restaurant, Order.restaurant_id == Restaurant.id)
        .options(
            contains_eager(Order.restaurant),
            joinedload(Order.matched_driver_arrival),
            joinedload(Order.locked_by_runner),
        )
        .filter(
            Order.estado == ORDER_STATUS_ENTREGADO,
            delivered_ts.isnot(None),
            delivered_ts >= start_utc,
            delivered_ts < end_utc,
        )
        .order_by(delivered_ts.desc(), Order.id.desc())
        .limit(DEFAULT_QUERY_LIMIT)
        .all()
    )
    return _orders_to_dicts(orders)


@router.get("/kiosk/orders/delivered", response_model=List[OrderOut])
async def kiosk_list_delivered_orders_by_date(
    date: Optional[str] = Query(
        default=None,
        description="Fecha Lima en formato YYYY-MM-DD. Si no se indica, devuelve el día actual.",
    ),
    db: Session = Depends(get_db),
):
    """
    Endpoint público para Kiosk/Runner (sin JWT).
    Retorna pedidos ENTREGADO de la fecha indicada (zona Lima), ordenados por más recientes.
    Si `date` no se provee o es None, equivale al día actual (igual que /today).
    """
    timeouts_res = apply_timeouts(db)
    if timeouts_res.get("expired_orders") or timeouts_res.get("expired_drivers"):
        await _emit(EVENT_TIMEOUTS_APPLIED, timeouts_res)

    if date:
        start_utc, end_utc = _lima_date_range_utc(date)
    else:
        start_utc, end_utc = _lima_today_range_utc()

    delivered_ts = sql_func.coalesce(Order.entregado_at, Order.estado_changed_at)
    orders = (
        db.query(Order)
        .join(Restaurant, Order.restaurant_id == Restaurant.id)
        .options(
            contains_eager(Order.restaurant),
            joinedload(Order.matched_driver_arrival),
            joinedload(Order.locked_by_runner),
        )
        .filter(
            Order.estado == ORDER_STATUS_ENTREGADO,
            delivered_ts.isnot(None),
            delivered_ts >= start_utc,
            delivered_ts < end_utc,
        )
        .order_by(delivered_ts.desc(), Order.id.desc())
        .limit(DEFAULT_QUERY_LIMIT)
        .all()
    )
    return _orders_to_dicts(orders)


@router.post("/orders/{order_id}/manual-match", response_model=KioskArrivalResult)
async def manual_match_order(
    order_id: int,
    payload: ManualMatchIn,
    background_tasks: BackgroundTasks,
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
    if (
        order.restaurant_id is not None
        and arrival.restaurant_id is not None
        and order.restaurant_id != arrival.restaurant_id
    ):
        raise HTTPException(
            status_code=400,
            detail="Pedido y llegada de driver no pertenecen al mismo restaurante",
        )

    # Si el pedido estaba enlazado, liberamos
    if order.matched_driver_arrival and order.matched_driver_arrival.id != arrival.id:
        order.matched_driver_arrival.estado = DRIVER_STATUS_ABANDONO
        order.matched_driver_arrival.estado_changed_at = _utcnow()

    # Si el driver estaba enlazado a otro pedido, liberamos ese pedido (lo dejamos en LISTO)
    if arrival.matched_order and arrival.matched_order.id != order.id:
        arrival.matched_order.estado = ORDER_STATUS_LISTO
        arrival.matched_order.estado_changed_at = _utcnow()

    now = _utcnow()
    _apply_order_driver_match(order, arrival, now)

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

    background_tasks.add_task(
        notify_runners_kiosk_match_sync,
        order.id,
        arrival.id,
        order.plataforma,
        order.codigo_pedido,
    )

    return {
        "driver_arrival": driver_arrival_orm_to_dict(arrival),
        "matched": True,
        "matched_order": _load_order_dict(db, order.id),
    }


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
    return _load_order_dict(db, order.id)


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

    t_shelf = _utcnow()
    order.estado = ORDER_STATUS_PROCESO_ENTREGA
    order.estado_changed_at = t_shelf
    order.recogido_at = t_shelf
    db.commit()
    db.refresh(order)
    await _emit(
        EVENT_ORDER_UPDATED,
        {"order_id": order.id, "estado": order.estado, "source": "runner_shelf"},
    )
    return _load_order_dict(db, order.id)


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
    order.entregado_at = now

    if order.matched_driver_arrival:
        order.matched_driver_arrival.estado = DRIVER_STATUS_DESPACHADO
        order.matched_driver_arrival.estado_changed_at = now
        order.matched_driver_arrival.despachado_at = now

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
    return _load_order_dict(db, order.id)


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


def _admin_orders_query(
    db: Session,
    *,
    status: Optional[str] = None,
    codigo: Optional[str] = None,
    plataforma: Optional[str] = None,
    restaurant_nombre: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
):
    q = (
        db.query(Order)
        .options(
            joinedload(Order.matched_driver_arrival),
            joinedload(Order.restaurant),
            joinedload(Order.locked_by_runner),
        )
    )
    start_utc, end_utc = _lima_created_at_bounds_utc(fecha_desde, fecha_hasta)
    if start_utc is not None:
        q = q.filter(Order.created_at >= start_utc)
    if end_utc is not None:
        q = q.filter(Order.created_at < end_utc)
    if status:
        q = q.filter(Order.estado == status.strip().upper())
    if codigo:
        term = codigo.strip()
        if term:
            q = q.filter(Order.codigo_pedido.ilike(f"%{term}%"))
    if plataforma:
        plat = plataforma.strip().upper()
        if plat:
            q = q.filter(Order.plataforma == plat)
    if restaurant_nombre:
        loc = restaurant_nombre.strip()
        if loc:
            q = q.join(Restaurant, Order.restaurant_id == Restaurant.id).filter(Restaurant.nombre == loc)
    return q


@router.get("/admin/orders", response_model=PaginatedOrders)
async def admin_list_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=DEFAULT_QUERY_LIMIT),
    codigo: Optional[str] = None,
    plataforma: Optional[str] = None,
    restaurant_nombre: Optional[str] = None,
    fecha_desde: Optional[str] = Query(
        default=None,
        description="Fecha inicio (YYYY-MM-DD, America/Lima) sobre created_at del pedido.",
    ),
    fecha_hasta: Optional[str] = Query(
        default=None,
        description="Fecha fin inclusive (YYYY-MM-DD, America/Lima) sobre created_at del pedido.",
    ),
):
    """Listado paginado de pedidos (más recientes primero por registro)."""
    _require_permission(current_user, "delivery:admin")
    apply_timeouts(db)
    q = _admin_orders_query(
        db,
        codigo=codigo,
        plataforma=plataforma,
        restaurant_nombre=restaurant_nombre,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )
    total = q.count()
    orders = q.order_by(Order.created_at.desc(), Order.id.desc()).offset(skip).limit(limit).all()
    return PaginatedOrders(
        items=_orders_to_dicts(orders),
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/admin/orders/by-status/{status}", response_model=PaginatedOrders)
async def admin_list_orders_by_status(
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=DEFAULT_QUERY_LIMIT),
    codigo: Optional[str] = None,
    plataforma: Optional[str] = None,
    restaurant_nombre: Optional[str] = None,
    fecha_desde: Optional[str] = Query(default=None, description="YYYY-MM-DD (America/Lima)"),
    fecha_hasta: Optional[str] = Query(default=None, description="YYYY-MM-DD inclusive (America/Lima)"),
):
    _require_permission(current_user, "delivery:admin")
    apply_timeouts(db)
    q = _admin_orders_query(
        db,
        status=status,
        codigo=codigo,
        plataforma=plataforma,
        restaurant_nombre=restaurant_nombre,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
    )
    total = q.count()
    orders = q.order_by(Order.created_at.desc(), Order.id.desc()).offset(skip).limit(limit).all()
    return PaginatedOrders(
        items=_orders_to_dicts(orders),
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/admin/metrics", response_model=DeliveryMetricsOut)
async def admin_delivery_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    fecha_desde: str = Query(..., description="YYYY-MM-DD (America/Lima), inclusive"),
    fecha_hasta: str = Query(..., description="YYYY-MM-DD (America/Lima), inclusive"),
    dimension: str = Query("estado", description="estado|locatario|plataforma|driver|runner"),
    estado: Optional[str] = Query(default=None),
    locatario: Optional[str] = Query(default=None),
    plataforma: Optional[str] = Query(default=None),
    driver: Optional[str] = Query(default=None),
    runner: Optional[str] = Query(default=None),
):
    """
    Métricas agregadas en servidor para Dashboard Delivery.
    Sin límite de filas al cliente: el rango de fechas acota la consulta.
    """
    _require_permission(current_user, "delivery:admin")
    apply_timeouts(db)
    start_utc, end_utc = _lima_created_at_bounds_utc(fecha_desde, fecha_hasta)
    if start_utc is None or end_utc is None:
        raise HTTPException(status_code=422, detail="fecha_desde y fecha_hasta son requeridas")
    payload = compute_delivery_metrics(
        db,
        start_utc=start_utc,
        end_utc=end_utc,
        dimension=dimension,
        estado=estado or None,
        locatario=locatario or None,
        plataforma=plataforma or None,
        driver=driver or None,
        runner=runner or None,
    )
    return DeliveryMetricsOut(
        fecha_desde=fecha_desde.strip(),
        fecha_hasta=fecha_hasta.strip(),
        **payload,
    )


_DRIVER_PHOTO_REL_PREFIX = "delivery/driver_photos/"


@router.get("/admin/driver-arrivals/{arrival_id}/photo-file")
async def admin_driver_arrival_photo_file(
    arrival_id: int,
    token: str = Depends(oauth2_scheme),
):
    """
    Sirve el archivo de foto del conductor (kiosk) para el panel admin.
    Solo `delivery:admin`; ruta acotada bajo delivery/driver_photos/.
    """
    with db_session() as db:
        user = authenticate_token(db, token)
        _require_permission(user, "delivery:admin")
        arrival = db.query(DriverArrival).filter(DriverArrival.id == arrival_id).first()
        if not arrival:
            raise HTTPException(status_code=404, detail="Arribo no encontrado")
        rel = (arrival.foto_path or "").strip().replace("\\", "/")
        if not rel or ".." in rel or rel.startswith("/"):
            raise HTTPException(status_code=404, detail="Sin foto registrada")
        if not rel.startswith(_DRIVER_PHOTO_REL_PREFIX):
            raise HTTPException(status_code=400, detail="Ruta de archivo no permitida")
        base = get_upload_base().resolve()
        abs_path = (base / rel).resolve()
        try:
            abs_path.relative_to(base)
        except ValueError:
            raise HTTPException(status_code=400, detail="Ruta inválida")
        if not abs_path.is_file():
            raise HTTPException(status_code=404, detail="Archivo no encontrado")
        media = (arrival.foto_mime or "application/octet-stream").split(";")[0].strip()
        return FileResponse(abs_path, media_type=media, filename=abs_path.name)


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

    t_dev = _utcnow()
    order.estado = ORDER_STATUS_DEVOLUCION
    order.estado_changed_at = t_dev
    order.devolucion_at = t_dev
    db.commit()
    db.refresh(order)
    await _emit(EVENT_ORDER_UPDATED, {"order_id": order.id, "estado": order.estado, "source": "admin_mark_devolucion"})
    return _load_order_dict(db, order.id)


@router.post("/admin/orders/{order_id}/force-entregado", response_model=OrderOut)
async def admin_force_entregado(
    order_id: int,
    payload: AdminForceEntregadoIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cierra el pedido como ENTREGADO sin exigir driver matcheado.
    Si ya hay match activo, despacha al conductor igual que el flujo runner.
    Requiere motivo (auditoría). Solo `delivery:admin`.
    """
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
    if order.estado in [ORDER_STATUS_ENTREGADO, ORDER_STATUS_CANCELADO, ORDER_STATUS_DEVOLUCION]:
        raise HTTPException(status_code=400, detail="Pedido no puede cerrarse como entregado por estado")

    arrival = (
        db.query(DriverArrival)
        .filter(DriverArrival.matched_order_id == order.id)
        .with_for_update(skip_locked=True)
        .first()
    )

    now = _utcnow()
    had_match = arrival is not None
    order.estado = ORDER_STATUS_ENTREGADO
    order.estado_changed_at = now
    order.entregado_at = now
    order.locked_by_runner_id = None
    if arrival and arrival.estado == DRIVER_STATUS_EN_MATCH:
        arrival.estado = DRIVER_STATUS_DESPACHADO
        arrival.estado_changed_at = now
        arrival.despachado_at = now

    db.commit()
    db.refresh(order)
    await _emit(
        EVENT_ORDER_UPDATED,
        {
            "order_id": order.id,
            "estado": order.estado,
            "source": "admin_force_entregado",
            "reason": payload.reason,
            "note": payload.note,
            "without_match": not had_match,
            "admin_user_id": current_user.id,
        },
    )
    if arrival and arrival.estado == DRIVER_STATUS_DESPACHADO:
        await _emit(
            EVENT_DRIVER_UPDATED,
            {
                "driver_arrival_id": arrival.id,
                "estado": arrival.estado,
                "source": "admin_force_entregado",
            },
        )
    return _load_order_dict(db, order.id)


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

    t_can = _utcnow()
    order.estado = ORDER_STATUS_CANCELADO
    order.estado_changed_at = t_can
    order.cancelado_at = t_can
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
    return _load_order_dict(db, order.id)


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
    return _load_order_dict(db, order.id)


def _normalize_notification_email(email: str) -> str:
    return str(email).strip().lower()


def _load_restaurant_admin(db: Session, restaurant_id: int) -> Restaurant:
    r = (
        db.query(Restaurant)
        .options(joinedload(Restaurant.notification_emails))
        .filter(Restaurant.id == restaurant_id)
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Restaurante no encontrado")
    return r


@router.get("/admin/restaurants", response_model=List[RestaurantAdminOut])
async def admin_list_restaurants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:admin")
    rows = (
        db.query(Restaurant)
        .options(joinedload(Restaurant.notification_emails))
        .order_by(Restaurant.nombre.asc())
        .all()
    )
    return rows


@router.get("/admin/restaurants/{restaurant_id}", response_model=RestaurantAdminOut)
async def admin_get_restaurant(
    restaurant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:admin")
    return _load_restaurant_admin(db, restaurant_id)


@router.post("/admin/restaurants", response_model=RestaurantAdminOut)
async def admin_create_restaurant(
    payload: RestaurantCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:admin")
    fid = payload.fidelio_id.strip()
    nombre = payload.nombre.strip()
    if not fid or not nombre:
        raise HTTPException(status_code=400, detail="fidelio_id y nombre son obligatorios")
    if db.query(Restaurant).filter(Restaurant.fidelio_id == fid).first():
        raise HTTPException(status_code=409, detail="Ya existe un restaurante con ese fidelio_id")

    cn = payload.codigo_negocio
    cc = payload.codigo_comunicacion
    r = Restaurant(
        fidelio_id=fid,
        nombre=nombre,
        is_active=payload.is_active,
        codigo_negocio=(cn.strip() if isinstance(cn, str) and cn.strip() else None),
        codigo_comunicacion=(cc.strip() if isinstance(cc, str) and cc.strip() else None),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _load_restaurant_admin(db, r.id)


@router.patch("/admin/restaurants/{restaurant_id}", response_model=RestaurantAdminOut)
async def admin_update_restaurant(
    restaurant_id: int,
    payload: RestaurantUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:admin")
    r = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Restaurante no encontrado")

    if payload.fidelio_id is not None:
        nf = payload.fidelio_id.strip()
        if not nf:
            raise HTTPException(status_code=400, detail="fidelio_id no puede quedar vacío")
        dup = (
            db.query(Restaurant)
            .filter(Restaurant.fidelio_id == nf, Restaurant.id != restaurant_id)
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Ya existe otro restaurante con ese fidelio_id")
        r.fidelio_id = nf

    if payload.nombre is not None:
        nn = payload.nombre.strip()
        if not nn:
            raise HTTPException(status_code=400, detail="nombre no puede quedar vacío")
        r.nombre = nn

    if payload.is_active is not None:
        r.is_active = payload.is_active

    if payload.codigo_negocio is not None:
        s = payload.codigo_negocio.strip() if payload.codigo_negocio else ""
        r.codigo_negocio = s or None

    if payload.codigo_comunicacion is not None:
        s = payload.codigo_comunicacion.strip() if payload.codigo_comunicacion else ""
        r.codigo_comunicacion = s or None

    db.commit()
    return _load_restaurant_admin(db, restaurant_id)


@router.post(
    "/admin/restaurants/{restaurant_id}/notification-emails",
    response_model=RestaurantNotificationEmailOut,
)
async def admin_add_restaurant_notification_email(
    restaurant_id: int,
    payload: RestaurantNotificationEmailCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:admin")
    if not db.query(Restaurant).filter(Restaurant.id == restaurant_id).first():
        raise HTTPException(status_code=404, detail="Restaurante no encontrado")

    norm = _normalize_notification_email(str(payload.email))
    if not norm:
        raise HTTPException(status_code=400, detail="Correo inválido")

    exists = (
        db.query(RestaurantNotificationEmail)
        .filter(
            RestaurantNotificationEmail.restaurant_id == restaurant_id,
            sql_func.lower(RestaurantNotificationEmail.email) == norm,
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="Ese correo ya está registrado para este restaurante")

    row = RestaurantNotificationEmail(restaurant_id=restaurant_id, email=norm)
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ese correo ya está registrado para este restaurante")
    db.refresh(row)
    return row


@router.delete(
    "/admin/restaurants/{restaurant_id}/notification-emails/{email_row_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def admin_delete_restaurant_notification_email(
    restaurant_id: int,
    email_row_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:admin")
    row = (
        db.query(RestaurantNotificationEmail)
        .filter(
            RestaurantNotificationEmail.id == email_row_id,
            RestaurantNotificationEmail.restaurant_id == restaurant_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Correo no encontrado")
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/kiosk-config", response_model=AdminAppConfigOut)
def admin_get_kiosk_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:admin")
    cfg = get_delivery_config(db)
    db.commit()
    return AdminAppConfigOut(
        enable_driver_dni_lookup=bool(cfg.enable_driver_dni_lookup),
        enable_driver_photo_capture=bool(cfg.enable_driver_photo_capture),
        enable_runner_simulate_order_ready=bool(cfg.enable_runner_simulate_order_ready),
    )


@router.patch("/admin/kiosk-config", response_model=AdminAppConfigOut)
def admin_patch_kiosk_config(
    payload: KioskConfigPatchIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_permission(current_user, "delivery:settings:update")
    cfg = get_delivery_config(db)
    if payload.enable_driver_dni_lookup is not None:
        cfg.enable_driver_dni_lookup = payload.enable_driver_dni_lookup
    if payload.enable_driver_photo_capture is not None:
        cfg.enable_driver_photo_capture = payload.enable_driver_photo_capture
    if payload.enable_runner_simulate_order_ready is not None:
        cfg.enable_runner_simulate_order_ready = payload.enable_runner_simulate_order_ready
    db.commit()
    db.refresh(cfg)
    return AdminAppConfigOut(
        enable_driver_dni_lookup=bool(cfg.enable_driver_dni_lookup),
        enable_driver_photo_capture=bool(cfg.enable_driver_photo_capture),
        enable_runner_simulate_order_ready=bool(cfg.enable_runner_simulate_order_ready),
    )
