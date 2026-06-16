# -*- coding: utf-8 -*-
import pandas as pd

from app.core.data_constants import SALES_DEDUP_KEYS
from app.services.ventas_deduplicacion import deduplicar_ventas_df, preparar_claves_dedup, resolver_claves_dedup


def test_preparar_claves_dedup_genera_fecha_hora():
    df = pd.DataFrame({
        "CodigoNegocio": ["IS04"],
        "Fecha": ["2026-06-01 10:30:00"],
        "Monto": ["100,5"],
        "CodigoTransaccion": [""],
    })
    out = preparar_claves_dedup(df)
    assert out.iloc[0]["FechaHora"] == "2026-06-01 10:30:00"
    assert out.iloc[0]["CodigoTransaccion"] == "-"
    assert float(out.iloc[0]["Monto"]) == 100.5


def test_deduplicar_usa_clave_bq_natural():
    df = pd.DataFrame({
        "CodigoNegocio": ["A03", "A03"],
        "Fecha": ["2026-06-01", "2026-06-01"],
        "Hora": ["10:00:00", "10:00:00"],
        "CodigoTransaccion": ["TX1", "TX1"],
        "Monto": [50.0, 50.0],
        "Producto": ["Cafe", "Cafe distinto"],
    })
    out, stats = deduplicar_ventas_df(df)
    assert stats["claves_dedup"] == SALES_DEDUP_KEYS
    assert stats["duplicados_eliminados"] == 1
    assert len(out) == 1


def test_deduplicar_fallback_sin_fecha_hora_explicita():
    df = pd.DataFrame({
        "CodigoNegocio": ["B01", "B01"],
        "Fecha": ["2026-06-02", "2026-06-02"],
        "Monto": [10.0, 10.0],
        "Producto": ["A", "A"],
    })
    keys = resolver_claves_dedup(preparar_claves_dedup(df))
    assert "CodigoNegocio" in keys
    out, stats = deduplicar_ventas_df(df)
    assert stats["duplicados_eliminados"] == 1
    assert len(out) == 1


def test_deduplicar_keep_last():
    df = pd.DataFrame({
        "CodigoNegocio": ["C01", "C01"],
        "FechaHora": ["2026-06-03 08:00:00", "2026-06-03 08:00:00"],
        "CodigoTransaccion": ["T1", "T1"],
        "Monto": [5.0, 5.0],
        "Producto": ["viejo", "nuevo"],
    })
    out, _ = deduplicar_ventas_df(df, keep="last")
    assert out.iloc[0]["Producto"] == "nuevo"
