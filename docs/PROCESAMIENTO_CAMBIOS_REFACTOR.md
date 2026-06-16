# PROCESAMIENTO — Cambios del refactor (Fases 1–5)

Resumen de mejoras aplicadas al pipeline legacy de ventas. Objetivo: datos más limpios, idempotencia en BigQuery y migración progresiva de Excel a PostgreSQL.

---

## Problemas originales (referencia)

| ID | Problema | Estado |
|----|----------|--------|
| C1 | Excel como única BD operativa del pipeline | **Mitigado** — staging PG en modo dual/postgres |
| C2 | BigQuery con carga no idempotente (duplicados al re-ejecutar) | **Resuelto** — MERGE por clave natural |
| C3 | Montos > 50k mutados silenciosamente a 0 | **Resuelto** — cuarentena explícita |
| C4 | Registros sintéticos si faltaba un archivo | **Eliminado** — omisión con warning |
| — | Servicios huérfanos (`ventas_service`, `conversion_service`, `bigquery_service`) | **Eliminados** |
| — | Motor de predicción comentado en legacy | **Eliminado** |
| — | Deduplicación débil (Fecha+Negocio+Monto+Producto) | **Resuelto** — clave BQ |

---

## Fase 1 — BigQuery idempotente

**Nuevo:** `backend/app/services/bq_sales_sync.py`

- MERGE hacia `stg_sales_silver` por `CodigoNegocio`, `FechaHora`, `CodigoTransaccion`, `Monto`.
- Modo `pendiente`: solo ventas ligadas a Realizadas sin `BQ_Sincronizado`; marca sincronizadas tras éxito.
- Modo `completo`: MERGE de todo el staging (recuperación).
- API: `POST /legacy/cargar-bigquery?modo_sync=pendiente|completo`.
- TRUNCATE de Negocios/Categorias solo con validación mínima de filas.

---

## Fase 2 — Normalización y datos limpios

**Nuevo:** `backend/app/services/ventas_normalizacion.py`

- `MONTO_ANOMALO_TOPE = 50_000` en `data_constants.py`.
- Montos anómalos → cuarentena (excluidos del pipeline).
- Eliminado `_create_default_records()` (sin filas sintéticas).

---

## Fase 3 — Limpieza de deuda

- Eliminados servicios no usados y código de predicción en `legacy_service.py`.
- Vista previa FileStore y sales_df con `monto_total` y paginación (`offset`).

---

## Fase 4.1 — Staging PostgreSQL (`stg_sales`)

| Componente | Descripción |
|------------|-------------|
| Modelo | `backend/app/models/sales_staging.py` |
| Servicio | `backend/app/services/sales_staging_service.py` |
| Patch BD | `backend/patch_db_sales_staging.py` |
| Variable | `SALES_STAGING_MODE=excel\|dual\|postgres` |

Integrado en: cargar ventas, clear, BigQuery, preview sales_df.

---

## Fase 4.2 — Migración histórica sales_df

- `GET /legacy/staging-status`
- `POST /legacy/import-staging-excel` (`clear_before`, `dry_run`)
- CLI: `backend/tools/import_sales_df_to_staging.py`
- UI: badge staging + botón `sales → PG` (superuser)

---

## Fase 4.3 — Staging Realizadas (`stg_realizadas`)

| Componente | Descripción |
|------------|-------------|
| Modelo | `backend/app/models/realizadas_staging.py` |
| Servicio | `backend/app/services/realizadas_staging_service.py` |
| Patch BD | `backend/patch_db_realizadas_staging.py` |
| Variable | `REALIZADAS_STAGING_MODE` (hereda `SALES_STAGING_MODE`) |

- Clave de negocio: `CodigoNegocio + FechaInicio + FechaFin` (índice único `ix_stg_realizadas_negocio_periodo`).
- `consolidar_realizadas_dataframe()` — vista previa, upsert y merge en Ventas devuelven una fila por negocio/periodo.
- `BQ_Sincronizado` se marca por clave de negocio/periodo (no por ruta ni timestamp).
- Preview Realizadas desde PostgreSQL en modo dual/postgres.
- CLI: `backend/tools/import_realizadas_to_staging.py`
- Migración histórica duplicados: `backend/patch_realizadas_consolidar.py`

---

## Fase 5 — Deduplicación endurecida

**Nuevo:** `backend/app/services/ventas_deduplicacion.py`

Claves (en orden de preferencia):

1. **BQ natural:** `CodigoNegocio`, `FechaHora`, `CodigoTransaccion`, `Monto`
2. **Fallback consolidación:** + `Fecha`, `Hora`
3. **Débil:** `CodigoNegocio`, `Fecha`, `Monto`, `Producto`

Aplicado en:

- Consolidar (paso 1) — respuesta incluye `claves_dedup` y `duplicados_eliminados`
- Append sales_df (paso 3)

---

## Tests automatizados (pipeline)

| Archivo | Cobertura |
|---------|-----------|
| `test_ventas_normalizacion.py` | Montos, cuarentena |
| `test_bq_sales_sync.py` | MERGE, filtro Realizadas |
| `test_sales_staging_service.py` | Mapeo stg_sales |
| `test_realizadas_staging_service.py` | Mapeo stg_realizadas |
| `test_import_sales_staging.py` | Import / status |
| `test_ventas_deduplicacion.py` | Claves dedup |

Ejecutar (desde `backend/`):

```bash
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest \
  tests/test_ventas_normalizacion.py \
  tests/test_bq_sales_sync.py \
  tests/test_sales_staging_service.py \
  tests/test_realizadas_staging_service.py \
  tests/test_import_sales_staging.py \
  tests/test_ventas_deduplicacion.py -v
```

---

## Estado en entorno local (última validación)

Con `SALES_STAGING_MODE=dual` en `config/.env`:

- Tablas `stg_sales` y `stg_realizadas` creadas.
- Migración histórica: 563 filas sales, 4 Realizadas (montos Excel = PG).
- Dry-run consolidación `ultima_semana`: dedup con clave BQ operativa.

**Requisito:** reiniciar el backend tras cambiar `.env` para que la API exponga `/staging-status` y lea el modo dual.

---

Ver también: [PROCESAMIENTO_FLUJO_ACTUAL.md](./PROCESAMIENTO_FLUJO_ACTUAL.md), [PROCESAMIENTO_OPERACION.md](./PROCESAMIENTO_OPERACION.md).
