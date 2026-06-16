"""Filtro de fechas en listado admin de pedidos delivery."""
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from app.api import delivery as delivery_api


def test_lima_created_at_bounds_single_day():
    start, end = delivery_api._lima_created_at_bounds_utc("2026-06-01", "2026-06-01")
    assert start is not None and end is not None
    lima = ZoneInfo("America/Lima")
    assert start.astimezone(lima).date().isoformat() == "2026-06-01"
    assert end.astimezone(lima).date().isoformat() == "2026-06-02"


def test_lima_created_at_bounds_rejects_inverted_range():
    with pytest.raises(HTTPException) as exc:
        delivery_api._lima_created_at_bounds_utc("2026-06-10", "2026-06-01")
    assert exc.value.status_code == 422
