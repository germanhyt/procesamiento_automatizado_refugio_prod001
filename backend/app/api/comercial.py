import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, extract, func
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.auth import User
from app.models.comercial import ComercialEvento, ComercialReserva
from app.schemas.comercial import (
    ComercialEventoCreate,
    ComercialEventoOut,
    ComercialEventoUpdate,
    ComercialReservaCreate,
    ComercialReservaOut,
    ComercialReservaUpdate,
    EstadoPatch,
    EstadoCount,
    EventosAnalyticsOut,
    MonthlyCount,
    PaginatedEventos,
    PaginatedReservas,
    PersonasRangeCount,
    ReservasAnalyticsOut,
    TipoEventoAvg,
    TipoEventoCount,
    WhatsAppSendIn,
    WhatsAppSendOut,
)

router = APIRouter(prefix="/comercial", tags=["Comercial"])

DEFAULT_LIMIT = 50
# Tablas admin del SPA piden hasta 500 filas por vista; mantener acorde con listReservas/listEventos.
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
    if not _user_has_permission(current_user, "comercial:view"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos")


def _require_manage(current_user: User) -> None:
    if current_user.is_superuser:
        return
    if not _user_has_permission(current_user, "comercial:manage"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tiene permisos de gestión comercial")


def _normalize_pe_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 9:
        return "51" + digits
    return digits


_MESES_ES = (
    "",
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)


def _month_label(y: int, m: int) -> str:
    if 1 <= m <= 12:
        return f"{_MESES_ES[m].capitalize()} {y}"
    return f"{m}/{y}"


def _reserva_personas_rango_expr():
    return case(
        (ComercialReserva.cantidad_personas <= 2, "1–2"),
        (ComercialReserva.cantidad_personas <= 4, "3–4"),
        (ComercialReserva.cantidad_personas <= 8, "5–8"),
        else_="9+",
    )


def _dd_mm_yyyy_sort_key(column):
    """Clave ordenable YYYYMMDD a partir de texto DD/MM/YYYY."""
    return func.concat(
        func.split_part(column, "/", 3),
        func.lpad(func.split_part(column, "/", 2), 2, "0"),
        func.lpad(func.split_part(column, "/", 1), 2, "0"),
    )


@router.get("/reservas", response_model=PaginatedReservas)
def list_reservas(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    estado: Optional[str] = None,
    buscar: Optional[str] = None,
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
):
    _require_view(current_user)
    q = db.query(ComercialReserva)
    if estado:
        q = q.filter(ComercialReserva.estado == estado)
    if buscar:
        term = f"%{buscar.strip()}%"
        q = q.filter(
            (ComercialReserva.nombres.ilike(term)) | (ComercialReserva.celular.ilike(term))
        )
    if desde:
        q = q.filter(ComercialReserva.fecha_creacion >= desde)
    if hasta:
        q = q.filter(ComercialReserva.fecha_creacion <= hasta)
    total = q.count()
    rows = (
        q.order_by(
            _dd_mm_yyyy_sort_key(ComercialReserva.fecha_reserva).desc(),
            ComercialReserva.hora_reserva.desc(),
            ComercialReserva.id.desc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )
    return PaginatedReservas(
        items=[ComercialReservaOut.from_orm(r) for r in rows],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/reservas/{reserva_id}", response_model=ComercialReservaOut)
def get_reserva(
    reserva_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    row = db.query(ComercialReserva).filter(ComercialReserva.id == reserva_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    return ComercialReservaOut.from_orm(row)


@router.post("/reservas", response_model=ComercialReservaOut)
def create_reserva(
    body: ComercialReservaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    data = body.dict(exclude_unset=True)
    fc = data.pop("fecha_creacion", None)
    row = ComercialReserva(**data)
    if fc is not None:
        row.fecha_creacion = fc.replace(tzinfo=timezone.utc) if fc.tzinfo is None else fc
    db.add(row)
    db.commit()
    db.refresh(row)
    return ComercialReservaOut.from_orm(row)


@router.put("/reservas/{reserva_id}", response_model=ComercialReservaOut)
def update_reserva(
    reserva_id: int,
    body: ComercialReservaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(ComercialReserva).filter(ComercialReserva.id == reserva_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    for k, v in body.dict(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return ComercialReservaOut.from_orm(row)


@router.delete("/reservas/{reserva_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reserva(
    reserva_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(ComercialReserva).filter(ComercialReserva.id == reserva_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    db.delete(row)
    db.commit()
    return None


@router.patch("/reservas/{reserva_id}/estado", response_model=ComercialReservaOut)
def patch_reserva_estado(
    reserva_id: int,
    body: EstadoPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(ComercialReserva).filter(ComercialReserva.id == reserva_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    row.estado = body.estado
    db.commit()
    db.refresh(row)
    return ComercialReservaOut.from_orm(row)


@router.get("/eventos", response_model=PaginatedEventos)
def list_eventos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    estado: Optional[str] = None,
    tipo_evento: Optional[str] = None,
    buscar: Optional[str] = None,
    desde: Optional[datetime] = None,
    hasta: Optional[datetime] = None,
):
    _require_view(current_user)
    q = db.query(ComercialEvento)
    if estado:
        q = q.filter(ComercialEvento.estado == estado)
    if tipo_evento:
        q = q.filter(ComercialEvento.tipo_evento == tipo_evento)
    if buscar:
        term = f"%{buscar.strip()}%"
        q = q.filter(
            (ComercialEvento.nombres.ilike(term))
            | (ComercialEvento.celular.ilike(term))
            | (ComercialEvento.razon_social.ilike(term))
        )
    if desde:
        q = q.filter(ComercialEvento.fecha_creacion >= desde)
    if hasta:
        q = q.filter(ComercialEvento.fecha_creacion <= hasta)
    total = q.count()
    rows = (
        q.order_by(
            _dd_mm_yyyy_sort_key(ComercialEvento.fecha_tentativa).desc(),
            ComercialEvento.id.desc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )
    return PaginatedEventos(
        items=[ComercialEventoOut.from_orm(r) for r in rows],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/eventos/{evento_id}", response_model=ComercialEventoOut)
def get_evento(
    evento_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    row = db.query(ComercialEvento).filter(ComercialEvento.id == evento_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    return ComercialEventoOut.from_orm(row)


@router.post("/eventos", response_model=ComercialEventoOut)
def create_evento(
    body: ComercialEventoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    data = body.dict(exclude_unset=True)
    fc = data.pop("fecha_creacion", None)
    row = ComercialEvento(**data)
    if fc is not None:
        row.fecha_creacion = fc.replace(tzinfo=timezone.utc) if fc.tzinfo is None else fc
    db.add(row)
    db.commit()
    db.refresh(row)
    return ComercialEventoOut.from_orm(row)


@router.put("/eventos/{evento_id}", response_model=ComercialEventoOut)
def update_evento(
    evento_id: int,
    body: ComercialEventoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(ComercialEvento).filter(ComercialEvento.id == evento_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    upd = body.dict(exclude_unset=True)
    if "tipo_evento" in upd and upd["tipo_evento"] is not None:
        allowed = ("Social", "Corporativo", "Fiestas Infantiles")
        if upd["tipo_evento"] not in allowed:
            raise HTTPException(status_code=400, detail=f"tipo_evento debe ser uno de: {allowed}")
    for k, v in upd.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return ComercialEventoOut.from_orm(row)


@router.delete("/eventos/{evento_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_evento(
    evento_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(ComercialEvento).filter(ComercialEvento.id == evento_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    db.delete(row)
    db.commit()
    return None


@router.patch("/eventos/{evento_id}/estado", response_model=ComercialEventoOut)
def patch_evento_estado(
    evento_id: int,
    body: EstadoPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    row = db.query(ComercialEvento).filter(ComercialEvento.id == evento_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    row.estado = body.estado
    db.commit()
    db.refresh(row)
    return ComercialEventoOut.from_orm(row)


@router.post("/whatsapp/send", response_model=WhatsAppSendOut)
def whatsapp_build_url(
    body: WhatsAppSendIn,
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    phone = _normalize_pe_phone(body.celular)
    if len(phone) < 10:
        raise HTTPException(status_code=400, detail="Número de celular inválido")
    encoded = quote(body.message, safe="")
    url = f"https://wa.me/{phone}?text={encoded}"
    return WhatsAppSendOut(wa_url=url, phone_e164_digits=phone)


@router.get("/analytics/reservas", response_model=ReservasAnalyticsOut)
def analytics_reservas(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    total = db.query(func.count(ComercialReserva.id)).scalar() or 0
    avg = db.query(func.avg(ComercialReserva.cantidad_personas)).scalar()
    avg_f = float(avg) if avg is not None else 0.0

    y_ax = extract("year", ComercialReserva.fecha_creacion)
    m_ax = extract("month", ComercialReserva.fecha_creacion)
    month_rows = (
        db.query(
            y_ax.label("y"),
            m_ax.label("m"),
            func.count(ComercialReserva.id).label("c"),
        )
        .group_by(y_ax, m_ax)
        .order_by(y_ax, m_ax)
        .all()
    )
    by_month = [
        MonthlyCount(year=int(r.y), month=int(r.m), label=_month_label(int(r.y), int(r.m)), count=int(r.c))
        for r in month_rows
    ]

    est_rows = (
        db.query(ComercialReserva.estado, func.count(ComercialReserva.id))
        .group_by(ComercialReserva.estado)
        .all()
    )
    by_estado = [EstadoCount(estado=r[0] or "", count=int(r[1])) for r in est_rows]

    rango = _reserva_personas_rango_expr()
    pr_rows = (
        db.query(rango.label("bucket"), func.count(ComercialReserva.id))
        .group_by(rango)
        .order_by(rango)
        .all()
    )
    order_buckets = ["1–2", "3–4", "5–8", "9+"]
    bucket_map = {str(r[0]): int(r[1]) for r in pr_rows}
    by_personas_rango = [PersonasRangeCount(rango=b, count=bucket_map.get(b, 0)) for b in order_buckets]

    return ReservasAnalyticsOut(
        by_month=by_month,
        by_estado=by_estado,
        by_personas_rango=by_personas_rango,
        avg_personas=avg_f,
        total=int(total),
    )


@router.get("/analytics/eventos", response_model=EventosAnalyticsOut)
def analytics_eventos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_view(current_user)
    total = db.query(func.count(ComercialEvento.id)).scalar() or 0
    avg = db.query(func.avg(ComercialEvento.cantidad_personas)).scalar()
    avg_f = float(avg) if avg is not None else 0.0

    y_ev = extract("year", ComercialEvento.fecha_creacion)
    m_ev = extract("month", ComercialEvento.fecha_creacion)
    month_rows = (
        db.query(
            y_ev.label("y"),
            m_ev.label("m"),
            func.count(ComercialEvento.id).label("c"),
        )
        .group_by(y_ev, m_ev)
        .order_by(y_ev, m_ev)
        .all()
    )
    by_month = [
        MonthlyCount(year=int(r.y), month=int(r.m), label=_month_label(int(r.y), int(r.m)), count=int(r.c))
        for r in month_rows
    ]

    est_rows = (
        db.query(ComercialEvento.estado, func.count(ComercialEvento.id))
        .group_by(ComercialEvento.estado)
        .all()
    )
    by_estado = [EstadoCount(estado=r[0] or "", count=int(r[1])) for r in est_rows]

    tipo_rows = (
        db.query(ComercialEvento.tipo_evento, func.count(ComercialEvento.id))
        .group_by(ComercialEvento.tipo_evento)
        .order_by(ComercialEvento.tipo_evento)
        .all()
    )
    by_tipo = [TipoEventoCount(tipo_evento=r[0] or "", count=int(r[1])) for r in tipo_rows]

    subq = (
        db.query(
            ComercialEvento.tipo_evento.label("tipo"),
            func.avg(ComercialEvento.cantidad_personas).label("prom"),
        )
        .group_by(ComercialEvento.tipo_evento)
        .all()
    )
    avg_por_tipo = [
        TipoEventoAvg(tipo_evento=r.tipo or "", avg_personas=float(r.prom or 0.0)) for r in subq
    ]

    return EventosAnalyticsOut(
        by_month=by_month,
        by_estado=by_estado,
        by_tipo_evento=by_tipo,
        avg_personas=avg_f,
        avg_personas_por_tipo=avg_por_tipo,
        total=int(total),
    )
