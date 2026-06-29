"""Mock del centro de control (pruebas UI y tests)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.delivery_constants import (
    CONTROL_ALERT_DRIVER_WAITING_LONG,
    CONTROL_ALERT_MATCH_NO_DELIVERY,
    CONTROL_ALERT_ORDER_LISTO_NO_MATCH,
    CONTROL_ALERT_ORDER_NO_RUNNER,
    DRIVER_STATUS_EN_MATCH,
    DRIVER_STATUS_ESPERANDO,
    ORDER_STATUS_LISTO,
    ORDER_STATUS_LISTO_PARA_ENTREGAR,
    ORDER_STATUS_PENDIENTE_RECOJO,
    ORDER_STATUS_PROCESO_ENTREGA,
)
from app.services.delivery_control_service import _operational_day_label, build_control_counts


def build_control_snapshot_mock(*, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    day = _operational_day_label(now)

    def ts(minutes_ago: int) -> datetime:
        return now - timedelta(minutes=minutes_ago)

    driver_waiting = {
        "id": 901,
        "plataforma": "RAPPI",
        "codigo_ingresado": "MOCK901",
        "placa": "ABC-123",
        "alias_conductor": "Juan P.",
        "estado": DRIVER_STATUS_ESPERANDO,
        "matched_order_id": None,
        "restaurant_id": 1,
        "restaurant_nombre": "Barrio Máncora",
        "conductor_documento_tipo": "DNI",
        "conductor_dni": "12345678",
        "conductor_carne_extranjeria": None,
        "conductor_nombre_completo": "Juan Pérez Mock",
        "foto_path": None,
        "foto_mime": None,
        "foto_uploaded_at": None,
        "created_at": ts(18),
        "updated_at": ts(18),
        "estado_changed_at": ts(18),
        "atendido_at": None,
        "despachado_at": None,
    }

    driver_matched = {
        **driver_waiting,
        "id": 902,
        "codigo_ingresado": "MOCK902",
        "placa": "XYZ-999",
        "alias_conductor": "María L.",
        "estado": DRIVER_STATUS_EN_MATCH,
        "matched_order_id": 102,
        "conductor_nombre_completo": "María López Mock",
        "created_at": ts(12),
        "updated_at": ts(8),
        "estado_changed_at": ts(8),
        "atendido_at": ts(8),
    }

    orders = [
        {
            "id": 101,
            "restaurant_id": 1,
            "restaurant_nombre": "Barrio Máncora",
            "plataforma": "RAPPI",
            "codigo_pedido": "R-4401",
            "estado": ORDER_STATUS_LISTO,
            "numero_bolsas": 2,
            "locked_by_runner_id": None,
            "locked_by_runner_username": None,
            "matched_driver_arrival_id": None,
            "matched_driver_arrival": None,
            "created_at": ts(22),
            "updated_at": ts(22),
            "estado_changed_at": ts(22),
            "listo_at": ts(22),
            "match_at": None,
            "recogido_at": None,
            "entregado_at": None,
            "cancelado_at": None,
            "devolucion_at": None,
        },
        {
            "id": 102,
            "restaurant_id": 1,
            "restaurant_nombre": "Barrio Máncora",
            "plataforma": "PEDIDOSYA",
            "codigo_pedido": "PY-7788",
            "estado": ORDER_STATUS_LISTO_PARA_ENTREGAR,
            "numero_bolsas": 1,
            "locked_by_runner_id": 3,
            "locked_by_runner_username": "runner.demo",
            "matched_driver_arrival_id": 902,
            "matched_driver_arrival": driver_matched,
            "created_at": ts(40),
            "updated_at": ts(8),
            "estado_changed_at": ts(8),
            "listo_at": ts(35),
            "match_at": ts(8),
            "recogido_at": ts(15),
            "entregado_at": None,
            "cancelado_at": None,
            "devolucion_at": None,
        },
        {
            "id": 103,
            "restaurant_id": 2,
            "restaurant_nombre": "Sushi Lab",
            "plataforma": "RAPPI",
            "codigo_pedido": "R-9912",
            "estado": ORDER_STATUS_PENDIENTE_RECOJO,
            "numero_bolsas": 3,
            "locked_by_runner_id": 4,
            "locked_by_runner_username": "runner.b",
            "matched_driver_arrival_id": None,
            "matched_driver_arrival": None,
            "created_at": ts(50),
            "updated_at": ts(16),
            "estado_changed_at": ts(16),
            "listo_at": ts(45),
            "match_at": None,
            "recogido_at": None,
            "entregado_at": None,
            "cancelado_at": None,
            "devolucion_at": None,
        },
        {
            "id": 104,
            "restaurant_id": 2,
            "restaurant_nombre": "Sushi Lab",
            "plataforma": "CIRCUIT",
            "codigo_pedido": "C-2200",
            "estado": ORDER_STATUS_PROCESO_ENTREGA,
            "numero_bolsas": 1,
            "locked_by_runner_id": 3,
            "locked_by_runner_username": "runner.demo",
            "matched_driver_arrival_id": None,
            "matched_driver_arrival": None,
            "created_at": ts(28),
            "updated_at": ts(5),
            "estado_changed_at": ts(5),
            "listo_at": ts(25),
            "match_at": None,
            "recogido_at": ts(6),
            "entregado_at": None,
            "cancelado_at": None,
            "devolucion_at": None,
        },
    ]

    drivers = [driver_waiting, driver_matched]

    alerts = [
        {
            "type": CONTROL_ALERT_ORDER_NO_RUNNER,
            "order_id": 101,
            "driver_arrival_id": None,
            "minutes": 22,
            "severity": "critical",
            "message": "Pedido #101 sin runner asignado (22 min en LISTO)",
        },
        {
            "type": CONTROL_ALERT_ORDER_LISTO_NO_MATCH,
            "order_id": 101,
            "driver_arrival_id": None,
            "minutes": 22,
            "severity": "critical",
            "message": "Pedido #101 LISTO sin match (22 min)",
        },
        {
            "type": CONTROL_ALERT_MATCH_NO_DELIVERY,
            "order_id": 102,
            "driver_arrival_id": 902,
            "minutes": 28,
            "severity": "critical",
            "message": "Pedido #102 con match sin entrega (28 min)",
        },
        {
            "type": CONTROL_ALERT_DRIVER_WAITING_LONG,
            "order_id": None,
            "driver_arrival_id": 901,
            "minutes": 18,
            "severity": "warning",
            "message": "Driver #901 en ESPERANDO (18 min)",
        },
    ]

    counts = build_control_counts([], [], alerts)
    counts["orders_active"] = len(orders)
    counts["orders_with_runner"] = sum(1 for o in orders if o.get("locked_by_runner_id"))
    counts["orders_matched"] = sum(1 for o in orders if o.get("matched_driver_arrival_id"))
    counts["orders_with_alerts"] = len({a["order_id"] for a in alerts if a.get("order_id")})
    counts["drivers_esperando"] = 1
    counts["drivers_en_match"] = 1
    counts["drivers_total"] = len(drivers)
    counts["alerts_total"] = len(alerts)

    return {
        "operational_day": day,
        "orders": orders,
        "drivers": drivers,
        "alerts": alerts,
        "counts": counts,
        "generated_at": now.isoformat(),
        "mock": True,
    }


def build_control_audit_mock(*, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)

    def ts(minutes_ago: int) -> datetime:
        return now - timedelta(minutes=minutes_ago)

    items = [
        {
            "id": 9001,
            "user_id": 1,
            "username": "admin.demo",
            "action": "UNLOCK",
            "source": "control_center",
            "order_id": 103,
            "driver_arrival_id": None,
            "detail": "Runner no respondía — mock",
            "created_at": ts(45),
        },
        {
            "id": 9002,
            "user_id": 1,
            "username": "admin.demo",
            "action": "MANUAL_MATCH",
            "source": "control_center",
            "order_id": 102,
            "driver_arrival_id": 902,
            "detail": "manual_match driver=902",
            "created_at": ts(120),
        },
        {
            "id": 9003,
            "user_id": 2,
            "username": "supervisor.demo",
            "action": "FORCE_ENTREGADO",
            "source": "admin_panel",
            "order_id": 99,
            "driver_arrival_id": None,
            "detail": "Cliente retiró en mostrador | mock",
            "created_at": ts(180),
        },
    ]
    return {"items": items, "total": len(items)}
