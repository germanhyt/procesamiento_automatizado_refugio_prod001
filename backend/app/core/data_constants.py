# -*- coding: utf-8 -*-
"""Constantes del pipeline de procesamiento de ventas (legacy → BigQuery)."""

# Montos por encima de este tope se marcan como anómalos (cuarentena), no se fuerzan a 0.
MONTO_ANOMALO_TOPE: float = 50_000.0

# Clave natural para MERGE idempotente en stg_sales_silver.
BQ_SALES_MERGE_KEYS: tuple[str, ...] = (
    "CodigoNegocio",
    "FechaHora",
    "CodigoTransaccion",
    "Monto",
)

# Deduplicación de ventas (alineada con MERGE BigQuery / upsert stg_sales).
SALES_DEDUP_KEYS: tuple[str, ...] = BQ_SALES_MERGE_KEYS

# Fallback si el consolidado aún no tiene FechaHora normalizada.
CONSOLIDACION_DEDUP_FALLBACK_KEYS: tuple[str, ...] = (
    "CodigoNegocio",
    "Fecha",
    "Hora",
    "CodigoTransaccion",
    "Monto",
)

# Último recurso (layout sin transacción ni hora).
CONSOLIDACION_DEDUP_WEAK_KEYS: tuple[str, ...] = (
    "CodigoNegocio",
    "Fecha",
    "Monto",
    "Producto",
)

# Mínimo de filas para permitir TRUNCATE de tablas de referencia en BigQuery.
BQ_REF_TABLE_MIN_ROWS: int = 1

# Columnas estándar de ventas hacia BigQuery (silver).
BQ_SALES_COLUMNS: tuple[str, ...] = (
    "Fecha",
    "Hora",
    "FechaHora",
    "CodigoTransaccion",
    "Producto",
    "Cliente",
    "CodigoNegocio",
    "FechaCarga",
    "Estado",
    "Monto",
    "Cantidad",
    "CodigoUbicacion",
    "FormaPago",
    "EstadoNegocio",
    "TipoNegocio",
    "Area",
)

# Hoja Realizadas: marca de sincronización con BigQuery (0 = pendiente, 1 = sincronizado).
REALIZADAS_COL_BQ_SINCRONIZADO = "BQ_Sincronizado"

# Columnas de la hoja sales_df / tabla stg_sales (orden maestro).
SALES_STAGING_COLUMNS: tuple[str, ...] = (
    "CodigoNegocio",
    "Fecha",
    "Hora",
    "Producto",
    "Cliente",
    "Monto",
    "Cantidad",
    "CodigoTransaccion",
    "FechaHora",
    "Estado",
    "FechaCarga",
    "CodigoUbicacion",
    "EstadoNegocio",
    "TipoNegocio",
    "Area",
    "FormaPago",
)

# Modo de staging: excel | dual | postgres (variable de entorno SALES_STAGING_MODE).
SALES_STAGING_MODE_EXCEL = "excel"
SALES_STAGING_MODE_DUAL = "dual"
SALES_STAGING_MODE_POSTGRES = "postgres"

# Una fila por negocio y periodo (no por archivo ni por re-ejecución).
REALIZADAS_BUSINESS_KEYS: tuple[str, ...] = (
    "CodigoNegocio",
    "FechaInicio",
    "FechaFin",
)

# Columnas de la hoja Realizadas / tabla stg_realizadas (orden maestro).
REALIZADAS_STAGING_COLUMNS: tuple[str, ...] = (
    "CodigoNegocio",
    "RutaArchivo",
    "Cargar",
    "Añadir",
    "FechaInicio",
    "FechaFin",
    "Fecha Transaccion",
    "Fecha Inicio",
    "Fecha Fin",
    "Ventas Totales",
    "Fecha_Procesamiento_Web",
    REALIZADAS_COL_BQ_SINCRONIZADO,
)
