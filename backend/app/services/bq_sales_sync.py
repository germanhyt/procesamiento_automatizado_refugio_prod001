# -*- coding: utf-8 -*-
"""Sincronización idempotente de ventas hacia BigQuery (MERGE + delta por Realizadas)."""
from __future__ import annotations

import logging
import uuid
from typing import Any

import pandas as pd
from google.cloud import bigquery

from app.core.data_constants import (
    BQ_REF_TABLE_MIN_ROWS,
    BQ_SALES_COLUMNS,
    BQ_SALES_MERGE_KEYS,
    REALIZADAS_BUSINESS_KEYS,
    REALIZADAS_COL_BQ_SINCRONIZADO,
)

logger = logging.getLogger(__name__)


def _activar_flag(val) -> bool:
    """Excel puede devolver 1, 1.0, '1', True, etc."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return False
    if isinstance(val, bool):
        return bool(val)
    if isinstance(val, (int, float)):
        try:
            return int(float(val)) == 1
        except (TypeError, ValueError):
            return False
    s = str(val).strip().lower()
    return s in ("1", "true", "sí", "si", "yes", "y")


def realizadas_pendientes_sync(realizadas_df: pd.DataFrame) -> pd.DataFrame:
    """Filas de Realizadas aún no marcadas como sincronizadas en BigQuery."""
    if realizadas_df is None or realizadas_df.empty:
        return pd.DataFrame()
    df = realizadas_df.copy()
    if REALIZADAS_COL_BQ_SINCRONIZADO not in df.columns:
        df[REALIZADAS_COL_BQ_SINCRONIZADO] = 0
    mask = ~df[REALIZADAS_COL_BQ_SINCRONIZADO].apply(_activar_flag)
    return df.loc[mask].copy()


def filtrar_sales_df_por_realizadas(
    sales_df: pd.DataFrame,
    realizadas_pendientes: pd.DataFrame,
) -> pd.DataFrame:
    """
    Extrae de sales_df las filas que corresponden a cargas pendientes de sincronizar,
    usando CodigoNegocio y rango FechaInicio–FechaFin de cada fila en Realizadas.
    """
    if sales_df is None or sales_df.empty:
        return pd.DataFrame()
    if realizadas_pendientes is None or realizadas_pendientes.empty:
        return sales_df.copy()

    if "CodigoNegocio" not in sales_df.columns or "Fecha" not in sales_df.columns:
        return sales_df.copy()

    sales = sales_df.copy()
    sales["_fecha_norm"] = pd.to_datetime(sales["Fecha"], errors="coerce", format="mixed", dayfirst=True)

    partes: list[pd.DataFrame] = []
    for _, row in realizadas_pendientes.iterrows():
        codigo = row.get("CodigoNegocio")
        if codigo is None or (isinstance(codigo, float) and pd.isna(codigo)):
            continue
        codigo_s = str(codigo).strip()
        d0 = pd.to_datetime(row.get("FechaInicio"), errors="coerce")
        d1 = pd.to_datetime(row.get("FechaFin"), errors="coerce")
        if pd.isna(d0) or pd.isna(d1):
            sub = sales.loc[sales["CodigoNegocio"].astype(str).str.strip() == codigo_s]
        else:
            sub = sales.loc[
                (sales["CodigoNegocio"].astype(str).str.strip() == codigo_s)
                & sales["_fecha_norm"].notna()
                & (sales["_fecha_norm"] >= d0.normalize())
                & (sales["_fecha_norm"] < d1.normalize() + pd.Timedelta(days=1))
            ]
        if not sub.empty:
            partes.append(sub)

    if not partes:
        return sales.iloc[0:0].copy()

    out = pd.concat(partes, ignore_index=False)
    out = out.drop(columns=["_fecha_norm"], errors="ignore")
    return out.drop_duplicates()


def _merge_on_clause(keys: tuple[str, ...]) -> str:
    parts: list[str] = []
    for key in keys:
        if key == "Monto":
            parts.append(
                "COALESCE(CAST(T.Monto AS FLOAT64), 0) = COALESCE(CAST(S.Monto AS FLOAT64), 0)"
            )
        else:
            parts.append(f"COALESCE(CAST(T.{key} AS STRING), '') = COALESCE(CAST(S.{key} AS STRING), '')")
    return " AND ".join(parts)


def merge_sales_dataframe(
    client: bigquery.Client,
    df: pd.DataFrame,
    *,
    project_id: str,
    dataset: str,
    table_name: str,
    schema,
    cast_fn,
) -> dict[str, Any]:
    """
    Carga df a tabla temporal y ejecuta MERGE idempotente hacia la tabla destino.
    Retorna filas afectadas (inserciones nuevas).
    """
    if df is None or df.empty:
        return {"filas_merge": 0, "filas_origen": 0, "temp_table": None}

    cols = [c for c in BQ_SALES_COLUMNS if c in df.columns]
    payload = cast_fn(df[cols].copy(), schema)

    target = f"`{project_id}.{dataset}.{table_name}`"
    temp_name = f"_tmp_sales_merge_{uuid.uuid4().hex[:12]}"
    temp_id = f"{project_id}.{dataset}.{temp_name}"
    temp_ref = f"`{temp_id}`"

    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    load_job = client.load_table_from_dataframe(payload, temp_id, job_config=job_config)
    load_job.result()

    insert_cols = list(
        dict.fromkeys(c for c in BQ_SALES_COLUMNS if c in payload.columns)
    )
    cols_sql = ", ".join(f"`{c}`" for c in insert_cols)
    vals_sql = ", ".join(f"S.`{c}`" for c in insert_cols)

    merge_sql = f"""
        MERGE {target} T
        USING {temp_ref} S
        ON {_merge_on_clause(BQ_SALES_MERGE_KEYS)}
        WHEN NOT MATCHED THEN INSERT ({cols_sql}) VALUES ({vals_sql})
    """
    merge_job = client.query(merge_sql)
    merge_job.result()
    filas_merge = int(merge_job.num_dml_affected_rows or 0)

    try:
        client.delete_table(temp_id, not_found_ok=True)
    except Exception as exc:
        logger.warning("No se pudo borrar tabla temporal BQ %s: %s", temp_id, exc)

    return {
        "filas_merge": filas_merge,
        "filas_origen": len(payload),
        "temp_table": temp_name,
    }


def marcar_realizadas_sincronizadas(
    realizadas_df: pd.DataFrame,
    indices_pendientes: pd.Index,
) -> pd.DataFrame:
    """Marca BQ_Sincronizado=1 en las filas procesadas (por índice)."""
    if realizadas_df is None or realizadas_df.empty:
        return realizadas_df
    out = realizadas_df.copy()
    if REALIZADAS_COL_BQ_SINCRONIZADO not in out.columns:
        out[REALIZADAS_COL_BQ_SINCRONIZADO] = 0
    out.loc[indices_pendientes, REALIZADAS_COL_BQ_SINCRONIZADO] = 1
    return out


def marcar_realizadas_sincronizadas_por_pendientes(
    realizadas_df: pd.DataFrame,
    pendientes_df: pd.DataFrame,
) -> pd.DataFrame:
    """Marca BQ_Sincronizado=1 por clave negocio + periodo (CodigoNegocio, FechaInicio, FechaFin)."""
    if realizadas_df is None or realizadas_df.empty or pendientes_df is None or pendientes_df.empty:
        return realizadas_df
    out = realizadas_df.copy()
    if REALIZADAS_COL_BQ_SINCRONIZADO not in out.columns:
        out[REALIZADAS_COL_BQ_SINCRONIZADO] = 0

    def _norm(val) -> str:
        if val is None or (isinstance(val, float) and pd.isna(val)):
            return ""
        return str(val).strip().upper()

    for _, prow in pendientes_df.iterrows():
        mask = pd.Series(True, index=out.index)
        for key in REALIZADAS_BUSINESS_KEYS:
            if key not in out.columns or key not in pendientes_df.columns:
                continue
            mask &= out[key].map(_norm) == _norm(prow.get(key))
        out.loc[mask, REALIZADAS_COL_BQ_SINCRONIZADO] = 1
    return out


def sync_reference_table_truncate(
    client: bigquery.Client,
    df: pd.DataFrame,
    *,
    project_id: str,
    dataset: str,
    table_name: str,
    cast_fn,
    min_rows: int = BQ_REF_TABLE_MIN_ROWS,
) -> dict[str, Any]:
    """TRUNCATE + carga de tabla de referencia (Negocios, Categorias) con validación mínima."""
    if df is None or df.empty or len(df) < min_rows:
        return {
            "success": False,
            "skipped": True,
            "reason": f"menos_de_{min_rows}_filas",
            "rows": 0,
        }

    table_ref_id = f"{project_id}.{dataset}.{table_name}"
    bq_ref_table = client.get_table(table_ref_id)
    df_cast = cast_fn(df, bq_ref_table.schema)
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=True,
    )
    job = client.load_table_from_dataframe(df_cast, table_ref_id, job_config=job_config)
    job.result()
    return {
        "success": True,
        "skipped": False,
        "rows": int(job.output_rows or len(df_cast)),
    }
