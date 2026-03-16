# Refugio Data - Guía de Despliegue en VPS (Docker)

Esta guía detalla los pasos para desplegar la aplicación **Refugio Data** en un servidor VPS que ya cuenta con un proxy inverso Nginx y una red compartida de Docker.

## 🏗️ Requisitos Previos

1. **Docker & Docker Compose** instalados.
2. **Nginx Proxy** configurado (usualmente en `/home/projects/shared`).
3. **Red de Docker** compartida: `app_shared_network`.
4. **Permisos de Google Drive**: Debes compartir la carpeta principal de Drive con el correo de la Service Account (ej: `bigquery-admin@...iam.gserviceaccount.com`) con permisos de **Editor**.
5. **Credenciales de GCP**: El archivo `credentials.json` debe estar en `backend/config/credentials.json`.

---

## 🚀 Pasos para el Despliegue

### 1. Preparar el Entorno en el VPS

Clona el repositorio en la carpeta de proyectos:
```bash
cd /home/projects
git clone [URL_DEL_REPO] 001_procesamiento_refugio
cd 001_procesamiento_refugio
```

### 2. Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto (`/home/projects/001_procesamiento_refugio/.env`). 

> [!IMPORTANT]
> En producción, el sistema utiliza **IDs de Google Drive** en lugar de rutas locales de Windows. Asegúrate de obtener estos IDs de la URL de Drive (ej: `https://drive.google.com/drive/folders/ID_AQUI`).

```env
# API SETTINGS
VITE_API_URL="https://api.datarefugio.gcbprojects.site/api"
API_URL="https://api.datarefugio.gcbprojects.site/api"

# APP SETTINGS
PROJECT_NAME="Refugio - Sistema de Procesamiento"
VERSION="1.0.0"
API_STR="/api"

# DATABASE (Configura según tu instancia de Postgres)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=refugio_procesamiento_app
POSTGRES_USER=postgres
POSTGRES_PASSWORD=tu_password_seguro

# JWT SETTINGS
SECRET_KEY=9a6c764e2079c53644f1c79e6587c4f4f3c5f4c5f4c5f4c5f4c5f4c5f4c5f4c5
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# GOOGLE DRIVE IDs (IDs extraídos de la URL de Drive)
DRIVE_ID_ARCHIVO_CONFIGURACION="19Esmz5h3FCjc4dcmjYXLBPt70eQPLtyA"
DRIVE_ID_CARPETA_CIERRECAJA="1Ox8BcV-IMCteH59gEt0NnOQF8f525nrO"
DRIVE_ID_CARPETA_PROCESADOS="18WI7tSwA58QSzZtWILmrAYL9FULYubqP"

# BIGQUERY SETTINGS
BQ_PROJECT_ID=neat-chain-450900-a1
BQ_DATASET=Ventas
GOOGLE_APPLICATION_CREDENTIALS=./config/credentials.json

# POWER BI SETTINGS (Azure Entra ID)
PBI_CLIENT_ID="90399161-6c13-46f4-b5d3-635f829b4800"
PBI_CLIENT_SECRET="K0L8Q~YjTEAsSxsDCkCv3-BOxn5ypmUwRvlcCdfL"
PBI_TENANT_ID="7829e769-b57a-4ea4-886f-41f229240018"
PBI_WORKSPACE_ID="cd0ee5ee-2380-42e2-a19c-1472193b7ee8"
PBI_REPORT_ID="1c17023d-48a4-40ea-927b-9813cf651861"
```

### 3. Actualizar Nginx Proxy Global

Agrega los siguientes bloques al archivo `nginx.conf` de tu carpeta `shared` (ej: `/home/projects/shared/nginx.conf`):

```nginx
# HTTP to HTTPS redirect - Refugio Frontend
server {
    listen 80;
    server_name datarefugio.gcbprojects.site;

    location ^~ /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTP to HTTPS redirect - Refugio Backend
server {
    listen 80;
    server_name api.datarefugio.gcbprojects.site;

    location ^~ /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}


# Refugio Frontend
server {
    listen 443 ssl;
    server_name datarefugio.gcbprojects.site;

    ssl_certificate /etc/letsencrypt/live/estacionamiento.gcbprojects.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/estacionamiento.gcbprojects.site/privkey.pem;

    location / {
        proxy_pass http://datarefugio_frontend:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Refugio Backend API
server {
    listen 443 ssl;
    server_name api.datarefugio.gcbprojects.site;

    ssl_certificate /etc/letsencrypt/live/estacionamiento.gcbprojects.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/estacionamiento.gcbprojects.site/privkey.pem;

    location / {
        proxy_pass http://datarefugio_backend:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Luego reinicia el Nginx del proxy:
```bash
docker restart nginx_proxy
```

### 4. Levantar la Aplicación

Desde la carpeta del proyecto `001_procesamiento_refugio`, ejecuta:
```bash
docker compose up -d --build
```

---

## 🛠️ Comandos Útiles

- **Ver logs del backend:** `docker logs -f datarefugio_backend`
- **Reiniciar todo:** `docker compose restart`
- **Actualizar cambios de código:** `git pull && docker compose up -d --build`

---
*Nota: Asegúrate de que los certificados SSL en Nginx apunten a la ruta correcta (`datarefugio.gcbprojects.site`) o utiliza un certificado wildcard.*



docker exec -it certbot certbot certonly --webroot -w /webroot \
  -d datarefugio.gcbprojects.site \
  -d api.datarefugio.gcbprojects.site \
  --email germanhuaytalla22@gmail.com --agree-tos --no-eff-email