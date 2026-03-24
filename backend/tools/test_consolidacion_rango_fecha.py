#!/usr/bin/env python3
"""Tests: rango semanal Lima + filtro por columna Fecha (consolidación)."""
import os
import sys
from datetime import date, datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pandas as pd

from app.services.file_store_service import (
    filtrar_filas_por_rango_fecha,
    rango_desde_modo,
    get_semana_actual_lima,
)


def test_filtrar_filas_por_rango_fecha():
    df = pd.DataFrame(
        {
            "Fecha": [
                "2026-03-16",
                "2026-03-20 10:00:00",
                "23/03/2026",
                "2026-03-25",
            ],
            "Monto": [1, 2, 3, 4],
        }
    )
    start, end = date(2026, 3, 16), date(2026, 3, 22)
    out = filtrar_filas_por_rango_fecha(df, start, end)
    assert len(out) == 2, out
    assert set(out["Monto"].tolist()) == {1, 2}

    out2 = filtrar_filas_por_rango_fecha(df, date(2026, 3, 23), date(2026, 3, 29))
    assert len(out2) == 2
    assert set(out2["Monto"].tolist()) == {3, 4}


def test_ultima_semana_es_7_dias():
    fixed = date(2026, 3, 25)  # miércoles
    lunes_actual = fixed - timedelta(days=fixed.weekday())
    domingo_actual = lunes_actual + timedelta(days=6)
    lunes_prev = lunes_actual - timedelta(days=7)
    domingo_prev = lunes_prev + timedelta(days=6)

    lima = ZoneInfo("America/Lima")
    with patch("app.services.file_store_service._ahora_lima") as mock_now:
        mock_now.return_value = datetime(2026, 3, 25, 12, 0, 0, tzinfo=lima)
        s, e, tag = rango_desde_modo("ultima_semana")
        assert s == lunes_prev, (s, lunes_prev)
        assert e == domingo_prev, (e, domingo_prev)
        assert (e - s).days == 6
        assert "semana" in tag.lower()


def test_semana_actual_es_7_dias():
    fixed = date(2026, 3, 25)
    lunes = fixed - timedelta(days=fixed.weekday())
    domingo = lunes + timedelta(days=6)
    lima = ZoneInfo("America/Lima")
    with patch("app.services.file_store_service._ahora_lima") as mock_now:
        mock_now.return_value = datetime(2026, 3, 25, 12, 0, 0, tzinfo=lima)
        s, e, _ = rango_desde_modo("semana_actual")
        assert s == lunes and e == domingo


def main():
    test_filtrar_filas_por_rango_fecha()
    test_ultima_semana_es_7_dias()
    test_semana_actual_es_7_dias()
    # Smoke: función real no lanza
    get_semana_actual_lima()
    print("test_consolidacion_rango_fecha: OK")


if __name__ == "__main__":
    main()
