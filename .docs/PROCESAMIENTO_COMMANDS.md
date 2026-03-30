# Comandos — procesamiento y datos (Refugio Data)

Guía **paso a paso** para entorno **local** y **producción** del flujo de **procesamiento**: **Big Query**, **Google Drive** (legacy), **Power BI**, **uploads** (`uploads/`), **usuarios/RBAC**, y rutas web principales del SPA.

El **mismo repositorio** incluye el módulo **Delivery**. Backend, PostgreSQL, Docker y la red `app_shared_network` son **compartidos**. Para API delivery, panel delivery, kiosk/runner, WebSocket y EAS, ver [**DELIVERY_COMMANDS.md**](./DELIVERY_COMMANDS.md).

> **Secretos**  
> Documentá *dónde* va cada credencial y *qué variable* usar. **No** pegues claves, client secrets ni JSON de cuenta de servicio dentro de archivos `.md` versionados.

Documentación relacionada:

- [README.md](../README.md) — arquitectura y tabla de rutas
- [PROCESAMIENTO_PLAN_IMPLEMENTACION_DETALLADO.md](./PROCESAMIENTO_PLAN_IMPLEMENTACION_DETALLADO.md)
- [Skill data-refugio](../.cursor/skills/data-refugio/SKILL.md)

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Estructura relevante](#2-estructura-relevante)
3. [Dos capas de configuración: raíz vs `config/`](#3-dos-capas-de-configuración-raíz-vs-config)
4. [Variables de entorno (referencia)](#4-variables-de-entorno-referencia)
5. [Local — paso a paso](#5-local--paso-a-paso)
6. [Frontend — rutas y comandos](#6-frontend--rutas-y-comandos)
7. [Backend — scripts y diagnóstico](#7-backend--scripts-y-diagnóstico)
8. [Uploads y FileStore](#8-uploads-y-filestore)
9. [Base de datos](#9-base-de-datos)
10. [Producción — Docker](#10-producción--docker)
11. [VPS y Nginx](#11-vps-y-nginx)
12. [Resumen rápido](#12-resumen-rápido)
13. [Prevención: problemas frecuentes](#13-prevención-problemas-frecuentes)

---

## 1. Requisitos

| Herramienta | Uso |
|-------------|-----|
| Python 3.12+ | Backend FastAPI |
| Node.js 20+ y Yarn | Frontend Vite |
| PostgreSQL | Usuarios, estado de procesamiento, permisos |
| Proyecto **GCP** + cuenta de servicio | Big Query |
| Entra ID / app registrada | Power BI (client credentials) |
| Docker / Docker Compose | Producción |

---

## 2. Estructura relevante

| Ruta | Rol |
|------|-----|
| `backend/app/api/procesamiento.py`, `fuentes`, `file_store`, `auth`, `users_roles`, `powerbi` | Routers REST |
| `backend/app/services/bigquery_service.py` | Cargas a Big Query |
| `backend/app/services/gdrive_service.py` | Integración Drive (legacy) |
| `backend/app/services/file_store_service.py` | Gestión de `uploads/` |
| `backend/app/services/legacy_service.py`, `ventas_service.py` | Lógica legacy / ventas |
| `backend/app/services/powerbi.py` | Token embed Power BI |
| `backend/init_db.py` | Inicialización de esquema |
| `backend/patch_db_delivery.py` | Solo si usáis Delivery en ese entorno |
| `backend/tools/verify_legacy_preprocess.py` | Verificación flujo legacy |
| `backend/tools/test_consolidado.py`, `test_consolidacion_rango_fecha.py` | Pruebas de consolidación |
| `config/` | `.env` del proyecto, `credentials.json` GCP |
| `uploads/` | Archivos subidos por semana/locatario |
| `docker-compose.yml` | Backend + frontend |

---

## 3. Dos capas de configuración: raíz vs `config/`

En muchos despliegues coexisten:

| Archivo | Quién lo usa | Contenido típico |
|---------|--------------|------------------|
| **`.env` en la raíz del repo** | `docker-compose.yml` (interpolación `POSTGRES_USER`, etc.) | Variables que Compose inyecta al contenedor |
| **`config/.env`** | Código Python (`database.py`, `security.py`, servicios) vía `load_dotenv` hacia `config/.env` | `SECRET_KEY`, `POSTGRES_*`, Power BI, rutas, claves de integración |

**Prevención:** Si el backend en Docker “no ve” la BD o Power BI pero el contenedor arranca, revisad que el volumen `./config:/app/config` exista y que dentro vaya el mismo `.env` coherente con la raíz (o que las variables críticas estén definidas en el `env_file` / `environment` del servicio). Un error típico es tener credenciales solo en la raíz del repo y no en `config/.env`, o viceversa.

---

## 4. Variables de entorno (referencia)

### 4.1 Base de datos y JWT

| Variable | Uso |
|----------|-----|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB` | Construyen la URL en `backend/app/database.py` |
| `SECRET_KEY` | JWT |

Ruta efectiva del `.env` para SQLAlchemy: **`config/.env`** relativo a la raíz del repo (no al cwd del proceso, salvo que cambiéis código).

### 4.2 Power BI (servicio `PowerBIService`)

Definidas en `backend/app/services/powerbi.py` (carga adicional `load_dotenv("config/.env")` desde `backend/` al ejecutar):

| Variable |
|----------|
| `PBI_CLIENT_ID` |
| `PBI_CLIENT_SECRET` |
| `PBI_TENANT_ID` |
| `PBI_WORKSPACE_ID` |
| `PBI_REPORT_ID` |

**Prevención:** Si el informe en el frontend muestra error de embed o token, revisad en Azure que la app tenga permisos sobre el workspace y que los IDs de grupo/workspace/report no tengan espacios ni comillas en `.env`.

### 4.3 GCP / Big Query

Suele usarse JSON de cuenta de servicio en **`config/credentials.json`** (o ruta que indique vuestro código de settings). El archivo **no** debe estar en git.

Permisos típicos: rol que permita escribir en el dataset/tablas de staging (p. ej. `BigQuery Data Editor` + `Job User` según política del proyecto).

### 4.4 Frontend

| Variable | Uso |
|----------|-----|
| `VITE_API_URL` | `https://tu-dominio/api` o `http://localhost:8080/api` |
| `VITE_WS_URL` | Solo necesaria si usáis el panel **Delivery** en el mismo SPA; ver [DELIVERY_COMMANDS.md](./DELIVERY_COMMANDS.md) |

### 4.5 Procesamiento legacy / Big Query (backend)

Usadas en `backend/app/api/procesamiento.py` y herramientas como `tools/test_consolidado.py` (nombres exactos en código):

| Variable | Rol |
|----------|-----|
| `DRIVE_ID_ARCHIVO_CONFIGURACION` | ID del archivo/carpeta de configuración en Drive |
| `DRIVE_ID_CARPETA_CIERRECAJA` | Carpeta de cierres / ventas |
| `DRIVE_ID_CARPETA_PROCESADOS` | Carpeta de procesados |
| `BQ_PROJECT_ID` | Proyecto GCP |
| `BQ_DATASET` | Dataset de Big Query |

Los IDs de Drive suelen copiarse desde la URL de Google Drive; el código hace `strip` de comillas por si en el `.env` quedaron envueltos en `"..."`.

---

## 5. Local — paso a paso

### 5.1 Preparar `config/`

1. Crear `config/.env` con BD y `SECRET_KEY`.
2. Copiar credencial GCP a `config/credentials.json` (nombre exacto según vuestro `settings`).
3. Completar variables Power BI si probáis `/powerbi`.

### 5.2 `uploads/`

En la raíz del repo:

```bash
mkdir -p uploads
```

En Windows (PowerShell): `New-Item -ItemType Directory -Force -Path uploads`

### 5.3 Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
python init_db.py
```

Si en local también usáis Delivery:

```bash
python patch_db_delivery.py
```

```bash
python main.py
```

API por defecto: `http://0.0.0.0:8080` (ver `backend/README.md`).

### 5.4 Frontend

```bash
cd frontend
yarn install
```

`frontend/.env`:

```env
VITE_API_URL=http://localhost:8080/api
```

```bash
yarn dev
```

### 5.5 Comprobaciones rápidas

```bash
curl -sS http://localhost:8080/
curl -sS -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/x-www-form-urlencoded" -d "username=USUARIO&password=CLAVE"
```

Sustituid credenciales por las válidas en vuestra BD (no las documentéis aquí).

---

## 6. Frontend — rutas y comandos

### 6.1 Rutas principales (SPA)

Según [README.md](../README.md):

| Ruta | Descripción |
|------|-------------|
| `/login` | Login |
| `/bienvenida` | Dashboard |
| `/fuentes` | Subida por semana/locatario (`uploads/`) |
| `/legacy` | Flujo legacy, Drive, carga Big Query |
| `/powerbi` | Informe embebido |
| `/users` | Usuarios, roles, permisos |
| `/delivery` | Módulo Delivery (permiso `delivery:view`) |

### 6.2 Comandos

```bash
cd frontend
yarn dev
yarn lint
yarn build
yarn preview
```

Tras `yarn build`, validad que no hay errores de TypeScript; el mismo build es el que empaqueta Docker/Nginx.

---

## 7. Backend — scripts y diagnóstico

Ejecutar desde **`backend/`** con venv y `PYTHONPATH` correcto (los scripts en `tools/` suelen añadir el directorio `backend` al path internamente).

### 7.1 Legacy / preprocesado (sin llamar a BigQuery)

Verificación local de `_activar_cargar`, preprocesado y filas JSON (ver docstring del script):

```bash
cd backend
source venv/bin/activate
python tools/verify_legacy_preprocess.py
```

### 7.2 Consolidado / rangos de fechas

```bash
python tools/test_consolidado.py
python tools/test_consolidacion_rango_fecha.py
```

Usad estos como **diagnóstico** ante discrepancias en números consolidados; revisad fechas y entorno contra producción antes de ejecutar nada destructivo.

### 7.3 Base de datos de prueba

```bash
python test_db.py
```

Útil para comprobar conectividad PostgreSQL con las mismas variables que el resto del backend.

### 7.4 Logs en Docker

```bash
docker compose logs -f datarefugio_backend
docker compose logs --tail=200 datarefugio_backend
```

---

## 8. Uploads y FileStore

- Estructura esperada: **`uploads/{semana}/{locatario}/`** con extensiones permitidas (`.xlsx`, `.csv`) según validación del backend / `constants`.
- El volumen Docker `./uploads:/app/uploads` debe existir en el host con permisos de escritura para el usuario del proceso en contenedor (uid efectivo del contenedor).

**Prevención:**

| Problema | Acción |
|-----------|--------|
| Archivo subido “desaparece” al reiniciar | Montar volumen persistente; no guardar solo dentro del layer del contenedor sin volumen |
| 413 Request Entity Too Large | Subir `client_max_body_size` en Nginx frente al endpoint de upload |
| Locatario inválido | Revisar códigos en constantes del backend; sin hardcodear en frontend |

---

## 9. Base de datos

| Acción | Comando |
|--------|---------|
| Inicial / desarrollo | `python init_db.py` desde `backend/` |
| Delivery | `python patch_db_delivery.py` si el módulo está activo |

En Docker (solo cuando proceda según política del equipo):

```bash
docker exec -it datarefugio_backend bash -lc 'cd /app && python patch_db_delivery.py'
```

**Producción:** acordar si `init_db.py` es idempotente o destructivo antes de ejecutarlo contra datos reales.

---

## 10. Producción — Docker

### 10.1 Red externa

```bash
docker network create app_shared_network
```

### 10.2 Archivos y secretos

1. Raíz: `.env` para Compose.
2. `config/.env` + `config/credentials.json` montados en el contenedor.
3. Carpeta `uploads/` en el host.

### 10.3 Despliegue

```bash
docker compose build --no-cache
docker compose up -d
docker compose ps
```

### 10.4 Frontend

Si cambian `VITE_API_URL` o `VITE_WS_URL` en `docker-compose.yml`:

```bash
docker compose build datarefugio_frontend
docker compose up -d datarefugio_frontend
```

---

## 11. VPS y Nginx

- TLS (Let’s Encrypt u otro) en el proxy.
- Proxy a contenedores en `app_shared_network`.
- Cabeceras `X-Forwarded-Proto` para que enlaces y redirects detrás de HTTPS sean correctos.

Si el mismo host sirve **Delivery** con WebSocket, el bloque `location /api/delivery/ws` debe estar bien configurado ([DELIVERY_COMMANDS.md](./DELIVERY_COMMANDS.md) §9 y `backend/tools/nginx-api-websocket.example.conf`).

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 12. Resumen rápido

| Objetivo | Comando |
|----------|---------|
| Backend local | `cd backend && source venv/bin/activate && python main.py` |
| Init BD | `python init_db.py` |
| Frontend local | `cd frontend && yarn dev` |
| GCP local | `config/credentials.json` + variables en `config/.env` |
| Power BI | `PBI_*` en `config/.env` |
| Docker | `docker network create app_shared_network` → `docker compose up -d --build` |
| Logs | `docker compose logs -f datarefugio_backend` |
| Delivery | [DELIVERY_COMMANDS.md](./DELIVERY_COMMANDS.md) |

---

## 13. Prevención: problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---------|----------------|-----------|
| Big Query permission denied | Cuenta de servicio sin rol en dataset/proyecto | IAM en GCP; JSON correcto en `config/` |
| Big Query not found | Dataset/tabla renombrados | Alinear configuración en código con proyecto real |
| Power BI: error al obtener token | `PBI_CLIENT_SECRET` incorrecto o app revocada | Rotar secret en Azure; actualizar `.env` |
| Power BI: informe no carga | `PBI_REPORT_ID` / `PBI_WORKSPACE_ID` incorrectos | IDs desde portal Power BI / API |
| Upload falla por tamaño | Límite Nginx | `client_max_body_size` |
| Upload falla 500 | Permisos en `uploads/` o ruta | `chmod`/`chown` en host; volumen montado |
| Frontend llama al API equivocado | `VITE_API_URL` vieja en imagen | Rebuild frontend |
| Variables “no leídas” en Docker | `config/.env` no montado o distinto al esperado | Revisar `volumes` en `docker-compose.yml` |
| Datos inconsistentes tras legacy | Preprocesado o fechas | `verify_legacy_preprocess.py`, revisar logs |
| Error tabla delivery al usar ambos módulos | Sin parche en ese entorno | `patch_db_delivery.py` |

---

*Alineado con [README.md](../README.md), `backend/app/database.py`, `backend/app/services/powerbi.py` y `docker-compose.yml`.*
