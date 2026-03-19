# Comandos de ayuda – Refugio Data

Referencia de comandos para manejar el proyecto en **desarrollo local** y **producción**.

---

## Índice

1. [Requisitos previos](#requisitos-previos)
2. [Setup inicial](#setup-inicial)
3. [Despliegue local](#despliegue-local)
4. [Despliegue producción (Docker)](#despliegue-producción-docker)
5. [Base de datos](#base-de-datos)
6. [Mantenimiento y logs](#mantenimiento-y-logs)
7. [Desarrollo y calidad](#desarrollo-y-calidad)
8. [Aplicación móvil](#aplicación-móvil)

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
```

---

*Documentación alineada con [README.md](../README.md) y arquitectura del proyecto.*
