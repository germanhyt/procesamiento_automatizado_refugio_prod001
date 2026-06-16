# -*- coding: utf-8 -*-
import pandas as pd

from app.services.sales_staging_service import (
    dataframe_to_stg_rows,
    get_sales_staging_mode,
    stg_rows_to_dataframe,
)


def test_dataframe_to_stg_rows_maps_columns():
    df = pd.DataFrame({
        "CodigoNegocio": ["A03"],
        "Fecha": ["2026-06-01"],
        "Hora": ["10:00:00"],
        "Monto": [100.5],
        "CodigoTransaccion": ["TX1"],
        "FechaHora": ["2026-06-01 10:00:00"],
    })
    rows = dataframe_to_stg_rows(df)
    assert len(rows) == 1
    assert rows[0]["codigo_negocio"] == "A03"
    assert rows[0]["monto"] == 100.5
    assert str(rows[0]["fecha"]) == "2026-06-01"


def test_stg_rows_roundtrip_columns():
    df_in = pd.DataFrame({
        "CodigoNegocio": ["IS04"],
        "Fecha": ["2026-06-02"],
        "Hora": ["08:00:00"],
        "Producto": ["Cafe"],
        "Cliente": ["-"],
        "Monto": [25.0],
        "Cantidad": [1],
        "CodigoTransaccion": ["-"],
        "FechaHora": ["2026-06-02 08:00:00"],
        "Estado": [0],
        "FechaCarga": ["2026-06-09"],
        "CodigoUbicacion": [""],
        "EstadoNegocio": ["ACTIVO"],
        "TipoNegocio": [""],
        "Area": [""],
        "FormaPago": ["-"],
    })
    payloads = dataframe_to_stg_rows(df_in)

    class _Row:
        def __init__(self, data):
            for k, v in data.items():
                setattr(self, k, v)

    df_out = stg_rows_to_dataframe([_Row(p) for p in payloads])
    assert df_out.iloc[0]["CodigoNegocio"] == "IS04"
    assert float(df_out.iloc[0]["Monto"]) == 25.0


def test_get_sales_staging_mode_default_excel(monkeypatch):
    monkeypatch.delenv("SALES_STAGING_MODE", raising=False)
    assert get_sales_staging_mode() == "excel"
