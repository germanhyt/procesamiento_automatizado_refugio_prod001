"""Pedidos activos delivery: día operativo Lima."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.api import delivery as delivery_api


def test_lima_today_range_covers_full_local_day():
    start, end = delivery_api._lima_today_range_utc()
    lima = ZoneInfo("America/Lima")
    now_lima = datetime.now(lima)
    assert start.astimezone(lima).date() == now_lima.date()
    assert end.astimezone(lima).date() == (now_lima.date() + timedelta(days=1))
    assert (end - start).total_seconds() == pytest.approx(86400, abs=1)
