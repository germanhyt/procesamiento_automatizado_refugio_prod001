#!/usr/bin/env bash
# Despliegue Delivery (centro de control + permisos) en MiVPS.
# Ejecutar en el VPS desde la raíz del repo: /home/projects/datarefugio
#
# Uso:
#   chmod +x backend/tools/vps-deploy-delivery-control.sh
#   ./backend/tools/vps-deploy-delivery-control.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

echo ">>> Reconstruyendo backend y frontend..."
docker compose build datarefugio_backend datarefugio_frontend
docker compose up -d datarefugio_backend datarefugio_frontend

echo ">>> Patch BD delivery (permisos control + auditoría, idempotente)..."
docker compose exec -T datarefugio_backend python patch_db_delivery.py

echo ">>> Recargando Nginx del host (evita 502 tras recrear contenedores)..."
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t
  sudo nginx -s reload
elif docker ps --format '{{.Names}}' | grep -qE 'nginx|proxy'; then
  PROXY="$(docker ps --format '{{.Names}}' | grep -E 'nginx|proxy' | head -1)"
  docker exec "${PROXY}" nginx -t
  docker exec "${PROXY}" nginx -s reload
fi

echo ">>> Contenedores:"
docker compose ps

echo ">>> Listo. Verifica https://datarefugio.gcbprojects.site/delivery"
