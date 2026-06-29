"""Snapshot agregado para el centro de control Delivery."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, joinedload

from app.core.delivery_constants import (
    CONTROL_ALERT_DRIVER_WAITING_LONG,
    CONTROL_ALERT_DRIVER_WAITING_MINUTES,
    CONTROL_ALERT_MATCH_NO_DELIVERY,
    CONTROL_ALERT_MATCH_NO_DELIVERY_MINUTES,
    CONTROL_ALERT_ORDER_LISTO_NO_MATCH,
    CONTROL_ALERT_ORDER_LISTO_NO_MATCH_MINUTES,
    CONTROL_ALERT_ORDER_NO_RUNNER,
    CONTROL_ALERT_ORDER_NO_RUNNER_MINUTES,
    DEFAULT_QUERY_LIMIT,
    DRIVER_STATUS_EN_MATCH,
    DRIVER_STATUS_ESPERANDO,
    ORDER_STATUS_CANCELADO,
    ORDER_STATUS_ENTREGADO,
    ORDER_STATUS_DEVOLUCION,
    ORDER_STATUS_LISTO,
    ORDER_STATUS_LISTO_PARA_ENTREGAR,
    ORDER_STATUS_PENDIENTE_RECOJO,
    ORDER_STATUS_PROCESO_ENTREGA,
)
from app.models.delivery import DriverArrival, Order
from app.schemas.delivery import driver_arrival_orm_to_dict, order_orm_to_dict

ORDER_TERMINAL = frozenset(
    {ORDER_STATUS_ENTREGADO, ORDER_STATUS_CANCELADO, ORDER_STATUS_DEVOLUCION}
)

ZONA_LIMA = ZoneInfo("America/Lima")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_utc(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts


def _minutes_since(ts: Optional[datetime], now: datetime) -> Optional[int]:
    if ts is None:
        return None
    return max(0, int((now - _ensure_utc(ts)).total_seconds() // 60))


def _state_ts(obj: Any) -> Optional[datetime]:
    return getattr(obj, "estado_changed_at", None) or getattr(obj, "updated_at", None) or getattr(obj, "created_at", None)


def _operational_day_label(now: Optional[datetime] = None) -> str:
    ref = now or datetime.now(ZONA_LIMA)
    if ref.tzinfo is None:
        ref = ref.replace(tzinfo=ZONA_LIMA)
    return ref.astimezone(ZONA_LIMA).date().isoformat()


def _load_operational_orders(db: Session, start_utc: datetime, end_utc: datetime) -> list[Order]:
    return (
        db.query(Order)
        .options(
            joinedload(Order.matched_driver_arrival),
            joinedload(Order.restaurant),
            joinedload(Order.locked_by_runner),
        )
        .filter(
            Order.estado.notin_(list(ORDER_TERMINAL)),
            Order.created_at >= start_utc,
            Order.created_at < end_utc,
        )
        .order_by(Order.id.desc())
        .limit(DEFAULT_QUERY_LIMIT)
        .all()
    )


def _load_operational_drivers(db: Session, start_utc: datetime, end_utc: datetime) -> list[DriverArrival]:
    return (
        db.query(DriverArrival)
        .options(joinedload(DriverArrival.restaurant))
        .filter(
            DriverArrival.estado.in_([DRIVER_STATUS_ESPERANDO, DRIVER_STATUS_EN_MATCH]),
            DriverArrival.created_at >= start_utc,
            DriverArrival.created_at < end_utc,
        )
        .order_by(DriverArrival.id.desc())
        .limit(DEFAULT_QUERY_LIMIT)
        .all()
    )


def _alert_severity(minutes: int, threshold: int) -> str:
    return "critical" if minutes >= threshold * 2 else "warning"


def build_control_alerts(orders: list[Order], drivers: list[DriverArrival], now: datetime) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []

    for order in orders:
        estado = order.estado or ""
        state_changed = _state_ts(order)

        if estado in (ORDER_STATUS_LISTO, ORDER_STATUS_PENDIENTE_RECOJO) and order.locked_by_runner_id is None:
            mins = _minutes_since(state_changed, now)
            if mins is not None and mins >= CONTROL_ALERT_ORDER_NO_RUNNER_MINUTES:
                alerts.append(
                    {
                        "type": CONTROL_ALERT_ORDER_NO_RUNNER,
                        "order_id": order.id,
                        "driver_arrival_id": None,
                        "minutes": mins,
                        "severity": _alert_severity(mins, CONTROL_ALERT_ORDER_NO_RUNNER_MINUTES),
                        "message": f"Pedido #{order.id} sin runner asignado ({mins} min en {estado})",
                    }
                )

        if estado == ORDER_STATUS_LISTO and order.matched_driver_arrival_id is None:
            ref = order.listo_at or state_changed
            mins = _minutes_since(ref, now)
            if mins is not None and mins >= CONTROL_ALERT_ORDER_LISTO_NO_MATCH_MINUTES:
                alerts.append(
                    {
                        "type": CONTROL_ALERT_ORDER_LISTO_NO_MATCH,
                        "order_id": order.id,
                        "driver_arrival_id": None,
                        "minutes": mins,
                        "severity": _alert_severity(mins, CONTROL_ALERT_ORDER_LISTO_NO_MATCH_MINUTES),
                        "message": f"Pedido #{order.id} LISTO sin match ({mins} min)",
                    }
                )

        if estado in (ORDER_STATUS_LISTO_PARA_ENTREGAR, ORDER_STATUS_PROCESO_ENTREGA) and order.matched_driver_arrival_id:
            ref = order.match_at or state_changed
            mins = _minutes_since(ref, now)
            if mins is not None and mins >= CONTROL_ALERT_MATCH_NO_DELIVERY_MINUTES:
                alerts.append(
                    {
                        "type": CONTROL_ALERT_MATCH_NO_DELIVERY,
                        "order_id": order.id,
                        "driver_arrival_id": order.matched_driver_arrival_id,
                        "minutes": mins,
                        "severity": _alert_severity(mins, CONTROL_ALERT_MATCH_NO_DELIVERY_MINUTES),
                        "message": f"Pedido #{order.id} con match sin entrega ({mins} min)",
                    }
                )

    for driver in drivers:
        if driver.estado != DRIVER_STATUS_ESPERANDO:
            continue
        mins = _minutes_since(_state_ts(driver), now)
        if mins is not None and mins >= CONTROL_ALERT_DRIVER_WAITING_MINUTES:
            alerts.append(
                {
                    "type": CONTROL_ALERT_DRIVER_WAITING_LONG,
                    "order_id": driver.matched_order_id,
                    "driver_arrival_id": driver.id,
                    "minutes": mins,
                    "severity": _alert_severity(mins, CONTROL_ALERT_DRIVER_WAITING_MINUTES),
                    "message": f"Driver #{driver.id} en ESPERANDO ({mins} min)",
                }
            )

    alerts.sort(key=lambda a: (-int(a.get("minutes") or 0), a.get("order_id") or 0))
    return alerts


def build_control_counts(orders: list[Order], drivers: list[DriverArrival], alerts: list[dict[str, Any]]) -> dict[str, int]:
    order_ids_with_alerts = {a["order_id"] for a in alerts if a.get("order_id") is not None}
    return {
        "orders_active": len(orders),
        "orders_with_runner": sum(1 for o in orders if o.locked_by_runner_id is not None),
        "orders_matched": sum(1 for o in orders if o.matched_driver_arrival_id is not None),
        "orders_with_alerts": len(order_ids_with_alerts),
        "drivers_esperando": sum(1 for d in drivers if d.estado == DRIVER_STATUS_ESPERANDO),
        "drivers_en_match": sum(1 for d in drivers if d.estado == DRIVER_STATUS_EN_MATCH),
        "drivers_total": len(drivers),
        "alerts_total": len(alerts),
    }


def build_control_snapshot(
    db: Session,
    *,
    start_utc: datetime,
    end_utc: datetime,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    now = now or _utcnow()
    orders = _load_operational_orders(db, start_utc, end_utc)
    drivers = _load_operational_drivers(db, start_utc, end_utc)
    alerts = build_control_alerts(orders, drivers, now)
    counts = build_control_counts(orders, drivers, alerts)

    return {
        "operational_day": _operational_day_label(now),
        "orders": [order_orm_to_dict(o) for o in orders],
        "drivers": [driver_arrival_orm_to_dict(d) for d in drivers],
        "alerts": alerts,
        "counts": counts,
        "generated_at": now.isoformat(),
    }
