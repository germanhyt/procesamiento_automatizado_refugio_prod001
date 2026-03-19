---
name: infra-refugio
description: Gestiona la infraestructura Docker, Nginx y despliegue del sistema Refugio Data. Usar al trabajar en docker-compose.yml, Dockerfiles, nginx.conf, redes, volúmenes o despliegue en VPS.
---

# Infraestructura Refugio Data

Experto en Docker, Nginx y despliegue. Respetar la configuración actual del proyecto.

## Contenedores

| Servicio | Imagen | Puerto | Volúmenes |
|----------|--------|--------|-----------|
| datarefugio_backend | build ./backend | 8080 | ./config, ./uploads |
| datarefugio_frontend | build ./frontend | 80 (Nginx) | — |

## Red

- `app_shared_network` (externa) – compartida con proxy inverso del VPS
- Crear una vez: `docker network create app_shared_network`

## Configuración

- **Backend:** `env_file: .env`; volúmenes `./config`, `./uploads`
- **Frontend:** Build arg `VITE_API_URL` para la URL pública de la API
- **Credenciales:** En `./config`; no versionar secretos

## Comandos

```bash
# Desde raíz del repo
docker compose up -d
docker compose logs -f datarefugio_backend
docker compose logs -f datarefugio_frontend
docker compose build && docker compose up -d
```

## Dockerfiles

- **Backend:** `python:3.12-slim`, `pip install -r requirements.txt`, `CMD ["python", "main.py"]`
- **Frontend:** Multi-stage (Node 20-alpine build + nginx:alpine); `nginx.conf` con `try_files` para SPA

## Nginx (frontend)

- `try_files $uri $uri/ /index.html` para rutas SPA
- Servir build estático

## Despliegue VPS

1. Crear red externa
2. Colocar credenciales en `./config` y completar `.env`
3. Configurar proxy (Nginx/TLS) hacia contenedores en `app_shared_network`
4. Ajustar `VITE_API_URL` en docker-compose para la URL real de la API
5. `docker compose build --no-cache && docker compose up -d`

## Buenas prácticas

1. **SSL:** Certificados del proxy cubren frontend y API
2. **Secretos:** Nunca en control de versiones
3. **Variables:** Documentar en README; usar `.env.example` si se requiere
