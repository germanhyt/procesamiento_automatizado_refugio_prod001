# Comandos — módulo Delivery (Refugio Data)

Guía **paso a paso** para entorno **local** y **producción** del **módulo Delivery**: API (`/api/delivery/*`), panel web, WebSocket, apps **kiosk** y **runner**.

El mismo repositorio incluye el flujo de **procesamiento** (Big Query, uploads, Power BI). La infraestructura Docker, red `app_shared_network` y backend son **compartidos**. Para comandos centrados en datos y cargas, ver **[PROCESAMIENTO_COMMANDS.md](./PROCESAMIENTO_COMMANDS.md)**.

> **Seguridad y documentación**  
> Aquí se detallan *procedimientos* y *nombres* de variables. **No** pegues en este archivo ni en git valores reales de contraseñas, `SECRET_KEY`, `FIDELIO_API_KEY`, tokens Expo/JWT u otros secretos. Usa un gestor de secretos o `.env` locales ignorados por git.

Documentación relacionada:

- [DELIVERY_DOC_DETALLE.md](./DELIVERY_DOC_DETALLE.md) — funcionalidad y flujos
- [DELIVERY_BUILD_APK_DISTRIBUCION.md](./DELIVERY_BUILD_APK_DISTRIBUCION.md) — APK, iconos, `versionCode`, distribución interna
- `backend/tools/nginx-api-websocket.example.conf` — ejemplo Nginx para WebSocket en producción

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Estructura relevante](#2-estructura-relevante)
3. [Variables de entorno (referencia)](#3-variables-de-entorno-referencia)
4. [Local — paso a paso](#4-local--paso-a-paso)
5. [Backend Delivery — comandos y herramientas](#5-backend-delivery--comandos-y-herramientas)
6. [Frontend — panel administrativo Delivery](#6-frontend--panel-administrativo-delivery)
7. [Base de datos (Delivery)](#7-base-de-datos-delivery)
8. [Producción — Docker](#8-producción--docker)
9. [VPS — Nginx y WebSocket](#9-vps--nginx-y-websocket)
10. [Apps móviles (Expo) — desarrollo](#10-apps-móviles-expo--desarrollo)
11. [Expo / EAS — despliegue y builds](#11-expo--eas--despliegue-y-builds)
12. [Resumen rápido](#12-resumen-rápido)
13. [Prevención: problemas vistos en operación](#13-prevención-problemas-vistos-en-operación)

---

## 1. Requisitos


| Herramienta                                | Uso                            |
| ------------------------------------------ | ------------------------------ |
| Python 3.12+                               | Backend FastAPI                |
| Node.js 20+ y Yarn                         | Frontend y monorepo `mobile/`  |
| PostgreSQL                                 | Base de datos                  |
| Docker y Docker Compose                    | Despliegue producción          |
| Cuenta [Expo](https://expo.dev)            | EAS Build / actualizaciones    |
| Android Studio + platform-tools (opcional) | `adb`, emuladores, diagnóstico |


---

## 2. Estructura relevante


| Ruta                                                 | Rol                                                   |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `backend/app/api/delivery.py`                        | Endpoints, WebSocket `/delivery/ws`, webhook Fidelio  |
| `backend/app/core/delivery_constants.py`             | Estados, timeouts, nombre env `FIDELIO_API_KEY`       |
| `backend/patch_db_delivery.py`                       | Esquema/tablas delivery (incl. push tokens si aplica) |
| `backend/tools/mock_fidelio_sender.py`               | Simular webhook Fidelio                               |
| `backend/tools/test_delivery_flow.py`                | Flujo E2E por HTTP                                    |
| `backend/tools/cleanup_delivery_test_data.py`        | Borrar datos de prueba por prefijo                    |
| `frontend/src/pages/delivery/DeliveryPanel.tsx`      | Panel operación + WS                                  |
| `frontend/src/pages/delivery/DeliveryAdminTable.tsx` | Tabla admin (`delivery:admin`)                        |
| `frontend/src/services/deliveryService.ts`           | REST + construcción URL WebSocket                     |
| `frontend/src/hooks/useDeliveryWS.ts`                | Hook WebSocket en web                                 |
| `mobile/apps/kiosk/`, `mobile/apps/runner/`          | Apps Expo                                             |
| `mobile/packages/delivery-api/`                      | Cliente HTTP; `getApiBaseUrl`, `wsUrl`                |
| `mobile/packages/hooks/src/useDeliveryWS.ts`         | Hook WS móvil (reintentos)                            |
| `config/`                                            | `.env` proyecto (BD, JWT, integraciones)              |


---

## 3. Variables de entorno (referencia)


| Variable              | Dónde                                     | Uso                                                                                                                                                                                                        |
| --------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SECRET_KEY`          | `config/.env`                             | Firma JWT; **debe coincidir** en todos los procesos que validen tokens (mismo valor en local/Docker si compartes misma BD de prueba).                                                                      |
| `POSTGRES_*`          | `config/.env`                             | Conexión SQLAlchemy (ver `backend/app/database.py`).                                                                                                                                                       |
| `FIDELIO_API_KEY`     | `config/.env`                             | Si está definida, el webhook `POST /api/delivery/webhooks/fidelio/order-ready` exige cabecera `X-API-Key` con ese valor. Si está vacía, el webhook puede quedar abierto (solo para desarrollo controlado). |
| `VITE_API_URL`        | `frontend/.env`                           | Base **con** sufijo `/api`, p. ej. `http://localhost:8080/api`.                                                                                                                                            |
| `VITE_WS_URL`         | `frontend/.env`                           | Origen WebSocket **sin** path; p. ej. `ws://localhost:8080` o `wss://api.tu-dominio.com`. El código añade `/api/delivery/ws?token=...`.                                                                    |
| `EXPO_PUBLIC_API_URL` | `mobile/apps/*/.env` o `eas.json` → `env` | Origen HTTP **sin** `/api`; el cliente en `delivery-api` concatena `+ '/api'`. **No** dupliques `/api` en el valor.                                                                                        |
| `EXPO_PUBLIC_WS_URL`  | igual                                     | Origen WS **sin** path; p. ej. `wss://api.tu-dominio.com`.                                                                                                                                                 |


Incoherencia típica: poner `EXPO_PUBLIC_API_URL` con `/api` y terminar con rutas `//api/api/...`. Revisar `mobile/packages/delivery-api/src/client.ts` si algo “404 en todo”.

---

## 4. Local — paso a paso

Raíz del repositorio: carpeta con `backend/`, `frontend/`, `config/`.

### 4.1 `config/.env`

1. Obtén plantilla del equipo (sin secretos en git).
2. Completa BD y `SECRET_KEY`.
3. Opcional: `FIDELIO_API_KEY` si pruebas el webhook con clave.

### 4.2 Puertos

- Backend: por defecto `**0.0.0.0:8080`** (ver `backend/README.md`).
- Frontend Vite: suele ser **5173** u otro que muestre la consola.

### 4.3 Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
python init_db.py
python patch_db_delivery.py
python main.py
```

### 4.4 Frontend

`frontend/.env` o `.env.local`:

```env
VITE_API_URL=http://localhost:8080/api
VITE_WS_URL=ws://localhost:8080
```

```bash
cd frontend
yarn install
yarn dev
```

### 4.5 Verificación rápida

```bash
curl -sS http://localhost:8080/
curl -sS -H "Authorization: Bearer TU_JWT" http://localhost:8080/api/delivery/orders/active
```

Sustituye `TU_JWT` por un token obtenido vía `POST /api/auth/login` (formulario OAuth2).

---

## 5. Backend Delivery — comandos y herramientas

### 5.1 Arranque y logs

- Ejecución directa: `python main.py` (desde `backend/` con venv).
- Si en el futuro usáis uvicorn explícito, el comando sería equivalente escuchando en 8080; mantened un solo proceso en el puerto para no duplicar listeners.

### 5.2 Webhook Fidelio (simulación)

Con API local en `http://localhost:8080` y la clave en entorno:

```bash
cd backend
source venv/bin/activate
python tools/mock_fidelio_sender.py --base-url http://localhost:8080
# Opcional: --api-key <tu_clave> si no está en FIDELIO_API_KEY
```

URL destino del script: `/api/delivery/webhooks/fidelio/order-ready`.

### 5.3 Flujo E2E automatizado (HTTP)

```bash
cd backend
source venv/bin/activate
python tools/test_delivery_flow.py \
  --base-url http://localhost:8080 \
  --username TU_USUARIO \
  --password TU_PASSWORD
```

Acepta también variables `BASE_URL`, `FIDELIO_API_KEY`, `TEST_USER`, `TEST_PASS`, `TEST_PREFIX`, etc. Al final suele imprimir un comando sugerido de limpieza con el prefijo generado.

### 5.4 Limpieza de datos de prueba

```bash
cd backend
source venv/bin/activate
python tools/cleanup_delivery_test_data.py --prefix "TESTDEL-XXXXXX" --dry-run
python tools/cleanup_delivery_test_data.py --prefix "TESTDEL-XXXXXX"
```

Usa el prefijo exacto devuelto por el flujo de pruebas (pedidos / llegadas / restaurantes con mismo prefijo).

### 5.5 Permisos RBAC (recordatorio)

- `delivery:view` — ver panel y conectar WebSocket (JWT debe ser de usuario con este permiso o superuser).
- `delivery:operate` — acciones operativas en panel.
- `delivery:admin` — tabla administrativa (cancelaciones, etc.).

Si el WebSocket cierra enseguida (`1008`), revisad permisos y validez del JWT.

---

## 6. Frontend — panel administrativo Delivery

### 6.1 Rutas


| Ruta SPA                       | Componente           | Permiso mínimo   |
| ------------------------------ | -------------------- | ---------------- |
| `/delivery`                    | `DeliveryPanel`      | `delivery:view`  |
| (tabla admin dentro del panel) | `DeliveryAdminTable` | `delivery:admin` |


Menú lateral: entrada “Delivery” en `MainLayout` con `permission: 'delivery:view'`.

### 6.2 Comandos útiles (panel + build)

```bash
cd frontend
yarn install
yarn dev              # desarrollo con hot reload
yarn lint             # ESLint
yarn build            # producción local (comprueba errores TS/React)
yarn preview          # sirve la carpeta dist (puerto por defecto 4173)
```

### 6.3 Variables en Docker / producción

El bundle embebe `VITE_*` en **tiempo de build**. Si cambiáis dominio o pasáis de HTTP a HTTPS:

1. Actualizad `docker-compose.yml` (`args` del servicio frontend).
2. `**docker compose build datarefugio_frontend`** y `**up -d**` de ese servicio.

Si solo reiniciáis el contenedor sin rebuild, seguirá la URL antigua en el JS estático.

### 6.4 WebSocket en navegador

`deliveryService.wsUrl(token)` construye:  
`VITE_WS_URL` + `/api/delivery/ws?token=<JWT>`.

El backend valida el JWT (`SECRET_KEY`), usuario activo y permiso `delivery:view`. Cualquier cambio de `SECRET_KEY` invalida tokens y conexiones WS existentes.

---

## 7. Base de datos (Delivery)


| Script                 | Cuándo                                           |
| ---------------------- | ------------------------------------------------ |
| `init_db.py`           | Esquema base / seeds (cuidado en producción).    |
| `patch_db_delivery.py` | Tras desplegar código nuevo del módulo delivery. |


```bash
cd backend && source venv/bin/activate
python patch_db_delivery.py
```

En contenedor:

```bash
docker exec -it datarefugio_backend bash -lc 'cd /app && python patch_db_delivery.py'
```

Errores tipo *undefined table* en features delivery o push: casi siempre falta ejecutar el parche en **ese** entorno.

---

## 8. Producción — Docker

### 8.1 Red

```bash
docker network create app_shared_network
```

### 8.2 `.env` en la raíz del repo

Usado por `docker compose` (p. ej. interpolación `DATABASE_URL` dentro del YAML). Debe ser coherente con la BD que monte el backend. El código también lee `config/.env` vía volúmenos; mantened **la misma** verdad de BD y secretos entre ambos si aplica a vuestro despliegue.

### 8.3 Build y arranque

```bash
docker compose build --no-cache
docker compose up -d
docker compose ps
docker compose logs -f datarefugio_backend
```

### 8.4 Frontend: `VITE_API_URL` y `VITE_WS_URL`

En `docker-compose.yml`, los `build.args` deben usar URL **pública** y esquemas correctos (`https://`, `wss://`). El host del API suele ser el mismo para REST y WS; Nginx separa `location /api/delivery/ws` del resto.

---

## 9. VPS — Nginx y WebSocket

1. Proxy TLS al backend.
2. Bloque dedicado `**location /api/delivery/ws`** con:
  - `proxy_http_version 1.1`
  - `proxy_set_header Upgrade $http_upgrade`
  - `proxy_set_header Connection "Upgrade"` **o** `$connection_upgrade` + `map` en `http {}` (obligatorio si usáis la variable; si no, `nginx -t` falla).

Ejemplo listo para adaptar: `**backend/tools/nginx-api-websocket.example.conf`**.

Timeouts largos (`proxy_read_timeout` / `proxy_send_timeout`) evitan cortes en conexiones idle del WS.

Tras cambios:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Varios workers del backend:** el WebSocket actual autentica con JWT stateless; no depende de memoria en un solo worker. Mantened **un único `SECRET_KEY`** para todos los procesos Uvicorn/Gunicorn.

---

## 10. Apps móviles (Expo) — desarrollo

Monorepo: `**cd mobile**`, Yarn workspaces.

```bash
cd mobile
yarn install
```

### 10.1 Variables por app

En `mobile/apps/runner` y `mobile/apps/kiosk`, archivos tipo `.env` / `.env.production` (según convención del proyecto):

- `EXPO_PUBLIC_API_URL=https://api.tu-dominio.com`  (**sin** `/api`)
- `EXPO_PUBLIC_WS_URL=wss://api.tu-dominio.com`

### 10.2 Arranque Metro


| Acción               | Comando                              |
| -------------------- | ------------------------------------ |
| Runner, caché limpia | `yarn runner:clear`                  |
| Runner normal        | `yarn runner`                        |
| Kiosk, caché limpia  | `yarn kiosk:clear`                   |
| Kiosk normal         | `yarn kiosk`                         |
| Web (opcional)       | `yarn runner:web` / `yarn kiosk:web` |


Equivalente: `cd mobile/apps/runner && npx expo start -- -c`

### 10.3 Dispositivo y red

- **Misma Wi‑Fi** que el PC o IP accesible.
- `**adb reverse`** (Android USB): `adb reverse tcp:8080 tcp:8080` y usar `http://127.0.0.1:8080` solo si coherente con cómo resuelve el cliente.
- **Tunnel** de Expo si hay cortafuegos entre móvil y API.
- No uséis `localhost` en `EXPO_PUBLIC_*` en un teléfono sin reverse/tunnel: el dispositivo apunta a sí mismo.

### 10.4 Login en runner (prevención 422)

El login debe enviar el body como `**application/x-www-form-urlencoded`** (compatible con `OAuth2PasswordRequestForm` en FastAPI). El paquete `delivery-api` ya usa string del `URLSearchParams` para evitar 422 en RN.

---

## 11. Expo / EAS — despliegue y builds

Detalle visual y de iconos: [DELIVERY_BUILD_APK_DISTRIBUCION.md](./DELIVERY_BUILD_APK_DISTRIBUCION.md).

### 11.1 CLI y sesión

```bash
npm install -g eas-cli
eas login
eas whoami
```

### 11.2 Proyecto por app

Cada app (`kiosk`, `runner`) es un proyecto EAS independiente:

```bash
cd mobile/apps/runner
eas build:configure    # primera vez; genera/ajusta eas.json si hace falta
```

Repetir en `mobile/apps/kiosk` si aún no está enlazado.

### 11.3 Perfiles en `eas.json`

Patrón habitual en este repo:


| Perfil       | Android                                    | Uso                                                 |
| ------------ | ------------------------------------------ | --------------------------------------------------- |
| `preview`    | `buildType: apk`, `distribution: internal` | APK para compartir (Drive, WhatsApp) sin Play Store |
| `production` | `buildType: app-bundle`                    | Play Store / distribución formal                    |


Bloque `env` en cada perfil puede fijar `EXPO_PUBLIC_API_URL` y `EXPO_PUBLIC_WS_URL` para que el binario quede **acoplado** a ese entorno. Para otro servidor, cambiad esas URLs y **volved a construir**.

> Sustituid dominios de ejemplo por los vuestros; no guardéis secretos de terceros en `eas.json` si el repositorio es compartido (las URLs públicas del API suelen ser aceptables).

### 11.4 Lanzar build

```bash
cd mobile/apps/runner

eas build --platform android --profile preview

eas build --platform andriod --profile production
```

- **CI / máquina sin navegador:** exportad `**EXPO_TOKEN`** (token de acceso personal creado en expo.dev). **No** lo subáis a git ni lo peguéis en documentación.
- Al terminar, EAS muestra enlace para descargar el artefacto.

export EXPO_TOKEN="DguGyFCCHecATBC9YzT0wl-CqSZEvWZ-eo65VETV"
export EXPO_TOKEN="ZcRiS422IUEuLvVhVycPYpgYyEqWIrnV-b8F8VZ-"


### 11.5 Tras el build

- Instalación en dispositivos: habilitar “orígenes desconocidos” solo si distribuís APK interno.
- Si cambia solo configuración JS y usáis flujo compatible, podéis valorar EAS Update en el futuro; no sustituye cambios nativos.

### 11.6 Checklist prevención (Expo + API)


| Problema                    | Prevención                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------- |
| App apunta a servidor viejo | Rebuild tras cambiar `eas.json` / `.env`; comprobar artefacto descargado es el último. |
| WS falla en APK, REST OK    | `EXPO_PUBLIC_WS_URL` con `wss://`; Nginx con `Upgrade`; certificado válido.            |
| Metro “atascado” tras deps  | `yarn runner:clear` / borrar `node_modules` y reinstalar en `mobile/`.                 |
| SSL / cert                  | Usar dominios con cadena válida en producción; evitar mezclar IP y cert CN.            |


---

## 12. Resumen rápido


| Objetivo        | Comando / acción                                                                      |
| --------------- | ------------------------------------------------------------------------------------- |
| Backend local   | `cd backend && source venv/bin/activate && python main.py`                            |
| BD delivery     | `python init_db.py && python patch_db_delivery.py`                                    |
| Frontend local  | `cd frontend && yarn dev` + `VITE_API_URL` / `VITE_WS_URL`                            |
| Panel           | Navegador → `/delivery` con usuario `delivery:view`                                   |
| E2E delivery    | `python tools/test_delivery_flow.py --base-url http://localhost:8080`                 |
| Limpiar pruebas | `python tools/cleanup_delivery_test_data.py --prefix ...`                             |
| Docker          | `docker network create app_shared_network` (una vez) → `docker compose up -d --build` |
| Runner dev      | `cd mobile && yarn runner:clear`                                                      |
| EAS APK         | `cd mobile/apps/runner && eas build --platform android --profile preview`             |


---

## 13. Prevención: problemas vistos en operación


| Síntoma                                 | Causa probable                                                                    | Qué hacer                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| WebSocket en prod: conexión corta o 502 | Nginx sin `Upgrade` o `Connection` mal configurado; falta `map` si usáis variable | Aplicar patrón de `nginx-api-websocket.example.conf`; `nginx -t`.                   |
| WS en web OK, en APK no                 | `wss` vs `ws`, certificado, o `EXPO_PUBLIC_WS_URL` incorrecta                     | Alinear esquema y host con el mismo dominio que el API.                             |
| Panel sin datos                         | Sin permiso `delivery:view` o token caducado                                      | Re-login; revisar roles en `/users`.                                                |
| Webhook Fidelio 401                     | `FIDELIO_API_KEY` definida pero cabecera distinta                                 | Enviar `X-API-Key` igual al valor del `.env` o quitar clave solo en dev controlado. |
| 404 en móvil en todas las rutas         | `EXPO_PUBLIC_API_URL` incluye `/api` duplicado                                    | Quitar `/api` del env público (el cliente lo añade).                                |
| Login móvil 422                         | Body JSON en lugar de form urlencoded                                             | Usar helper `loginRunner` de `delivery-api`.                                        |
| Datos delivery “fantasma” en QA         | Pruebas E2E sin limpieza                                                          | `cleanup_delivery_test_data.py` con prefijo del run.                                |
| Tablas delivery inexistentes            | Despliegue sin migración                                                          | `patch_db_delivery.py` en servidor/contenedor.                                      |
| Frontend Docker con API vieja           | Sin rebuild tras cambiar `VITE_`*                                                 | Rebuild explícito de `datarefugio_frontend`.                                        |


---

*Revisión alineada con `backend/app/api/delivery.py` (JWT en query para WS), `frontend/src/services/deliveryService.ts`, `mobile/packages/delivery-api/src/client.ts` y `docker-compose.yml`.*