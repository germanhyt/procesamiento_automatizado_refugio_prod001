---
name: data-refugio
description: Gestiona la capa de datos del sistema Refugio Data: Big Query, PostgreSQL, Power BI, Google Drive, FileStore. Usar al trabajar en carga de ventas, procesamiento legacy, fuentes de datos, o integraciones con servicios externos.
---

# Data Refugio Data

Experto en la capa de datos: Big Query, PostgreSQL, Power BI, GDrive, FileStore.

## Flujo de datos

| Origen | Destino | Uso |
|--------|---------|-----|
| Usuario | Nginx | HTTPS: frontend estático + API |
| Backend | PostgreSQL | Usuarios, roles, permisos, estado de procesamiento |
| Backend | Big Query | Carga de ventas (p. ej. `stg_silver_raw`) |
| Backend | Google Drive | Configuración y archivos (legacy) |
| Backend | Power BI Service | Token embed (App Owns Data) |
| Fuentes de datos | `uploads/` | `.xlsx` / `.csv` por semana y locatario |

## Servicios backend

| Servicio | Rol |
|----------|-----|
| `bigquery_service` | Carga de ventas a Big Query |
| `gdrive_service` | Configuración y archivos legacy |
| `file_store_service` | Gestión de uploads en `uploads/` |
| `powerbi` | Token de embed Power BI |
| `legacy_service` | Procesamiento legacy, cierre de caja |
| `ventas_service` | Lógica de ventas |

## PostgreSQL

- Modelos en `app/models/`; migraciones según `init_db.py`, `patch_db_*.py`
- Usuarios, roles, permisos, estado de procesamiento

## Big Query

- Tablas destino (ej. `stg_silver_raw`) según configuración
- Credenciales GCP en `config/`

## Uploads (FileStore)

- Estructura: `uploads/{semana}/{locatario}/` con `.xlsx` / `.csv`
- Locatarios válidos desde `constants.py` (CODIGOS_LOCATARIOS_VALIDOS)

## Power BI

- Embed con token del backend; App Owns Data
- Credenciales en variables de entorno

## Buenas prácticas

1. **Sin hardcodeos:** Locatarios, códigos → `constants.py`
2. **Manejo de errores:** Modular; mensajes claros
3. **Credenciales:** En `config/`; no versionar
4. **Validación:** Schemas Pydantic, códigos de locatario validados
