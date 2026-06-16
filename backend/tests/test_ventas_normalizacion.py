# -*- coding: utf-8 -*-
import pandas as pd

from app.core.data_constants import MONTO_ANOMALO_TOPE
from app.services.ventas_normalizacion import aplicar_montos_normalizados, normalizar_monto, sum_monto_column


def test_normalizar_monto_formato_peruano():
    res = normalizar_monto("S/ 100,50")
    assert res.anomalo is False
    assert res.valor == 100.5


def test_normalizar_monto_anomalo_cuarentena():
    res = normalizar_monto(MONTO_ANOMALO_TOPE + 1)
    assert res.anomalo is True
    assert res.motivo is not None


def test_sum_monto_column():
    df = pd.DataFrame({"Monto": ["10", "20,5", "S/ 5"]})
    assert sum_monto_column(df["Monto"]) == 35.5


def test_aplicar_montos_excluye_anomalos():
    df = pd.DataFrame({
        "Monto": [100.0, MONTO_ANOMALO_TOPE + 500, 25.5],
        "Fecha": ["2026-06-01", "2026-06-02", "2026-06-03"],
    })
    out, cuarentena = aplicar_montos_normalizados(df)
    assert len(out) == 2
    assert len(cuarentena) == 1
    assert cuarentena[0]["_monto_original"] == MONTO_ANOMALO_TOPE + 500
