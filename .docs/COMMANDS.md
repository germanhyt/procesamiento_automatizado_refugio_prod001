# Comandos de ayuda – Refugio Data

Referencia de comandos para manejar el proyecto en **desarrollo local** y **producción**.

---

## Índice

1. [Requisitos previos](#requisitos-previos)
2. [Setup inicial](#setup-inicial)
3. [Despliegue local](#despliegue-local)
4. [Despliegue producción (Docker)](#despliegue-producción-docker)
5. [Despliegue en VPS con dominio](#despliegue-en-vps-con-dominio)
6. [Base de datos](#base-de-datos)
7. [Mantenimiento y logs](#mantenimiento-y-logs)
8. [Desarrollo y calidad](#desarrollo-y-calidad)
9. [Aplicación móvil](#aplicación-móvil)
10. [Build APK e instalación interna](#build-apk-e-instalación-interna)

---

## Requisitos previos

| Componente | Versión |
|------------|---------|
| Python | 3.12+ |
| Node.js | LTS (20+) |
| Yarn | v1 |
| PostgreSQL | 12+ (local o remoto) |
| Docker | 24+ (para producción) |

---

## Setup inicial

### 1. Clonar y preparar entorno

```bash
# Desde la raíz del repositorio
cd 001_procesamiento_refugio
```

### 2. Configurar variables de entorno

```bash
# Copiar plantilla (si existe) o crear .env en la raíz
# Variables mínimas: DATABASE_URL, POSTGRES_*, SECRET_KEY, JWT_SECRET_KEY
# Ver README.md sección "Variables de entorno"
```

### 3. Credenciales y config

- Colocar credenciales GCP en `./config/` (p.ej. `credentials.json` para Big Query, GDrive, Power BI).
- Crear `./uploads/` si no existe (para Fuentes de datos).
- Completar `config/.env` con secretos (no versionar).

---

## Despliegue local

### Backend (FastAPI)

```bash
# Desde backend/
cd backend

# Crear y activar entorno virtual
python -m venv .venv

# Activar entorno virtual (elegir según shell):
# Windows CMD
.venv\Scripts\activate.bat

# Windows PowerShell
.venv\Scripts\Activate.ps1

# Git Bash / WSL / Linux / macOS
source .venv/Scripts/activate

# Instalar dependencias
pip install -r requirements.txt

# Iniciar servidor (escucha en http://localhost:8080)
python main.py
```

| Comando | Descripción |
|---------|-------------|
| `python main.py` | Levanta API en `http://0.0.0.0:8080` |
| `python init_db.py` | Crea tablas e inicializa datos (ver [Base de datos](#base-de-datos)) |
| `python patch_db_delivery.py` | Aplica parches de esquema para módulo Delivery |

---

### Frontend (React + Vite)

```bash
# Desde frontend/
cd frontend

# Instalar dependencias
yarn install

# Crear .env con:
# VITE_API_URL=http://localhost:8080/api

# Iniciar dev server (por defecto http://localhost:5173)
yarn dev
```

| Comando | Descripción |
|---------|-------------|
| `yarn dev` | Servidor de desarrollo con HMR |
| `yarn build` | Build de producción en `dist/` |
| `yarn preview` | Previsualizar build local |
| `yarn lint` | Ejecutar ESLint |

**Nota:** El frontend consume la API en `VITE_API_URL`. En local suele ser `http://localhost:8080/api` (backend en puerto 8080).

---

### Stack local completo

Ejecutar en **dos terminales**:

**Terminal 1 – Backend**
```bash
cd backend
.venv\Scripts\activate
python main.py
```

**Terminal 2 – Frontend**
```bash
cd frontend
yarn dev
```

- API: http://localhost:8080  
- App web: http://localhost:5173  

---

## Despliegue producción (Docker)

### Prerrequisitos

1. **Red Docker externa** (solo una vez):
   ```bash
   docker network create app_shared_network
   ```

2. **Archivo `.env`** en la raíz con variables de producción (ver README).

3. **Ajustar `VITE_API_URL`** en `docker-compose.yml` para el build del frontend (URL pública de la API).

---

### Comandos Docker

| Acción | Comando | Descripción |
|--------|---------|-------------|
| **Levantar stack** | `docker compose up -d` | Inicia backend y frontend en segundo plano |
| **Detener** | `docker compose down` | Detiene y elimina contenedores |
| **Construir imágenes** | `docker compose build` | Construye imágenes sin caché opcional |
| **Reconstruir y levantar** | `docker compose build --no-cache && docker compose up -d` | Build limpio y arranque |
| **Ver estado** | `docker compose ps` | Lista contenedores activos |
| **Logs backend** | `docker compose logs -f datarefugio_backend` | Seguir logs del backend |
| **Logs frontend** | `docker compose logs -f datarefugio_frontend` | Seguir logs del frontend |
| **Logs ambos** | `docker compose logs -f` | Seguir logs de todos los servicios |
| **Entrar al backend** | `docker compose exec datarefugio_backend bash` | Shell dentro del contenedor backend |

---

### Volúmenes y puertos

| Servicio | Contenedor | Puerto | Volúmenes |
|----------|------------|--------|-----------|
| Backend | `datarefugio_backend` | 8080 | `./config`, `./uploads` |
| Frontend | `datarefugio_frontend` | 80 (Nginx) | — |

El proxy inverso (Nginx/Traefik en el host) debe redirigir tráfico HTTPS hacia estos contenedores en `app_shared_network`.

---

## Despliegue en VPS con dominio

Guía paso a paso para llevar el stack a un servidor Linux (Ubuntu 22/24) con dominio propio, Nginx como reverse proxy en el host y certificado SSL via Certbot.

### Prerrequisitos en el VPS

| Componente | Uso |
|---|---|
| Docker + Docker Compose v2 | Contenedores |
| Nginx (host, no contenedor) | Reverse proxy + SSL termination |
| Certbot | Certificados Let's Encrypt |
| Git | Clonar repo |
| PostgreSQL accesible | Local en VPS o instancia remota |

```bash
# Instalar Docker en Ubuntu
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# Instalar Nginx y Certbot
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

---

### 1. Clonar el repositorio en el VPS

```bash
cd /opt
sudo git clone <URL_REPO> refugio_data
sudo chown -R $USER:$USER /opt/refugio_data
cd /opt/refugio_data
```

---

### 2. Crear el archivo `.env` de producción

El archivo `.env` vive en la **raíz del repositorio** y nunca se versiona. Contiene todos los secretos del stack.

```bash
# Crear desde cero (o copiar de .env.example si existe)
nano .env
```

**Contenido mínimo de `.env` (producción):**

```dotenv
# ─── Base de datos ─────────────────────────────────────────
POSTGRES_HOST=localhost           # o IP del servidor de BD
POSTGRES_PORT=5432
POSTGRES_USER=datarefugio
POSTGRES_PASSWORD=CAMBIAR_ESTO
POSTGRES_DB=datarefugio

DATABASE_URL=postgresql://datarefugio:CAMBIAR_ESTO@localhost:5432/datarefugio

# ─── Seguridad ─────────────────────────────────────────────
SECRET_KEY=GENERAR_CON_openssl_rand_hex_32
JWT_SECRET_KEY=GENERAR_CON_openssl_rand_hex_32

# ─── Fidelio webhook ───────────────────────────────────────
FIDELIO_API_KEY=CLAVE_COMPARTIDA_CON_FIDELIO

# ─── Google Cloud / Big Query / GDrive ─────────────────────
GOOGLE_APPLICATION_CREDENTIALS=/app/config/credentials.json

# ─── Power BI (si aplica) ──────────────────────────────────
POWERBI_CLIENT_ID=
POWERBI_CLIENT_SECRET=
POWERBI_TENANT_ID=
```

Generar claves seguras:

```bash
openssl rand -hex 32   # ejecutar dos veces: una para SECRET_KEY, otra para JWT_SECRET_KEY
```

---

### 3. Ajustar la URL pública en `docker-compose.yml`

El frontend se compila **dentro de la imagen Docker** con `VITE_API_URL` como build-arg. Si el dominio cambia, editar esta línea antes del build:

```yaml
# docker-compose.yml — sección datarefugio_frontend:
args:
  - VITE_API_URL=https://api.TU_DOMINIO.com/api
```

> El WebSocket del módulo Delivery infiere `wss://` automáticamente en producción HTTPS si Nginx pasa el header `Upgrade`. No requiere variable adicional.

---

### 4. Crear la red Docker y levantar el stack

```bash
# Crear red externa (una sola vez por servidor)
docker network create app_shared_network

# Build limpio + arranque en segundo plano
docker compose build --no-cache
docker compose up -d

# Verificar que los contenedores están activos
docker compose ps
```

---

### 5. Inicializar la base de datos (primera vez en producción)

```bash
# Entrar al contenedor del backend
docker compose exec datarefugio_backend bash

# Dentro del contenedor:
python init_db.py            # crea tablas, permisos y usuario admin
python patch_db_delivery.py  # aplica parches del módulo Delivery
exit
```

**Usuario por defecto:** `admin` / `admin123` — cambiar **de inmediato** en producción.

---

### 6. Configurar Nginx en el host (reverse proxy)

Crear dos virtual hosts: uno para la API y otro para el frontend.

**`/etc/nginx/sites-available/api.TU_DOMINIO.com`**

```nginx
server {
    listen 80;
    server_name api.TU_DOMINIO.com;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # WebSocket (módulo Delivery /api/delivery/ws)
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

**`/etc/nginx/sites-available/app.TU_DOMINIO.com`**

```nginx
server {
    listen 80;
    server_name app.TU_DOMINIO.com;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

Activar y verificar:

```bash
sudo ln -s /etc/nginx/sites-available/api.TU_DOMINIO.com  /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/app.TU_DOMINIO.com  /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

### 7. Certificado SSL con Certbot

```bash
# Emite y configura HTTPS para ambos subdominios en un solo comando
sudo certbot --nginx -d api.TU_DOMINIO.com -d app.TU_DOMINIO.com

# Verificar auto-renovación (ya activa vía systemd timer)
sudo systemctl status certbot.timer
```

Certbot reescribe los bloques `server` agregando la escucha en `443` y redirigiendo HTTP → HTTPS automáticamente.

---

### 8. Puertos internos

| Servicio | Puerto host | Nginx apunta a |
|---|---|---|
| Backend FastAPI | `8080` | `http://127.0.0.1:8080` |
| Frontend Nginx | `3000` | `http://127.0.0.1:3000` |

Si el `docker-compose.yml` no mapea el puerto del frontend explícitamente, agregar:

```yaml
datarefugio_frontend:
  ports:
    - "3000:80"
```

---

### 9. Flujo de actualización (re-deploy)

```bash
cd /opt/refugio_data
git pull origin main

# Reconstruir solo imágenes afectadas
docker compose build datarefugio_backend
docker compose build datarefugio_frontend

docker compose up -d

docker compose up --build -d

# Si hubo cambios de esquema en Delivery:
docker compose exec datarefugio_backend python patch_db_delivery.py
```

---

## Base de datos

### Inicialización (primera vez)

```bash
cd backend

# Activar venv y asegurar DATABASE_URL en .env
.venv\Scripts\activate

# Crear tablas, permisos, roles y usuario admin inicial
python init_db.py
```

**Usuario por defecto:** `admin` / `admin123` (cambiar en producción).

---

### Parches (módulo Delivery)

```bash
cd backend
.venv\Scripts\activate

# Aplica columnas y permisos para Delivery
python patch_db_delivery.py
```

---

### Conexión manual

```bash
# Con psql (ajustar host/puerto/usuario/base)
psql -h localhost -p 5432 -U postgres -d datarefugio
```

---

## Mantenimiento y logs

| Tarea | Comando |
|-------|---------|
| Ver logs backend en vivo | `docker compose logs -f datarefugio_backend` |
| Ver logs frontend | `docker compose logs -f datarefugio_frontend` |
| Últimas 100 líneas backend | `docker compose logs --tail 100 datarefugio_backend` |
| Reiniciar solo backend | `docker compose restart datarefugio_backend` |
| Reiniciar todo el stack | `docker compose restart` |
| Reconstruir tras cambios en código | `docker compose build && docker compose up -d` |

---

## Desarrollo y calidad

### Frontend

| Comando | Descripción |
|---------|-------------|
| `yarn lint` | Ejecutar ESLint |
| `yarn build` | Build de producción |
| `yarn preview` | Servir build local (útil para probar antes de deploy) |

### Backend

```bash
cd backend
.venv\Scripts\activate

# Verificar variables de entorno (si existe script)
# python -m app.utils.check_env
```

---

## Aplicación móvil

### Requisitos

- Node.js LTS, Yarn v1
- Android Studio o emulador/dispositivo Android (builds nativos)
- Variables `EXPO_PUBLIC_API_URL` y `EXPO_PUBLIC_WS_URL` en `apps/kiosk/.env` y `apps/runner/.env`

---

### Comandos mobile (desde `mobile/`)

| Comando | Descripción |
|---------|-------------|
| `yarn kiosk` | Levantar app kiosk (Expo dev) |
| `yarn kiosk:web` | Kiosk en navegador |
| `yarn runner` | Levantar app runner |
| `yarn runner:web` | Runner en navegador |

**Aclaración:** `yarn kiosk:web` y `yarn runner:web` arrancan **una sola app** cada una (solo el workspace correspondiente dentro del monorepo `mobile/`). No levantan el backend FastAPI ni el frontend Vite; para probar contra API local, ejecuta backend (y si aplica, frontend) en otras terminales según [Resumen rápido](#resumen-rápido).

---

### Por app (desde `mobile/apps/kiosk` o `mobile/apps/runner`)

```bash
yarn workspace kiosk start      # = yarn kiosk
yarn workspace kiosk web       # = yarn kiosk:web
yarn workspace kiosk android   # Abrir en Android
yarn workspace kiosk ios       # Abrir en iOS (Mac)
```

---

### Variables de entorno mobile

Archivos: `mobile/apps/kiosk/.env`, `mobile/apps/runner/.env`

```
EXPO_PUBLIC_API_URL=http://localhost:8080
EXPO_PUBLIC_WS_URL=ws://localhost:8080
```

Para producción, usar la URL pública de la API (HTTPS/WSS).

---


###################################
## Build APK e instalación interna
###################################


APKs de uso **interno** que consumen la API de producción. No se publican en Play Store.  
Distribución directa: enlace de descarga o archivo enviado por WhatsApp/Drive.

---

### Estrategia de variables de entorno (`.env` por app)

Cada app mantiene su propio `.env` en `mobile/apps/<app>/`. Las variables con prefijo `EXPO_PUBLIC_` están disponibles en tiempo de ejecución del bundle.

```
mobile/apps/kiosk/.env          ← desarrollo local
mobile/apps/kiosk/.env.production  ← sobrescribe para builds de producción (no versionar)
mobile/apps/runner/.env
mobile/apps/runner/.env.production
```

**`mobile/apps/kiosk/.env.production`**

```dotenv
# API de producción (HTTPS)
EXPO_PUBLIC_API_URL=https://api.TU_DOMINIO.com
EXPO_PUBLIC_WS_URL=wss://api.TU_DOMINIO.com
```

**`mobile/apps/runner/.env.production`**

```dotenv
EXPO_PUBLIC_API_URL=https://api.TU_DOMINIO.com
EXPO_PUBLIC_WS_URL=wss://api.TU_DOMINIO.com
```

> Nunca versionar `.env.production`. Agregar al `.gitignore`:  
> `mobile/apps/**/.env.production`

---

### Opción A — EAS Build (recomendado, build en la nube)

EAS Build compila en servidores de Expo y entrega un enlace de descarga directa. No requiere Android Studio ni SDK local.

#### Prerrequisitos

```bash
# Instalar EAS CLI globalmente
npm install -g eas-cli

# Login con cuenta Expo (crear en expo.dev si no existe)
eas login

# Cómo seguir sin login interactivo
# Expo/EAS usan el token por variable de entorno EXPO_TOKEN (con el token nuevo, no el que pegaste aquí).
# Git Bash / Linux / macOS
export EXPO_TOKEN="tu_nuevo_token_aqui"
eas whoami

PowerShell
$env:EXPO_TOKEN = "tu_nuevo_token_aqui"
eas whoami

CMDenev
set EXPO_TOKEN=tu_nuevo_token_aqui
eas whoami

```




#### Paso 1 — Inicializar EAS en cada app

```bash
# Kiosk
cd mobile/apps/kiosk
eas init          # asigna un projectId en app.json (commitear este cambio)

# Runner
cd mobile/apps/runner
eas init
```

#### Paso 2 — Crear `eas.json` en cada app

**`mobile/apps/kiosk/eas.json`**

```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.TU_DOMINIO.com",
        "EXPO_PUBLIC_WS_URL": "wss://api.TU_DOMINIO.com"
      }
    }
  }
}
```

**`mobile/apps/runner/eas.json`** — idéntica estructura, mismo dominio.

> Las variables en `eas.json → env` sobreescriben el `.env` local durante el build en la nube. Son seguras para `EXPO_PUBLIC_*` (no secretos); si se necesitan secretos, usar `eas secret:create`.

#### Paso 3 — Lanzar el build

```bash
# Desde la app correspondiente:
cd mobile/apps/kiosk
eas build --platform android --profile preview --non-interactive

cd mobile/apps/runner
eas build --platform android --profile preview --non-interactive
```

EAS imprime un enlace en la consola al finalizar:

```
✔  Build finished
   Download: https://expo.dev/artifacts/eas/.../<hash>.apk
```

#### Paso 4 — Distribuir el APK

```bash
# Ver todos los builds del proyecto
eas build:list --platform android

# Descargar el APK del último build
eas build:download --latest --platform android
```

Compartir el enlace de descarga directamente o enviar el archivo `.apk` por correo/WhatsApp/Drive. El destinatario debe permitir **"Instalar desde fuentes desconocidas"** en su Android.

---

### Opción B — Build local con Gradle (sin cuenta Expo)

Requiere Android Studio instalado localmente con SDK Android y Java 17.

#### Paso 1 — Pre-build (genera el proyecto Android nativo)

```bash
# Asegurarse de que el .env.production existe antes del prebuild
cd mobile/apps/kiosk

# Cargar las variables de producción
cp .env.production .env     # o setear EXPO_PUBLIC_* manualmente en el shell

# Generar carpeta android/
npx expo prebuild --platform android --clean
```

#### Paso 2 — Compilar el APK

```bash
cd mobile/apps/kiosk/android
./gradlew assembleRelease    # Linux/Mac
gradlew.bat assembleRelease  # Windows

# APK generado en:
# android/app/build/outputs/apk/release/app-release.apk
```

#### Paso 3 — Firmar el APK (para distribución externa al dispositivo)

Si no existe un keystore:

```bash
keytool -genkey -v \
  -keystore refugio-release.jks \
  -alias refugio \
  -keyalg RSA -keysize 2048 -validity 10000
```

Configurar en `android/app/build.gradle`:

```groovy
signingConfigs {
    release {
        storeFile     file("../../refugio-release.jks")
        storePassword System.getenv("KEYSTORE_PASSWORD")
        keyAlias      "refugio"
        keyPassword   System.getenv("KEY_PASSWORD")
    }
}
```

> Guardar el archivo `.jks` fuera del repositorio o en un gestor de secretos. **Nunca versionar.**

---

### Checklist antes de distribuir

- [ ] `.env.production` apunta a `https://api.TU_DOMINIO.com` (HTTPS, no HTTP)
- [ ] WebSocket configurado como `wss://` (no `ws://`)
- [ ] APK firmado (si se usa Opción B)
- [ ] Probado en un dispositivo real antes de distribuir
- [ ] Destinatarios han activado "Instalar fuentes desconocidas" en Android

---

### Instalación en dispositivo Android

1. Transferir el `.apk` al dispositivo (Drive, WhatsApp, cable USB, etc.)
2. Abrir el archivo desde el explorador de archivos del dispositivo
3. Si aparece aviso de seguridad: **Configuración → Instalar apps desconocidas → Activar para esta app**
4. Completar la instalación

---

## Resumen rápido

### Desarrollo local (stack web)

```bash
# 1. Backend
cd backend && .venv\Scripts\activate && python main.py

# 2. Frontend (otra terminal)
cd frontend && yarn dev
```

### Producción (Docker)

```bash
# Desde raíz
docker network create app_shared_network   # una vez
docker compose build --no-cache && docker compose up -d
```

### Base de datos

```bash
cd backend && python init_db.py
cd backend && python patch_db_delivery.py









# Cuando quieres descomprimir un archivo .zip, no debes poner un punto (.) al final, porque eso lo interpreta como un archivo específico dentro del zip
unzip package-lock.zip -d /home/projects/datarefugio/frontend


# Opciones para generar y usar la API key
# - Generación manual (clave fija)
# - Puedes crear una cadena aleatoria con herramientas como openssl o uuidgen:
openssl rand -hex 32



# C:\Program Files\Android\Android Studio


```

---

*Documentación alineada con [README.md](../README.md) y arquitectura del proyecto.*




