# PROCESAMIENTO — Operación y validación

Guía rápida para puesta en marcha, scripts y comprobaciones del pipeline legacy.

---

## 1. Configuración inicial

### Variables (`config/.env`)

```env
# Staging PostgreSQL
SALES_STAGING_MODE=dual
# REALIZADAS_STAGING_MODE=dual   # opcional; hereda SALES_STAGING_MODE

# FileStore (ruta de uploads)
UPLOAD_BASE_PATH=C:/.../backend/uploads

# Excel operativo (si Drive no está disponible)
CONFIG_WEB_EXCEL_PATH=C:/.../backend/tools/ConfiguracionWeb.xlsx

# BigQuery
BQ_PROJECT_ID=...
BQ_DATASET=Ventas
BQ_TABLE_SALES=stg_sales_silver
GOOGLE_APPLICATION_CREDENTIALS=./config/credentials.json
```

### Crear tablas de staging (una vez)

```bash
cd backend
python patch_db_sales_staging.py
python patch_db_realizadas_staging.py
```

### Reiniciar servicios

Tras cambiar `.env`, reiniciar **backend** (`python main.py` o contenedor). El frontend (`yarn dev`) no requiere reinicio para el modo staging.

---

## 2. Scripts CLI (`backend/tools/`)

| Script | Uso |
|--------|-----|
| `diagnostico_procesamiento.py` | Estado FileStore, Activas, sales_df, rangos |
| `validar_staging_dual.py` | Comparar Excel vs PG (filas, montos, pendientes BQ) |
| `import_sales_df_to_staging.py` | Migrar hoja sales_df → `stg_sales` |
| `import_realizadas_to_staging.py` | Migrar hoja Realizadas → `stg_realizadas` |

Ejemplos:

```bash
python tools/diagnostico_procesamiento.py
python tools/validar_staging_dual.py

python tools/import_sales_df_to_staging.py --dry-run
python tools/import_sales_df_to_staging.py

python tools/import_realizadas_to_staging.py --clear   # TRUNCATE + importar
```

---

## 3. Flujo recomendado (semana nueva)

1. Subir reportes a **Fuentes** o botón Subir en Legacy.
2. Elegir **rango** (semana actual / última semana / libre).
3. **Consolidar** — revisar modal (duplicados, fechas).
4. **Asociar** — revisar Activas.
5. **Ventas** — confirmar si limpiar o append.
6. **BigQuery** — modo `pendiente` en operación normal.
7. Opcional: `validar_staging_dual.py` o GET `/legacy/staging-status`.

---

## 4. API de comprobación

```bash
# Estado staging (requiere backend reiniciado con código actual)
curl http://localhost:8080/api/procesamiento/legacy/staging-status

# Simular consolidación sin escribir CSV
curl -X POST "http://localhost:8080/api/procesamiento/legacy/consolidar?modo_rango=ultima_semana&dry_run=true"
```

---

## 5. Tests automatizados

### Solo pipeline de procesamiento

```bash
cd backend
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest \
  tests/test_ventas_normalizacion.py \
  tests/test_bq_sales_sync.py \
  tests/test_sales_staging_service.py \
  tests/test_realizadas_staging_service.py \
  tests/test_import_sales_staging.py \
  tests/test_ventas_deduplicacion.py -v
```

### Suite completa backend

```bash
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest tests/ -v
```

> En Windows, `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1` evita conflictos con plugins externos (p. ej. langsmith).

---

## 6. Solución de problemas

| Síntoma | Acción |
|---------|--------|
| `/staging-status` → 404 | Reiniciar backend; verificar ruta `/api/procesamiento/legacy/staging-status` |
| PG vacío en modo dual | Ejecutar `import_*_to_staging.py` o paso Ventas |
| BigQuery “sin pendientes” | Revisar `stg_realizadas` / hoja Realizadas y `BQ_Sincronizado` |
| Consolidar omite local | Revisar BaseCarga, rango de fechas y modal de resultado |
| Drive caído | Usar `CONFIG_WEB_EXCEL_PATH` local; flujo sigue con `/tmp/refugio_data` |

---

Ver también: [PROCESAMIENTO_FLUJO_ACTUAL.md](./PROCESAMIENTO_FLUJO_ACTUAL.md), [PROCESAMIENTO_CAMBIOS_REFACTOR.md](./PROCESAMIENTO_CAMBIOS_REFACTOR.md).
