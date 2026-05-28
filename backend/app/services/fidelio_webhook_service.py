"""
Recepción webhook Fidelio order-ready: tripleta restaurante/plataforma/código.

Respuesta `{ orden, recepcion }` con tipo: creado | duplicado | nuevo_ciclo.
La simulación Runner usa la lógica legacy en delivery.py (sin este contrato).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.delivery_constants import (
    FIDELIO_RECEPTION_KIND_CREATED,
    FIDELIO_RECEPTION_KIND_DUPLICATE,
    FIDELIO_RECEPTION_KIND_NEW_CYCLE,
    ORDER_STATUS_LISTO,
    ORDER_TERMINAL_STATUSES,
)
from app.models.delivery import Order, Restaurant
from app.schemas.delivery import FidelioOrderReadyOut, FidelioOrdenResumenOut, FidelioRecepcionOut


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _minutes_since(created_at: Optional[datetime], now: datetime) -> int:
    if created_at is None:
        return 0
    ts = created_at
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    delta = now - ts
    return max(0, int(delta.total_seconds() // 60))


def _format_tiempo_transcurrido_es(minutes: int) -> str:
    """Ej.: 5 → '5 min'; 60 → '1 h'; 83 → '1 h 23 min'."""
    if minutes < 1:
        return "menos de 1 min"
    if minutes < 60:
        return f"{minutes} min"
    hours, rem = divmod(minutes, 60)
    if rem == 0:
        return f"{hours} h"
    return f"{hours} h {rem} min"


def _new_cycle_message(previous_state: str) -> str:
    if previous_state == "ENTREGADO":
        return "Pedido anterior ya entregado; se creó un nuevo registro."
    if previous_state == "CANCELADO":
        return "Pedido anterior cancelado; se creó un nuevo registro."
    if previous_state == "DEVOLUCION":
        return "Pedido anterior en devolución; se creó un nuevo registro."
    return "Pedido anterior finalizado; se creó un nuevo registro."


def order_to_fidelio_orden_resumen(order: Order, restaurant_nombre: str) -> FidelioOrdenResumenOut:
    return FidelioOrdenResumenOut(
        id=order.id,
        id_restaurante=order.restaurant_id,
        nombre_restaurante=restaurant_nombre,
        plataforma=order.plataforma,
        codigo_pedido=order.codigo_pedido,
        estado=order.estado,
        numero_bolsas=order.numero_bolsas,
    )


@dataclass
class FidelioWebhookProcessResult:
    """Resultado interno antes de side effects async (WS, push, early bird)."""

    response: FidelioOrderReadyOut
    notify_runners: bool = False
    emit_order_updated: bool = False
    try_early_bird: bool = False
    order_id: int = 0
    plataforma: str = ""
    codigo_pedido: str = ""


def process_fidelio_order_ready(
    db: Session,
    rest: Restaurant,
    plataforma: str,
    codigo: str,
    numero_bolsas: Optional[int],
) -> FidelioWebhookProcessResult:
    """
    Clasifica tripleta y persiste según tipo:
    - creado: pedido nuevo LISTO
    - duplicado: pedido activo existente (solo bolsas opcional)
    - nuevo_ciclo: pedido nuevo tras terminal previo
    """
    now = _utcnow()
    restaurant_nombre = rest.nombre

    latest = (
        db.query(Order)
        .filter(
            Order.restaurant_id == rest.id,
            Order.plataforma == plataforma,
            Order.codigo_pedido == codigo,
        )
        .order_by(Order.id.desc())
        .first()
    )

    if latest is None or latest.estado in ORDER_TERMINAL_STATUSES:
        previous_order_id = latest.id if latest is not None else None
        previous_state = latest.estado if latest is not None else None

        order = Order(
            restaurant_id=rest.id,
            plataforma=plataforma,
            codigo_pedido=codigo,
            estado=ORDER_STATUS_LISTO,
            numero_bolsas=numero_bolsas,
        )
        order.estado_changed_at = now
        order.listo_at = now
        db.add(order)
        db.commit()
        db.refresh(order)

        if latest is None:
            recepcion = FidelioRecepcionOut(
                tipo=FIDELIO_RECEPTION_KIND_CREATED,
                duplicado=False,
                mensaje="Pedido registrado correctamente.",
            )
        else:
            recepcion = FidelioRecepcionOut(
                tipo=FIDELIO_RECEPTION_KIND_NEW_CYCLE,
                duplicado=False,
                id_pedido_anterior=previous_order_id,
                estado_anterior=previous_state,
                mensaje=_new_cycle_message(previous_state or ""),
            )

        response = FidelioOrderReadyOut(
            orden=order_to_fidelio_orden_resumen(order, restaurant_nombre),
            recepcion=recepcion,
        )
        return FidelioWebhookProcessResult(
            response=response,
            notify_runners=True,
            emit_order_updated=True,
            try_early_bird=True,
            order_id=order.id,
            plataforma=plataforma,
            codigo_pedido=codigo,
        )

    order = latest
    bolsas_updated = False
    if numero_bolsas is not None and order.numero_bolsas != numero_bolsas:
        order.numero_bolsas = numero_bolsas
        bolsas_updated = True
        db.commit()
        db.refresh(order)

    first_at = order.created_at or now
    mins = _minutes_since(first_at, now)
    tiempo = _format_tiempo_transcurrido_es(mins)
    if bolsas_updated:
        msg = f"Este pedido ya fue registrado hace {tiempo}. Se actualizaron las bolsas."
    else:
        msg = f"Este pedido ya fue registrado hace {tiempo}. No se creó un registro nuevo."

    recepcion = FidelioRecepcionOut(
        tipo=FIDELIO_RECEPTION_KIND_DUPLICATE,
        duplicado=True,
        fecha_primera_recepcion=first_at,
        minutos_desde_primera_recepcion=mins,
        tiempo_desde_primera_recepcion=tiempo,
        bolsas_actualizadas=bolsas_updated,
        mensaje=msg,
    )
    response = FidelioOrderReadyOut(
        orden=order_to_fidelio_orden_resumen(order, restaurant_nombre),
        recepcion=recepcion,
    )
    return FidelioWebhookProcessResult(
        response=response,
        notify_runners=False,
        emit_order_updated=False,
        try_early_bird=False,
        order_id=order.id,
        plataforma=plataforma,
        codigo_pedido=codigo,
    )
