import re
from datetime import date, time
from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.auth import User
from app.models.sisa_reservas import (
    SisaReservaMesa,
    SisaReservaRegistro,
    SisaReservaZona,
    SisaReservasNotificacionesConfig,
)
from app.schemas.sisa_reservas import (
    PaginatedSisaReservas,
    SisaPublicPlanoOut,
    SisaPublicReservaCreate,
    SisaReservaEstadoPatch,
    SisaReservaMesaCreate,
    SisaReservaMesaOut,
    SisaReservaMesaUpdate,
    SisaReservaPlanoOut,
    SisaReservaRegistroCreate,
    SisaReservaRegistroOut,
    SisaReservaRegistroUpdate,
    SisaReservaWhatsAppIn,
    SisaReservaWhatsAppOut,
    SisaReservaZonaCreate,
    SisaReservaZonaOut,
    SisaReservaZonaUpdate,
    SisaReservasKpisOut,
    SisaReservasNotificacionesConfigOut,
    SisaReservasNotificacionesConfigUpdate,
    SisaReservasNotificacionesDisparoOut,
)
from app.services import sisa_reservas_notifications as sisa_notif
from app.services import sisa_reservas_service as svc
from app.services.sisa_reservas_notifications_scheduler import refresh_sisa_reservas_notifications_job

router = APIRouter(prefix="/sisa-reservas", tags=["Sisa Reservas"])

DEFAULT_LIMIT = 50
MAX_LIMIT = 500


def _user_has_permission(user: User, codename: str) -> bool:
    try:
        for role in getattr(user, "roles", []) or []:
            for perm in getattr(role, "permissions", []) or []:
                if getattr(perm, "codename", None) == codename:
                    return True
    except Exception:
        return False
    return False


def _require_view(current_user: User) -> None:
    if current_user.is_superuser:
        return
    if not _user_has_permission(current_user, "sisa_reservas:view"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos")


def _require_manage(current_user: User) -> None:
    if current_user.is_superuser:
        return
    if not _user_has_permission(current_user, "sisa_reservas:manage"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos de gestión")


def _normalize_e164(codigo: str, numero: str) -> str:
    cc = re.sub(r"\D", "", codigo or "")
    nd = re.sub(r"\D", "", numero or "")
    return cc + nd


# --- Zonas ---


@router.get("/zonas", response_model=List[SisaReservaZonaOut])
def list_zonas(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    rows = db.query(SisaReservaZona).order_by(SisaReservaZona.sort_order, SisaReservaZona.id).all()
    return rows


@router.post("/zonas", response_model=SisaReservaZonaOut)
def create_zona(
    body: SisaReservaZonaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = SisaReservaZona(**body.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/zonas/{zona_id}", response_model=SisaReservaZonaOut)
def update_zona(
    zona_id: int,
    body: SisaReservaZonaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(SisaReservaZona).filter(SisaReservaZona.id == zona_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    data = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/zonas/{zona_id}")
def delete_zona(
    zona_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(SisaReservaZona).filter(SisaReservaZona.id == zona_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    db.delete(row)
    db.commit()
    return {"ok": True}


# --- Mesas ---


@router.get("/mesas", response_model=List[SisaReservaMesaOut])
def list_mesas(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    zona_id: Optional[int] = None,
):
    _require_view(current_user)
    q = db.query(SisaReservaMesa)
    if zona_id is not None:
        q = q.filter(SisaReservaMesa.zona_id == zona_id)
    return q.order_by(SisaReservaMesa.zona_id, SisaReservaMesa.numero).all()


@router.post("/mesas", response_model=SisaReservaMesaOut)
def create_mesa(
    body: SisaReservaMesaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    z = db.query(SisaReservaZona).filter(SisaReservaZona.id == body.zona_id).first()
    if not z:
        raise HTTPException(status_code=400, detail="zona_id no existe")
    row = SisaReservaMesa(**body.dict())
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="No se pudo crear la mesa (¿número duplicado en la zona?)")
    db.refresh(row)
    return row


@router.put("/mesas/{mesa_id}", response_model=SisaReservaMesaOut)
def update_mesa(
    mesa_id: int,
    body: SisaReservaMesaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(SisaReservaMesa).filter(SisaReservaMesa.id == mesa_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
    data = body.dict(exclude_unset=True)
    if "zona_id" in data and data["zona_id"] is not None:
        z = db.query(SisaReservaZona).filter(SisaReservaZona.id == data["zona_id"]).first()
        if not z:
            raise HTTPException(status_code=400, detail="zona_id no existe")
    for k, v in data.items():
        setattr(row, k, v)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="No se pudo actualizar la mesa")
    db.refresh(row)
    return row


@router.delete("/mesas/{mesa_id}")
def delete_mesa(
    mesa_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(SisaReservaMesa).filter(SisaReservaMesa.id == mesa_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
    db.delete(row)
    db.commit()
    return {"ok": True}


# --- Reservas ---


@router.get("/reservas", response_model=PaginatedSisaReservas)
def list_reservas(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    nombre: Optional[str] = None,
    fecha: Optional[date] = None,
    estado: Optional[str] = None,
    zona_id: Optional[int] = None,
):
    _require_view(current_user)
    total, rows = svc.list_reservas_query(db, skip, limit, nombre, fecha, estado, zona_id)
    return PaginatedSisaReservas(
        total=total,
        items=[SisaReservaRegistroOut.from_orm(r) for r in rows],
    )


@router.post("/reservas", response_model=SisaReservaRegistroOut)
def create_reserva(
    body: SisaReservaRegistroCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    try:
        svc.validate_reserva_mesa_zona(db, body.zona_id, body.mesa_id)
        svc.validate_reserva_disponibilidad(
            db,
            body.fecha_reserva,
            body.hora_reserva,
            body.zona_id,
            body.mesa_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    row = SisaReservaRegistro(**body.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/reservas/{reserva_id}", response_model=SisaReservaRegistroOut)
def update_reserva(
    reserva_id: int,
    body: SisaReservaRegistroUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(SisaReservaRegistro).filter(SisaReservaRegistro.id == reserva_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    data = body.dict(exclude_unset=True)
    new_zona = data.get("zona_id", row.zona_id)
    new_mesa = data.get("mesa_id", row.mesa_id)
    if "mesa_id" in data and data["mesa_id"] is None:
        new_mesa = None
    new_fecha = data.get("fecha_reserva", row.fecha_reserva)
    new_hora = data.get("hora_reserva", row.hora_reserva)
    try:
        svc.validate_reserva_mesa_zona(db, new_zona, new_mesa)
        svc.validate_reserva_disponibilidad(
            db,
            new_fecha,
            new_hora,
            new_zona,
            new_mesa,
            exclude_reserva_id=row.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if "fecha_reserva" in data or "hora_reserva" in data:
        row.proximity_webhook_sent_at = None
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/reservas/{reserva_id}")
def delete_reserva(
    reserva_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(SisaReservaRegistro).filter(SisaReservaRegistro.id == reserva_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.patch("/reservas/{reserva_id}/estado", response_model=SisaReservaRegistroOut)
def patch_reserva_estado(
    reserva_id: int,
    body: SisaReservaEstadoPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(SisaReservaRegistro).filter(SisaReservaRegistro.id == reserva_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    row.estado = body.estado
    db.commit()
    db.refresh(row)
    return row


@router.get("/plano", response_model=SisaReservaPlanoOut)
def get_plano(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    fecha: date = Query(...),
    hora: time = Query(...),
):
    _require_view(current_user)
    return svc.build_plano(db, fecha, hora)


@router.get("/dashboard/kpis", response_model=SisaReservasKpisOut)
def get_kpis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    return svc.build_kpis(db)


@router.post("/whatsapp/send", response_model=SisaReservaWhatsAppOut)
def whatsapp_build_url(
    body: SisaReservaWhatsAppIn,
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    phone = _normalize_e164(body.codigo_telefonico, body.numero_telefono)
    if len(phone) < 10:
        raise HTTPException(status_code=400, detail="Número telefónico inválido")
    encoded = quote(body.message, safe="")
    url = f"https://wa.me/{phone}?text={encoded}"
    return SisaReservaWhatsAppOut(wa_url=url, phone_e164_digits=phone)


@router.get("/public/plano", response_model=SisaPublicPlanoOut)
def public_get_plano(
    db: Session = Depends(get_db),
    fecha: date = Query(...),
    hora: time = Query(...),
):
    return svc.build_plano_public(db, fecha, hora)


@router.post("/public/reservas", response_model=SisaReservaRegistroOut)
def public_create_reserva(body: SisaPublicReservaCreate, db: Session = Depends(get_db)):
    try:
        svc.validate_reserva_mesa_zona(db, body.zona_id, body.mesa_id)
        svc.validate_reserva_disponibilidad(
            db,
            body.fecha_reserva,
            body.hora_reserva,
            body.zona_id,
            body.mesa_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    row = SisaReservaRegistro(**{**body.dict(), "estado": "pendiente"})
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# --- Notificaciones webhook (reservas próximas → n8n) ---


@router.get("/notificaciones-config", response_model=SisaReservasNotificacionesConfigOut)
def get_sisa_notificaciones_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    d = sisa_notif.get_notificaciones_config_dict(db)
    return SisaReservasNotificacionesConfigOut(**d)


@router.patch("/notificaciones-config", response_model=SisaReservasNotificacionesConfigOut)
def patch_sisa_notificaciones_config(
    body: SisaReservasNotificacionesConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    sisa_notif.ensure_sisa_notificaciones_config_table(db)

    row = db.get(SisaReservasNotificacionesConfig, 1)
    if row is None:
        row = SisaReservasNotificacionesConfig(id=1, schedule_enabled=False)
        db.add(row)
        db.flush()
    data = body.dict(exclude_unset=True)
    if "schedule_enabled" in data:
        row.schedule_enabled = bool(data["schedule_enabled"])
    if "schedule_interval_minutes" in data and data["schedule_interval_minutes"] is not None:
        row.schedule_interval_minutes = int(data["schedule_interval_minutes"])
    if "anticipation_minutes" in data and data["anticipation_minutes"] is not None:
        row.anticipation_minutes = int(data["anticipation_minutes"])
    if "include_confirmados" in data:
        row.include_confirmados = bool(data["include_confirmados"])
    if "n8n_webhook_url" in data:
        u = data["n8n_webhook_url"]
        row.n8n_webhook_url = (u.strip() if isinstance(u, str) else None) or None
    if "n8n_webhook_secret" in data:
        s = data["n8n_webhook_secret"]
        if s is None or (isinstance(s, str) and not s.strip()):
            row.n8n_webhook_secret = None
        elif isinstance(s, str):
            row.n8n_webhook_secret = s.strip()
    db.commit()
    db.refresh(row)
    refresh_sisa_reservas_notifications_job()
    return SisaReservasNotificacionesConfigOut(**sisa_notif.get_notificaciones_config_dict(db))


@router.post("/notificaciones/disparar", response_model=SisaReservasNotificacionesDisparoOut)
def disparar_sisa_notificaciones(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    out = sisa_notif.ejecutar_envio_proximidad(db, trigger="manual")
    return SisaReservasNotificacionesDisparoOut(
        ok=bool(out.get("ok")),
        enviado=bool(out.get("enviado")),
        items=int(out.get("items") or 0),
        error=out.get("error"),
        razon=out.get("razon"),
    )
