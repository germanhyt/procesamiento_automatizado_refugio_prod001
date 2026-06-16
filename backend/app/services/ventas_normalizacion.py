# -*- coding: utf-8 -*-
"""Normalización numérica y de montos para el pipeline legacy de ventas."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from app.core.data_constants import MONTO_ANOMALO_TOPE


@dataclass(frozen=True)
class MontoNormalizado:
    valor: float
    anomalo: bool
    motivo: str | None = None


def _limpiar_cadena_monto(value: Any) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return ""
    s = str(value).strip().replace("S/", "").replace(" ", "").replace(",", ".")
    return re.sub(r"[^0-9.\-]", "", s)


def normalizar_monto(
    value: Any,
    *,
    tope_anomalo: float = MONTO_ANOMALO_TOPE,
    rechazar_anomalos: bool = True,
) -> MontoNormalizado:
    """
    Normaliza un monto de reporte POS.
    Si supera `tope_anomalo` y `rechazar_anomalos`, devuelve anomalo=True (cuarentena).
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return MontoNormalizado(0.0, False)

    if isinstance(value, (int, np.integer, float, np.floating)):
        try:
            num_val = float(value)
        except (TypeError, ValueError):
            return MontoNormalizado(0.0, False)
    else:
        clean_str = _limpiar_cadena_monto(value)
        if not clean_str or clean_str in (".", "-"):
            return MontoNormalizado(0.0, False)
        try:
            num_val = float(clean_str)
        except ValueError:
            return MontoNormalizado(0.0, False)

    if num_val > tope_anomalo:
        if rechazar_anomalos:
            return MontoNormalizado(
                0.0,
                True,
                f"monto_supera_tope_{int(tope_anomalo)}",
            )
        return MontoNormalizado(round(num_val, 4), False)

    return MontoNormalizado(round(num_val, 4), False)


def sum_monto_column(series: pd.Series) -> float:
    """Suma una columna de montos aplicando la misma normalización del pipeline."""
    total = 0.0
    for val in series:
        res = normalizar_monto(val, rechazar_anomalos=False)
        total += res.valor
    return round(total, 4)


def aplicar_montos_normalizados(
    df: pd.DataFrame,
    *,
    col: str = "Monto",
    tope_anomalo: float = MONTO_ANOMALO_TOPE,
) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    """
    Aplica normalización de montos a un DataFrame.
    Filas anómalas se excluyen y se devuelven en la lista de cuarentena.
    """
    if df is None or df.empty or col not in df.columns:
        return df, []

    cuarentena: list[dict[str, Any]] = []
    indices_ok: list[Any] = []
    montos_ok: list[float] = []

    for idx, val in df[col].items():
        res = normalizar_monto(val, tope_anomalo=tope_anomalo)
        if res.anomalo:
            row = df.loc[idx].to_dict()
            row["_motivo_cuarentena"] = res.motivo
            row["_monto_original"] = val
            cuarentena.append(row)
        else:
            indices_ok.append(idx)
            montos_ok.append(res.valor)

    if not indices_ok:
        return df.iloc[0:0].copy(), cuarentena

    out = df.loc[indices_ok].copy()
    out[col] = montos_ok
    return out, cuarentena
