# -*- coding: utf-8 -*-
import pandas as pd

from app.core.data_constants import REALIZADAS_COL_BQ_SINCRONIZADO
from app.services.bq_sales_sync import (
    filtrar_sales_df_por_realizadas,
    realizadas_pendientes_sync,
)


def test_realizadas_pendientes_sin_columna_marca_todas():
    df = pd.DataFrame({
        "CodigoNegocio": ["A03", "IS04"],
        "FechaInicio": ["2026-06-01", "2026-06-01"],
        "FechaFin": ["2026-06-07", "2026-06-07"],
    })
    pend = realizadas_pendientes_sync(df)
    assert len(pend) == 2


def test_realizadas_pendientes_respeta_bq_sincronizado():
    df = pd.DataFrame({
        "CodigoNegocio": ["A03", "IS04"],
        REALIZADAS_COL_BQ_SINCRONIZADO: [1, 0],
    })
    pend = realizadas_pendientes_sync(df)
    assert len(pend) == 1
    assert pend.iloc[0]["CodigoNegocio"] == "IS04"


def test_filtrar_sales_por_realizadas_rango():
    sales = pd.DataFrame({
        "CodigoNegocio": ["A03", "A03", "IS04"],
        "Fecha": ["2026-06-02", "2026-06-10", "2026-06-03"],
        "Monto": [10.0, 20.0, 30.0],
    })
    realizadas = pd.DataFrame({
        "CodigoNegocio": ["A03"],
        "FechaInicio": ["2026-06-01"],
        "FechaFin": ["2026-06-07"],
    })
    out = filtrar_sales_df_por_realizadas(sales, realizadas)
    assert len(out) == 1
    assert float(out.iloc[0]["Monto"]) == 10.0
