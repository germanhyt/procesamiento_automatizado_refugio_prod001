# -*- coding: utf-8 -*-
"""Deduplicación de ventas alineada con la clave natural de BigQuery / stg_sales."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.core.data_constants import (
    CONSOLIDACION_DEDUP_FALLBACK_KEYS,
    CONSOLIDACION_DEDUP_WEAK_KEYS,
    SALES_DEDUP_KEYS,
)
from app.services.ventas_normalizacion import normalizar_monto


def _strip_codigo_negocio(series: pd.Series) -> pd.Series:
    return series.astype(str).str.strip()


def _normalizar_codigo_transaccion(series: pd.Series) -> pd.Series:
    out = series.fillna("-").astype(str).str.strip()
    return out.replace("", "-")


def _asegurar_hora(series: pd.Series) -> pd.Series:
    h = series.fillna("06:00:00").astype(str).str.strip()
    h = h.replace({"nan": "06:00:00", "None": "06:00:00", "NaT": "06:00:00", "": "06:00:00"})
    return h.apply(lambda x: x if ":" in x else "06:00:00")


def _extraer_fecha_hora_desde_fecha(val: Any) -> tuple[str | None, str | None]:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None, None
    s = str(val).strip()
    if not s or s.lower() in ("nan", "nat", "none"):
        return None, None
    parts = s.split()
    if len(parts) >= 2:
        return parts[0], parts[1]
    return parts[0], None


def preparar_claves_dedup(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normaliza columnas usadas en deduplicación (CodigoNegocio, Monto, CodigoTransaccion, FechaHora).
    No elimina filas.
    """
    if df is None or df.empty:
        return df

    out = df.copy()

    if "CodigoNegocio" in out.columns:
        out["CodigoNegocio"] = _strip_codigo_negocio(out["CodigoNegocio"])

    if "Monto" in out.columns:
        out["Monto"] = [
            normalizar_monto(v, rechazar_anomalos=False).valor for v in out["Monto"]
        ]

    if "CodigoTransaccion" not in out.columns:
        out["CodigoTransaccion"] = "-"
    else:
        out["CodigoTransaccion"] = _normalizar_codigo_transaccion(out["CodigoTransaccion"])

    if "Hora" not in out.columns:
        out["Hora"] = None

    if "Fecha" in out.columns:
        fechas: list[Any] = []
        for idx, val in out["Fecha"].items():
            f_txt, h_txt = _extraer_fecha_hora_desde_fecha(val)
            hora_actual = out.at[idx, "Hora"] if "Hora" in out.columns else None
            if (hora_actual is None or str(hora_actual).strip() in ("", "nan", "None", "NaT")) and h_txt:
                out.at[idx, "Hora"] = h_txt
            fechas.append(f_txt if f_txt else val)
        ts = pd.to_datetime(pd.Series(fechas, index=out.index), errors="coerce", dayfirst=True)
        out["Fecha"] = ts.dt.strftime("%Y-%m-%d").where(ts.notna(), out["Fecha"])

    out["Hora"] = _asegurar_hora(out["Hora"])

    if "FechaHora" not in out.columns or out["FechaHora"].isna().all():
        if "Fecha" in out.columns:
            fd = pd.to_datetime(out["Fecha"], errors="coerce", dayfirst=True)
            out["FechaHora"] = fd.dt.strftime("%Y-%m-%d") + " " + out["Hora"].astype(str)
        else:
            out["FechaHora"] = out["Hora"].astype(str)
    else:
        out["FechaHora"] = out["FechaHora"].fillna("").astype(str).str.strip()

    return out


def resolver_claves_dedup(df: pd.DataFrame) -> tuple[str, ...]:
    """Elige el conjunto de claves más estricto disponible en el DataFrame."""
    if df is None or df.empty:
        return ()

    candidatos = (
        SALES_DEDUP_KEYS,
        CONSOLIDACION_DEDUP_FALLBACK_KEYS,
        CONSOLIDACION_DEDUP_WEAK_KEYS,
    )
    for keys in candidatos:
        if all(k in df.columns for k in keys):
            return keys
    return tuple(k for k in SALES_DEDUP_KEYS if k in df.columns)


def deduplicar_ventas_df(
    df: pd.DataFrame,
    *,
    keys: tuple[str, ...] | None = None,
    keep: str = "last",
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """
    Elimina duplicados técnicos usando claves alineadas con BigQuery cuando es posible.
    Retorna (df_sin_duplicados, estadísticas).
    """
    if df is None or df.empty:
        return df, {
            "filas_antes": 0,
            "filas_despues": 0,
            "duplicados_eliminados": 0,
            "claves_dedup": (),
        }

    work = preparar_claves_dedup(df)
    use_keys = keys or resolver_claves_dedup(work)
    use_keys = tuple(k for k in use_keys if k in work.columns)
    if not use_keys:
        n = len(work)
        return work, {
            "filas_antes": n,
            "filas_despues": n,
            "duplicados_eliminados": 0,
            "claves_dedup": (),
        }

    before = len(work)
    deduped = work.drop_duplicates(subset=list(use_keys), keep=keep)
    after = len(deduped)

    return deduped, {
        "filas_antes": before,
        "filas_despues": after,
        "duplicados_eliminados": before - after,
        "claves_dedup": use_keys,
    }
