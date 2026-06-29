"""Centro de control Delivery — alertas y snapshot."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.core.delivery_constants import (
    CONTROL_ALERT_MATCH_NO_DELIVERY,
    CONTROL_ALERT_ORDER_NO_RUNNER,
    DRIVER_STATUS_ESPERANDO,
    ORDER_STATUS_LISTO,
    ORDER_STATUS_LISTO_PARA_ENTREGAR,
    ORDER_STATUS_PENDIENTE_RECOJO,
)
from app.services.delivery_control_service import build_control_alerts, build_control_counts


def _order(**kwargs):
    defaults = {
        "id": 1,
        "estado": ORDER_STATUS_LISTO,
        "locked_by_runner_id": None,
        "matched_driver_arrival_id": None,
        "listo_at": None,
        "match_at": None,
        "estado_changed_at": None,
        "updated_at": None,
        "created_at": datetime.now(timezone.utc),
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _driver(**kwargs):
    defaults = {
        "id": 10,
        "estado": DRIVER_STATUS_ESPERANDO,
        "matched_order_id": None,
        "estado_changed_at": None,
        "updated_at": None,
        "created_at": datetime.now(timezone.utc),
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_alert_order_no_runner():
    now = datetime.now(timezone.utc)
    stale = now - timedelta(minutes=20)
    orders = [_order(id=5, estado=ORDER_STATUS_PENDIENTE_RECOJO, estado_changed_at=stale)]
    alerts = build_control_alerts(orders, [], now)
    types = {a["type"] for a in alerts}
    assert CONTROL_ALERT_ORDER_NO_RUNNER in types
    assert any(a["order_id"] == 5 for a in alerts)


def test_alert_match_no_delivery():
    now = datetime.now(timezone.utc)
    stale = now - timedelta(minutes=30)
    orders = [
        _order(
            id=7,
            estado=ORDER_STATUS_LISTO_PARA_ENTREGAR,
            matched_driver_arrival_id=99,
            match_at=stale,
        )
    ]
    alerts = build_control_alerts(orders, [], now)
    assert any(a["type"] == CONTROL_ALERT_MATCH_NO_DELIVERY and a["order_id"] == 7 for a in alerts)


def test_counts_include_alerts():
    now = datetime.now(timezone.utc)
    stale = now - timedelta(minutes=20)
    orders = [_order(id=3, estado=ORDER_STATUS_LISTO, estado_changed_at=stale)]
    alerts = build_control_alerts(orders, [], now)
    counts = build_control_counts(orders, [], alerts)
    assert counts["orders_active"] == 1
    assert counts["orders_with_alerts"] == 1
    assert counts["alerts_total"] == len(alerts)
