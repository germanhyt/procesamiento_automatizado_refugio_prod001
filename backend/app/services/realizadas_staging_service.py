# -*- coding: utf-8 -*-
"""Persistencia de Realizadas en PostgreSQL (auditoría de cargas y delta BQ)."""
from __future__ import annotations

import logging
import os
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.data_constants import (
    REALIZADAS_BUSINESS_KEYS,
    REALIZADAS_COL_BQ_SINCRONIZADO,
    REALIZADAS_STAGING_COLUMNS,
)
from app.database import SessionLocal
from app.models.realizadas_staging import StgRealizada
from app.services.bq_sales_sync import _activar_flag, realizadas_pendientes_sync

logger = logging.getLogger(__name__)

_REALIZADAS_TO_DB = {
    "CodigoNegocio": "codigo_negocio",
    "RutaArchivo": "ruta_archivo",
    "Cargar": "cargar",
    "Añadir": "anadir",
    "FechaInicio": "fecha_inicio",
    "FechaFin": "fecha_fin",
    "Fecha Transaccion": "fecha_transaccion",
    "Fecha Inicio": "fecha_inicio_display",
    "Fecha Fin": "fecha_fin_display",
    "Ventas Totales": "ventas_totales",
    "Fecha_Procesamiento_Web": "fecha_procesamiento_web",
    REALIZADAS_COL_BQ_SINCRONIZADO: "bq_sincronizado",
}


def get_realizadas_staging_mode() -> str:
    """
    excel   — solo hoja Realizadas en ConfiguracionWeb.xlsx.
    dual    — Excel + PostgreSQL (recomendado durante migración).
    postgres — solo PostgreSQL para Realizadas / BQ delta.
    Por defecto hereda SALES_STAGING_MODE si REALIZADAS_STAGING_MODE no está definido.
    """
    raw = (os.getenv("REALIZADAS_STAGING_MODE") or os.getenv("SALES_STAGING_MODE") or "excel").strip().lower()
    if raw not in ("excel", "dual", "postgres"):
        logger.warning("REALIZADAS_STAGING_MODE inválido (%s); usando excel.", raw)
        return "excel"
    return raw


def uses_postgres_realizadas_staging(mode: str | None = None) -> bool:
    m = mode or get_realizadas_staging_mode()
    return m in ("dual", "postgres")


def uses_excel_realizadas_staging(mode: str | None = None) -> bool:
    m = mode or get_realizadas_staging_mode()
    return m in ("excel", "dual")


def _to_str(value: Any, default: str = "") -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return default
    s = str(value).strip()
    if s.lower() in ("nan", "none", "nat", "<na>"):
        return default
    return s


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_bq_flag(value: Any) -> int:
    return 1 if _activar_flag(value) else 0


def _norm_key_str(value: Any) -> str:
    return _to_str(value, "").strip().upper()


def consolidar_realizadas_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Una fila por CodigoNegocio + FechaInicio + FechaFin.
    Varias rutas del mismo negocio/periodo se fusionan; se conserva la fila más reciente.
    """
    if df is None or df.empty:
        return df

    work = df.copy()
    key_cols = [c for c in REALIZADAS_BUSINESS_KEYS if c in work.columns]
    if len(key_cols) < len(REALIZADAS_BUSINESS_KEYS):
        return work

    for col in REALIZADAS_STAGING_COLUMNS:
        if col not in work.columns:
            work[col] = ""

    if "Fecha_Procesamiento_Web" in work.columns:
        work["_orden"] = pd.to_datetime(
            work["Fecha_Procesamiento_Web"], errors="coerce", dayfirst=True
        )
    else:
        work["_orden"] = pd.NaT

    def _join_rutas(series: pd.Series) -> str:
        rutas = sorted({ _to_str(v) for v in series if _to_str(v) })
        return " | ".join(rutas)

    grouped_rows: list[dict[str, Any]] = []
    for key_vals, grp in work.groupby(key_cols, dropna=False):
        grp_sorted = grp.sort_values("_orden", na_position="first")
        base = grp_sorted.iloc[-1].to_dict()
        base["RutaArchivo"] = _join_rutas(grp_sorted["RutaArchivo"])
        if "Ventas Totales" in grp_sorted.columns:
            base["Ventas Totales"] = round(
                max(_to_float(v) for v in grp_sorted["Ventas Totales"]), 4
            )
        if REALIZADAS_COL_BQ_SINCRONIZADO in grp_sorted.columns:
            base[REALIZADAS_COL_BQ_SINCRONIZADO] = (
                0 if any(not _activar_flag(v) for v in grp_sorted[REALIZADAS_COL_BQ_SINCRONIZADO]) else 1
            )
        grouped_rows.append({k: base.get(k, "") for k in REALIZADAS_STAGING_COLUMNS})

    out = pd.DataFrame(grouped_rows, columns=list(REALIZADAS_STAGING_COLUMNS))
    return out.reset_index(drop=True)


def merge_realizadas_dataframe(
    existing: pd.DataFrame,
    nuevas: pd.DataFrame,
) -> pd.DataFrame:
    """Reemplaza filas del mismo negocio/periodo y conserva el resto del histórico."""
    nuevas_agg = consolidar_realizadas_dataframe(nuevas)
    if existing is None or existing.empty:
        return nuevas_agg
    if nuevas_agg.empty:
        return consolidar_realizadas_dataframe(existing)

    ex = consolidar_realizadas_dataframe(existing.copy())
    key_cols = list(REALIZADAS_BUSINESS_KEYS)
    nuevas_keys = {
        tuple(_norm_key_str(nuevas_agg.iloc[i][c]) for c in key_cols)
        for i in range(len(nuevas_agg))
    }

    mask_keep = []
    for i in range(len(ex)):
        k = tuple(_norm_key_str(ex.iloc[i][c]) for c in key_cols)
        mask_keep.append(k not in nuevas_keys)

    kept = ex.iloc[mask_keep] if any(mask_keep) else ex.iloc[0:0]
    return pd.concat([kept, nuevas_agg], ignore_index=True)


def dataframe_to_stg_rows(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df is None or df.empty:
        return []
    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        payload: dict[str, Any] = {}
        for src, dst in _REALIZADAS_TO_DB.items():
            val = row.get(src)
            if dst == "ventas_totales":
                payload[dst] = round(_to_float(val), 4)
            elif dst == "bq_sincronizado":
                payload[dst] = _to_bq_flag(val)
            else:
                payload[dst] = _to_str(val, "")
        rows.append(payload)
    return rows


def stg_rows_to_dataframe(rows: list[StgRealizada]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=list(REALIZADAS_STAGING_COLUMNS))
    db_to_df = {v: k for k, v in _REALIZADAS_TO_DB.items()}
    data: list[dict[str, Any]] = []
    for row in rows:
        item: dict[str, Any] = {"id": row.id}
        for db_col, df_col in db_to_df.items():
            item[df_col] = getattr(row, db_col, None)
        data.append(item)
    df = pd.DataFrame(data, columns=["id", *REALIZADAS_STAGING_COLUMNS])
    return df.set_index("id", drop=False)


def clear_all(db: Session) -> int:
    deleted = db.query(StgRealizada).delete()
    db.commit()
    return int(deleted or 0)


def upsert_dataframe(db: Session, df: pd.DataFrame) -> int:
    """Inserta/actualiza una fila por negocio y periodo (CodigoNegocio + FechaInicio + FechaFin)."""
    df_agg = consolidar_realizadas_dataframe(df)
    payloads = dataframe_to_stg_rows(df_agg)
    if not payloads:
        return 0
    affected = 0
    for chunk_start in range(0, len(payloads), 500):
        chunk = payloads[chunk_start : chunk_start + 500]
        stmt = insert(StgRealizada).values(chunk)
        update_cols = {
            c.name: stmt.excluded[c.name]
            for c in StgRealizada.__table__.columns
            if c.name not in ("id", "created_at")
        }
        stmt = stmt.on_conflict_do_update(
            index_elements=[
                "codigo_negocio",
                "fecha_inicio",
                "fecha_fin",
            ],
            set_=update_cols,
        )
        result = db.execute(stmt)
        affected += int(result.rowcount or 0)
    db.commit()
    return affected


def mark_bq_sincronizado(db: Session, row_ids: list[int]) -> int:
    if not row_ids:
        return 0
    updated = (
        db.query(StgRealizada)
        .filter(StgRealizada.id.in_(row_ids))
        .update({StgRealizada.bq_sincronizado: 1}, synchronize_session=False)
    )
    db.commit()
    return int(updated or 0)


def mark_bq_sincronizado_by_keys(
    db: Session,
    keys: list[tuple[str, str, str]],
) -> int:
    """Marca sincronizadas todas las filas que coincidan con negocio + periodo."""
    if not keys:
        return 0
    total = 0
    for codigo, fecha_ini, fecha_fin in keys:
        updated = (
            db.query(StgRealizada)
            .filter(
                StgRealizada.codigo_negocio == _to_str(codigo),
                StgRealizada.fecha_inicio == _to_str(fecha_ini),
                StgRealizada.fecha_fin == _to_str(fecha_fin),
            )
            .update({StgRealizada.bq_sincronizado: 1}, synchronize_session=False)
        )
        total += int(updated or 0)
    db.commit()
    return total


def read_all_dataframe(db: Session) -> pd.DataFrame:
    rows = db.query(StgRealizada).order_by(StgRealizada.id.asc()).all()
    df = stg_rows_to_dataframe(rows)
    if not df.empty:
        df = df.set_index("id", drop=False)
    return df


def count_rows(db: Session) -> int:
    return int(db.query(func.count(StgRealizada.id)).scalar() or 0)


def count_negocio_periodo_rows(db: Session) -> int:
    df = read_all_dataframe(db)
    if df.empty:
        return 0
    return len(consolidar_realizadas_dataframe(df.drop(columns=["id"], errors="ignore")))


def count_pendientes_bq(db: Session) -> int:
    df = read_all_dataframe(db)
    if df.empty:
        return 0
    agg = consolidar_realizadas_dataframe(df.drop(columns=["id"], errors="ignore"))
    return len(realizadas_pendientes_sync(agg))


def preview_dataframe(db: Session, *, limit: int = 100) -> dict[str, Any]:
    limit = max(1, min(int(limit), 500))
    raw = read_all_dataframe(db)
    if raw.empty:
        total = 0
    else:
        consolidated = consolidar_realizadas_dataframe(raw.drop(columns=["id"], errors="ignore"))
        total = len(consolidated)
    pendientes = count_pendientes_bq(db)
    if total == 0:
        return {
            "success": True,
            "data": [],
            "columns": list(REALIZADAS_STAGING_COLUMNS),
            "total_rows": 0,
            "returned_count": 0,
            "config_source": "postgresql:stg_realizadas",
            "staging_mode": get_realizadas_staging_mode(),
            "staging_source": "postgresql",
            "pendientes_bq": 0,
        }

    consolidated = consolidar_realizadas_dataframe(raw.drop(columns=["id"], errors="ignore"))
    preview_df = consolidated.tail(limit).copy()

    import datetime as dt

    preview_df = preview_df.map(lambda x: x.isoformat() if isinstance(x, (dt.date, dt.datetime)) else x)
    preview_df = preview_df.fillna("")

    return {
        "success": True,
        "data": preview_df.to_dict(orient="records"),
        "columns": preview_df.columns.tolist(),
        "total_rows": total,
        "returned_count": len(preview_df),
        "config_source": "postgresql:stg_realizadas",
        "staging_mode": get_realizadas_staging_mode(),
        "staging_source": "postgresql",
        "pendientes_bq": pendientes,
    }


def with_db_session(fn):
    def wrapper(*args, **kwargs):
        db = SessionLocal()
        try:
            return fn(db, *args, **kwargs)
        finally:
            db.close()

    return wrapper


@with_db_session
def clear_realizadas_staging(db: Session) -> int:
    return clear_all(db)


@with_db_session
def append_realizadas_staging(db: Session, df: pd.DataFrame) -> int:
    return upsert_dataframe(db, df)


@with_db_session
def upsert_realizadas_staging(db: Session, df: pd.DataFrame) -> int:
    return upsert_dataframe(db, df)


@with_db_session
def read_realizadas_staging(db: Session) -> pd.DataFrame:
    return read_all_dataframe(db)


@with_db_session
def mark_realizadas_bq_sincronizado(db: Session, row_ids: list[int]) -> int:
    return mark_bq_sincronizado(db, row_ids)


@with_db_session
def mark_realizadas_bq_sincronizado_by_keys(
    db: Session,
    keys: list[tuple[str, str, str]],
) -> int:
    return mark_bq_sincronizado_by_keys(db, keys)


@with_db_session
def count_realizadas_staging_rows(db: Session) -> int:
    return count_negocio_periodo_rows(db)


@with_db_session
def count_realizadas_pendientes_bq(db: Session) -> int:
    return count_pendientes_bq(db)


@with_db_session
def preview_realizadas_staging(db: Session, *, limit: int = 100) -> dict[str, Any]:
    return preview_dataframe(db, limit=limit)
