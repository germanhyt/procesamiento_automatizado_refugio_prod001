"""Serie temporal de métricas Delivery (día / semana / mes, zona Lima)."""
from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.core.delivery_constants import ORDER_STATUS_ENTREGADO
from app.services.delivery_metrics_service import (
    _build_time_series,
    _period_key_for_order,
    _period_label,
)


def _order(created_at: datetime, estado: str = ORDER_STATUS_ENTREGADO) -> MagicMock:
    order = MagicMock()
    order.created_at = created_at
    order.estado = estado
    order.matched_driver_arrival = None
    order.numero_bolsas = 1
    order.listo_at = None
    order.match_at = None
    order.recogido_at = None
    order.entregado_at = None
    return order


def test_period_key_day_week_month_lima():
    # 2026-06-02 03:00 UTC = 2026-06-01 22:00 Lima
    utc = datetime(2026, 6, 2, 3, 0, tzinfo=timezone.utc)
    order = _order(utc)
    assert _period_key_for_order(order, "day") == "2026-06-01"
    assert _period_key_for_order(order, "week") == "2026-06-01"  # lunes de esa semana
    assert _period_key_for_order(order, "month") == "2026-06"


def test_build_time_series_fills_gaps_and_counts():
    orders = [
        _order(datetime(2026, 6, 1, 15, 0, tzinfo=timezone.utc)),
        _order(datetime(2026, 6, 1, 20, 0, tzinfo=timezone.utc)),
        _order(datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)),
    ]
    series = _build_time_series(
        orders,
        fecha_desde="2026-06-01",
        fecha_hasta="2026-06-03",
        granularity="day",
    )
    assert len(series) == 3
    assert series[0]["period"] == "2026-06-01"
    assert series[0]["total"] == 2
    assert series[1]["period"] == "2026-06-02"
    assert series[1]["total"] == 0
    assert series[2]["period"] == "2026-06-03"
    assert series[2]["total"] == 1


def test_build_time_series_week_buckets():
    orders = [
        _order(datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc)),  # lun 2026-06-01 Lima week
        _order(datetime(2026, 6, 9, 12, 0, tzinfo=timezone.utc)),  # next week
    ]
    series = _build_time_series(
        orders,
        fecha_desde="2026-06-01",
        fecha_hasta="2026-06-14",
        granularity="week",
    )
    assert len(series) == 2
    assert series[0]["total"] == 1
    assert series[1]["total"] == 1
    assert series[0]["label"] == "01/06 – 05/06/2026"


def test_week_label_is_monday_to_friday():
    assert _period_label("2026-06-01", "week") == "01/06 – 05/06/2026"
