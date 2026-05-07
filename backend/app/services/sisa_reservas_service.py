from datetime import date, time
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.sisa_reservas import SisaReservaMesa, SisaReservaRegistro, SisaReservaZona
from app.schemas.sisa_reservas import (
    CountByLabel,
    SisaPublicPlanoMesaOut,
    SisaPublicPlanoOut,
    SisaPublicPlanoZonaOut,
    SisaPublicReservaPeek,
    SisaReservaMesaOut,
    SisaReservaPlanoMesaOut,
    SisaReservaPlanoOut,
    SisaReservaPlanoZonaOut,
    SisaReservaRegistroOut,
    SisaReservaZonaOut,
    SisaReservasKpisOut,
)

NON_BLOCKING_ESTADOS = ("cancelado", "finalizado")


def _mesa_belongs_to_zona(db: Session, mesa_id: int, zona_id: int) -> bool:
    m = db.query(SisaReservaMesa).filter(SisaReservaMesa.id == mesa_id).first()
    return bool(m and m.zona_id == zona_id)


def validate_reserva_mesa_zona(db: Session, zona_id: int, mesa_id: Optional[int]) -> None:
    z = db.query(SisaReservaZona).filter(SisaReservaZona.id == zona_id).first()
    if not z:
        raise ValueError("zona_id no existe")
    if mesa_id is None:
        return
    if not _mesa_belongs_to_zona(db, mesa_id, zona_id):
        raise ValueError("mesa_id no pertenece a la zona indicada")


def validate_reserva_disponibilidad(
    db: Session,
    fecha_reserva: date,
    hora_reserva: time,
    zona_id: int,
    mesa_id: Optional[int],
    *,
    exclude_reserva_id: Optional[int] = None,
) -> None:
    """Valida disponibilidad de mesa (y de zona cuando no se selecciona mesa)."""
    active_rows = (
        db.query(SisaReservaMesa.id)
        .filter(SisaReservaMesa.zona_id == zona_id, SisaReservaMesa.is_active.is_(True))
        .all()
    )
    active_ids = [r[0] for r in active_rows]

    reservas_q = db.query(SisaReservaRegistro).filter(
        SisaReservaRegistro.fecha_reserva == fecha_reserva,
        SisaReservaRegistro.hora_reserva == hora_reserva,
        SisaReservaRegistro.estado.notin_(NON_BLOCKING_ESTADOS),
    )
    if exclude_reserva_id is not None:
        reservas_q = reservas_q.filter(SisaReservaRegistro.id != exclude_reserva_id)

    if mesa_id is not None:
        mesa = db.query(SisaReservaMesa).filter(SisaReservaMesa.id == mesa_id).first()
        if not mesa:
            raise ValueError("mesa_id no existe")
        if not mesa.is_active:
            raise ValueError("La mesa seleccionada está inactiva")
        ocupada = reservas_q.filter(SisaReservaRegistro.mesa_id == mesa_id).first()
        if ocupada:
            raise ValueError(
                "La mesa seleccionada ya está ocupada en esa fecha y hora. Elija otra mesa u horario."
            )
        return

    # Sin mesa asignada: si la zona tiene mesas activas, exige que exista al menos una libre.
    if not active_ids:
        return
    ocupadas = reservas_q.filter(SisaReservaRegistro.mesa_id.in_(active_ids)).count()
    if ocupadas >= len(active_ids):
        raise ValueError(
            "No hay mesas disponibles en la zona para esa fecha y hora. Elija otra zona u horario."
        )


def list_reservas_query(
    db: Session,
    skip: int,
    limit: int,
    nombre: Optional[str],
    fecha: Optional[date],
    estado: Optional[str],
    zona_id: Optional[int],
):
    q = db.query(SisaReservaRegistro)
    if nombre:
        like = f"%{nombre.strip()}%"
        q = q.filter(SisaReservaRegistro.nombre_completo.ilike(like))
    if fecha:
        q = q.filter(SisaReservaRegistro.fecha_reserva == fecha)
    if estado:
        q = q.filter(SisaReservaRegistro.estado == estado)
    if zona_id is not None:
        q = q.filter(SisaReservaRegistro.zona_id == zona_id)
    total = q.count()
    rows = (
        q.order_by(SisaReservaRegistro.fecha_reserva.desc(), SisaReservaRegistro.hora_reserva.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return total, rows


def build_kpis(db: Session, ultimas_limit: int = 10) -> SisaReservasKpisOut:
    total = db.query(func.count(SisaReservaRegistro.id)).scalar() or 0
    pendientes = (
        db.query(func.count(SisaReservaRegistro.id)).filter(SisaReservaRegistro.estado == "pendiente").scalar() or 0
    )
    confirmados = (
        db.query(func.count(SisaReservaRegistro.id)).filter(SisaReservaRegistro.estado == "confirmado").scalar() or 0
    )
    ultimas_rows = (
        db.query(SisaReservaRegistro)
        .order_by(SisaReservaRegistro.created_at.desc())
        .limit(ultimas_limit)
        .all()
    )
    ultimas = [SisaReservaRegistroOut.from_orm(r) for r in ultimas_rows]

    motivo_rows = (
        db.query(SisaReservaRegistro.motivo_reserva, func.count(SisaReservaRegistro.id))
        .group_by(SisaReservaRegistro.motivo_reserva)
        .all()
    )
    by_motivo = [CountByLabel(label=m, count=c) for m, c in motivo_rows]

    zona_rows = (
        db.query(SisaReservaZona.nombre, func.count(SisaReservaRegistro.id))
        .join(SisaReservaRegistro, SisaReservaRegistro.zona_id == SisaReservaZona.id)
        .group_by(SisaReservaZona.nombre)
        .all()
    )
    by_zona = [CountByLabel(label=n or "—", count=c) for n, c in zona_rows]

    return SisaReservasKpisOut(
        total_reservas=int(total),
        pendientes=int(pendientes),
        confirmados=int(confirmados),
        ultimas=ultimas,
        by_motivo=by_motivo,
        by_zona=by_zona,
    )


def build_plano(db: Session, fecha: date, hora: time) -> SisaReservaPlanoOut:
    zonas = db.query(SisaReservaZona).order_by(SisaReservaZona.sort_order, SisaReservaZona.id).all()
    reservas = (
        db.query(SisaReservaRegistro)
        .filter(
            SisaReservaRegistro.fecha_reserva == fecha,
            SisaReservaRegistro.hora_reserva == hora,
            SisaReservaRegistro.estado.notin_(["cancelado", "finalizado"]),
        )
        .all()
    )
    by_mesa: dict[int, SisaReservaRegistro] = {}
    for r in reservas:
        if r.mesa_id:
            by_mesa[r.mesa_id] = r

    out_zonas: List[SisaReservaPlanoZonaOut] = []
    for z in zonas:
        mesas = (
            db.query(SisaReservaMesa)
            .filter(SisaReservaMesa.zona_id == z.id)
            .order_by(SisaReservaMesa.numero)
            .all()
        )
        mesa_payloads: List[SisaReservaPlanoMesaOut] = []
        for m in mesas:
            r = by_mesa.get(m.id)
            mesa_payloads.append(
                SisaReservaPlanoMesaOut(
                    mesa=SisaReservaMesaOut.from_orm(m),
                    reserva=SisaReservaRegistroOut.from_orm(r) if r else None,
                )
            )
        out_zonas.append(
            SisaReservaPlanoZonaOut(zona=SisaReservaZonaOut.from_orm(z), mesas=mesa_payloads)
        )

    return SisaReservaPlanoOut(fecha=fecha, hora=hora, zonas=out_zonas)


def build_plano_public(db: Session, fecha: date, hora: time) -> SisaPublicPlanoOut:
    """Mismo layout que ``build_plano``, ocupación sin PII."""
    zonas = db.query(SisaReservaZona).order_by(SisaReservaZona.sort_order, SisaReservaZona.id).all()
    reservas = (
        db.query(SisaReservaRegistro)
        .filter(
            SisaReservaRegistro.fecha_reserva == fecha,
            SisaReservaRegistro.hora_reserva == hora,
            SisaReservaRegistro.estado.notin_(["cancelado", "finalizado"]),
        )
        .all()
    )
    by_mesa: dict[int, SisaReservaRegistro] = {}
    for r in reservas:
        if r.mesa_id:
            by_mesa[r.mesa_id] = r

    out_zonas: List[SisaPublicPlanoZonaOut] = []
    for z in zonas:
        mesas = (
            db.query(SisaReservaMesa)
            .filter(SisaReservaMesa.zona_id == z.id)
            .order_by(SisaReservaMesa.numero)
            .all()
        )
        public_mesas: List[SisaPublicPlanoMesaOut] = []
        for m in mesas:
            r = by_mesa.get(m.id)
            peek = SisaPublicReservaPeek(estado=r.estado, numero_personas=r.numero_personas) if r else None
            public_mesas.append(
                SisaPublicPlanoMesaOut(
                    mesa=SisaReservaMesaOut.from_orm(m),
                    reserva=peek,
                )
            )
        out_zonas.append(SisaPublicPlanoZonaOut(zona=SisaReservaZonaOut.from_orm(z), mesas=public_mesas))

    return SisaPublicPlanoOut(fecha=fecha, hora=hora, zonas=out_zonas)
