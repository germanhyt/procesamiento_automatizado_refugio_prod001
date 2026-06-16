# -*- coding: utf-8 -*-
import pandas as pd

from app.services.realizadas_staging_service import (
    consolidar_realizadas_dataframe,
    dataframe_to_stg_rows,
    get_realizadas_staging_mode,
    merge_realizadas_dataframe,
    stg_rows_to_dataframe,
)
from app.core.data_constants import REALIZADAS_COL_BQ_SINCRONIZADO


def test_dataframe_to_stg_rows_maps_realizadas_columns():
    df = pd.DataFrame({
        "CodigoNegocio": ["IS04"],
        "RutaArchivo": ["rep venta.csv"],
        "FechaInicio": ["2026-06-01"],
        "FechaFin": ["2026-06-07"],
        "Ventas Totales": [1500.5],
        "Fecha_Procesamiento_Web": ["2026-06-09 10:00:00"],
        REALIZADAS_COL_BQ_SINCRONIZADO: [0],
    })
    rows = dataframe_to_stg_rows(df)
    assert len(rows) == 1
    assert rows[0]["codigo_negocio"] == "IS04"
    assert float(rows[0]["ventas_totales"]) == 1500.5
    assert rows[0]["bq_sincronizado"] == 0


def test_stg_rows_roundtrip_preserves_index_id():
    df_in = pd.DataFrame({
        "CodigoNegocio": ["A03"],
        "RutaArchivo": ["x.csv"],
        "FechaInicio": ["2026-06-01"],
        "FechaFin": ["2026-06-02"],
        "Fecha Transaccion": ["2026-06-09"],
        "Fecha Inicio": ["2026-06-01"],
        "Fecha Fin": ["2026-06-02"],
        "Ventas Totales": [99.0],
        "Fecha_Procesamiento_Web": ["2026-06-09"],
        REALIZADAS_COL_BQ_SINCRONIZADO: [1],
    })
    payloads = dataframe_to_stg_rows(df_in)

    class _Row:
        def __init__(self, row_id: int, data: dict):
            self.id = row_id
            for k, v in data.items():
                setattr(self, k, v)

    df_out = stg_rows_to_dataframe([_Row(42, payloads[0])])
    assert df_out.index[0] == 42
    assert df_out.iloc[0]["CodigoNegocio"] == "A03"
    assert int(df_out.iloc[0][REALIZADAS_COL_BQ_SINCRONIZADO]) == 1


def test_consolidar_realizadas_una_fila_por_negocio_periodo():
    df = pd.DataFrame({
        "CodigoNegocio": ["L13", "L13", "IS07", "IS07"],
        "RutaArchivo": ["a.csv", "a.csv", "mar.xlsx", "abr.xlsx"],
        "FechaInicio": ["2026-06-01"] * 4,
        "FechaFin": ["2026-06-07"] * 4,
        "Ventas Totales": [100.0, 100.0, 50.0, 50.0],
        "Fecha_Procesamiento_Web": ["2026-06-09 16:00:00", "2026-06-09 18:00:00"] * 2,
        REALIZADAS_COL_BQ_SINCRONIZADO: [0, 0, 1, 1],
    })
    out = consolidar_realizadas_dataframe(df)
    assert len(out) == 2
    assert out[out["CodigoNegocio"] == "L13"].iloc[0]["Ventas Totales"] == 100.0
    assert "a.csv" in str(out[out["CodigoNegocio"] == "L13"].iloc[0]["RutaArchivo"])


def test_merge_realizadas_reemplaza_mismo_periodo():
    existing = pd.DataFrame({
        "CodigoNegocio": ["L13"],
        "FechaInicio": ["2026-06-01"],
        "FechaFin": ["2026-06-07"],
        "RutaArchivo": ["viejo.csv"],
        "Ventas Totales": [10.0],
        REALIZADAS_COL_BQ_SINCRONIZADO: [1],
    })
    nuevas = pd.DataFrame({
        "CodigoNegocio": ["L13"],
        "FechaInicio": ["2026-06-01"],
        "FechaFin": ["2026-06-07"],
        "RutaArchivo": ["nuevo.csv"],
        "Ventas Totales": [99.0],
        REALIZADAS_COL_BQ_SINCRONIZADO: [0],
    })
    out = merge_realizadas_dataframe(existing, nuevas)
    assert len(out) == 1
    assert float(out.iloc[0]["Ventas Totales"]) == 99.0


def test_get_realizadas_staging_mode_inherits_sales(monkeypatch):
    monkeypatch.delenv("REALIZADAS_STAGING_MODE", raising=False)
    monkeypatch.setenv("SALES_STAGING_MODE", "dual")
    assert get_realizadas_staging_mode() == "dual"
