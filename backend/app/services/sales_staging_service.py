# -*- coding: utf-8 -*-
"""Persistencia de ventas en PostgreSQL (staging silver local)."""
from __future__ import annotations

import logging
import os
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.data_constants import SALES_STAGING_COLUMNS
from app.database import SessionLocal
from app.models.sales_staging import StgSales
from app.services.ventas_deduplicacion import deduplicar_ventas_df
from app.services.ventas_normalizacion import sum_monto_column

logger = logging.getLogger(__name__)

_SALES_DF_TO_DB = {
    "CodigoNegocio": "codigo_negocio",
    "Fecha": "fecha",
    "Hora": "hora",
    "Producto": "producto",
    "Cliente": "cliente",
    "Monto": "monto",
    "Cantidad": "cantidad",
    "CodigoTransaccion": "codigo_transaccion",
    "FechaHora": "fecha_hora",
    "Estado": "estado",
    "FechaCarga": "fecha_carga",
    "CodigoUbicacion": "codigo_ubicacion",
    "EstadoNegocio": "estado_negocio",
    "TipoNegocio": "tipo_negocio",
    "Area": "area",
    "FormaPago": "forma_pago",
}


def get_sales_staging_mode() -> str:
    """
    excel   — solo ConfiguracionWeb.xlsx (comportamiento histórico).
    dual    — Excel + PostgreSQL (recomendado durante migración).
    postgres — solo PostgreSQL para sales_df / BQ / preview.
    """
    mode = (os.getenv("SALES_STAGING_MODE") or "excel").strip().lower()
    if mode not in ("excel", "dual", "postgres"):
        logger.warning("SALES_STAGING_MODE inválido (%s); usando excel.", mode)
        return "excel"
    return mode


def uses_postgres_staging(mode: str | None = None) -> bool:
    m = mode or get_sales_staging_mode()
    return m in ("dual", "postgres")


def uses_excel_staging(mode: str | None = None) -> bool:
    m = mode or get_sales_staging_mode()
    return m in ("excel", "dual")


def _to_date(value: Any) -> date | None:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        ts = pd.to_datetime(value, errors="coerce")
        if pd.isna(ts):
            return None
        return ts.date()
    except Exception:
        return None


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


def _to_int(value: Any, default: int = 1) -> int:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def dataframe_to_stg_rows(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Convierte filas del layout sales_df a dicts para INSERT en stg_sales."""
    if df is None or df.empty:
        return []
    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        payload: dict[str, Any] = {}
        for src, dst in _SALES_DF_TO_DB.items():
            val = row.get(src)
            if dst == "fecha":
                payload[dst] = _to_date(val)
            elif dst == "monto":
                payload[dst] = round(_to_float(val), 4)
            elif dst == "cantidad":
                payload[dst] = _to_int(val, 1)
            elif dst == "estado":
                payload[dst] = _to_float(val, 0.0)
            elif dst in ("codigo_transaccion", "cliente", "producto", "forma_pago"):
                payload[dst] = _to_str(val, "-")
            else:
                payload[dst] = _to_str(val, "")
        rows.append(payload)
    return rows


def stg_rows_to_dataframe(rows: list[StgSales]) -> pd.DataFrame:
    """Convierte registros ORM al layout sales_df (Excel/BQ)."""
    if not rows:
        return pd.DataFrame(columns=list(SALES_STAGING_COLUMNS))
    data: list[dict[str, Any]] = []
    db_to_df = {v: k for k, v in _SALES_DF_TO_DB.items()}
    for row in rows:
        item: dict[str, Any] = {}
        for db_col, df_col in db_to_df.items():
            val = getattr(row, db_col, None)
            if df_col == "Fecha" and val is not None:
                item[df_col] = val.isoformat() if hasattr(val, "isoformat") else val
            else:
                item[df_col] = val
        data.append(item)
    return pd.DataFrame(data, columns=list(SALES_STAGING_COLUMNS))


def clear_all(db: Session) -> int:
    deleted = db.query(StgSales).delete()
    db.commit()
    return int(deleted or 0)


def upsert_dataframe(db: Session, df: pd.DataFrame) -> int:
    """Inserta/actualiza filas por clave natural (misma que MERGE en BigQuery)."""
    df_clean, _ = deduplicar_ventas_df(df)
    payloads = dataframe_to_stg_rows(df_clean)
    if not payloads:
        return 0
    affected = 0
    for chunk_start in range(0, len(payloads), 500):
        chunk = payloads[chunk_start : chunk_start + 500]
        stmt = insert(StgSales).values(chunk)
        update_cols = {
            c.name: stmt.excluded[c.name]
            for c in StgSales.__table__.columns
            if c.name not in ("id", "created_at")
        }
        stmt = stmt.on_conflict_do_update(
            index_elements=[
                "codigo_negocio",
                "fecha_hora",
                "codigo_transaccion",
                "monto",
            ],
            set_=update_cols,
        )
        result = db.execute(stmt)
        affected += int(result.rowcount or 0)
    db.commit()
    return affected


def read_all_dataframe(db: Session) -> pd.DataFrame:
    rows = db.query(StgSales).order_by(StgSales.id.asc()).all()
    return stg_rows_to_dataframe(rows)


def count_rows(db: Session) -> int:
    return int(db.query(func.count(StgSales.id)).scalar() or 0)


def sum_monto(db: Session) -> float:
    rows = db.query(StgSales.monto).all()
    if not rows:
        return 0.0
    return sum_monto_column(pd.Series([r[0] for r in rows]))


def preview_dataframe(db: Session, *, limit: int = 100, offset: int = 0) -> dict[str, Any]:
    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))
    total = count_rows(db)
    if total == 0:
        return {
            "success": True,
            "data": [],
            "columns": list(SALES_STAGING_COLUMNS),
            "total_rows": 0,
            "offset": offset,
            "next_offset": 0,
            "has_more": False,
            "returned_count": 0,
            "config_source": "postgresql:stg_sales",
            "monto_column": "Monto",
            "monto_total": 0.0,
            "staging_mode": get_sales_staging_mode(),
            "staging_source": "postgresql",
        }

    end_idx = total - offset
    if end_idx <= 0:
        return {
            "success": True,
            "data": [],
            "columns": list(SALES_STAGING_COLUMNS),
            "total_rows": total,
            "offset": offset,
            "next_offset": offset,
            "has_more": False,
            "returned_count": 0,
            "config_source": "postgresql:stg_sales",
            "monto_column": "Monto",
            "monto_total": sum_monto(db),
            "staging_mode": get_sales_staging_mode(),
            "staging_source": "postgresql",
        }

    start_idx = max(0, end_idx - limit)
    rows = (
        db.query(StgSales)
        .order_by(StgSales.id.asc())
        .offset(start_idx)
        .limit(end_idx - start_idx)
        .all()
    )
    preview_df = stg_rows_to_dataframe(rows)
    returned = len(preview_df)
    next_offset = offset + returned
    has_more = start_idx > 0

    import datetime as dt

    preview_df = preview_df.map(lambda x: x.isoformat() if isinstance(x, (dt.date, dt.datetime)) else x)
    preview_df = preview_df.fillna("")

    return {
        "success": True,
        "data": preview_df.to_dict(orient="records"),
        "columns": preview_df.columns.tolist(),
        "total_rows": total,
        "offset": offset,
        "next_offset": next_offset,
        "has_more": has_more,
        "returned_count": returned,
        "config_source": "postgresql:stg_sales",
        "monto_column": "Monto",
        "monto_total": sum_monto(db),
        "staging_mode": get_sales_staging_mode(),
        "staging_source": "postgresql",
    }


def with_db_session(fn):
    """Ejecuta fn(db) con sesión propia (para LegacyService sin Depends)."""

    def wrapper(*args, **kwargs):
        db = SessionLocal()
        try:
            return fn(db, *args, **kwargs)
        finally:
            db.close()

    return wrapper


@with_db_session
def clear_staging(db: Session) -> int:
    return clear_all(db)


@with_db_session
def upsert_staging_dataframe(db: Session, df: pd.DataFrame) -> int:
    return upsert_dataframe(db, df)


@with_db_session
def read_staging_dataframe(db: Session) -> pd.DataFrame:
    return read_all_dataframe(db)


@with_db_session
def preview_staging(db: Session, *, limit: int = 100, offset: int = 0) -> dict[str, Any]:
    return preview_dataframe(db, limit=limit, offset=offset)


@with_db_session
def count_staging_rows(db: Session) -> int:
    return count_rows(db)


@with_db_session
def sum_staging_monto(db: Session) -> float:
    return sum_monto(db)
