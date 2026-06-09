#!/usr/bin/env bash
# Despliegue en VPS: límite de subida Nginx (413) + backend agenda deportiva.
# Ejecutar en el VPS, desde la raíz del repo Refugio (donde está docker-compose.yml).
#
# Uso:
#   chmod +x backend/tools/vps-deploy-agenda-upload-limits.sh
#   ./backend/tools/vps-deploy-agenda-upload-limits.sh
#   ./backend/tools/vps-deploy-agenda-upload-limits.sh /ruta/a/shared/nginx.conf

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NGINX_CONF="${1:-${NGINX_CONF:-}}"

if [[ -z "${NGINX_CONF}" ]]; then
  for candidate in \
    "${ROOT_DIR}/shared/nginx.conf" \
    "/etc/nginx/sites-enabled/datarefugio" \
    "/etc/nginx/conf.d/datarefugio.conf" \
    "/etc/nginx/nginx.conf"
  do
    if [[ -f "${candidate}" ]] && grep -q "api.datarefugio.gcbprojects.site" "${candidate}" 2>/dev/null; then
      NGINX_CONF="${candidate}"
      break
    fi
  done
fi

if [[ -z "${NGINX_CONF}" || ! -f "${NGINX_CONF}" ]]; then
  echo "ERROR: No se encontró nginx.conf con server_name api.datarefugio.gcbprojects.site"
  echo "Pásalo como argumento: $0 /ruta/shared/nginx.conf"
  exit 1
fi

echo ">>> Nginx config: ${NGINX_CONF}"

if grep -q "client_max_body_size" "${NGINX_CONF}"; then
  echo ">>> client_max_body_size ya existe; revisa que sea >= 30m en el server del API"
else
  cp "${NGINX_CONF}" "${NGINX_CONF}.bak.$(date +%Y%m%d_%H%M%S)"
  # Inserta después del bloque server_name del API (primera coincidencia tras api.datarefugio...)
  awk '
    /server_name api\.datarefugio\.gcbprojects\.site;/ && !done {
      print
      print "    client_max_body_size 30m;"
      done=1
      next
    }
    { print }
  ' "${NGINX_CONF}" > "${NGINX_CONF}.tmp"
  mv "${NGINX_CONF}.tmp" "${NGINX_CONF}"
  echo ">>> Añadido client_max_body_size 30m;"
fi

cd "${ROOT_DIR}"
echo ">>> Reconstruyendo backend (y frontend si hay cambios)..."
docker compose build datarefugio_backend datarefugio_frontend
docker compose up -d datarefugio_backend datarefugio_frontend

echo ">>> Patch BD agenda deportiva (idempotente)..."
docker compose exec -T datarefugio_backend python patch_db_agenda_deportiva.py

echo ">>> Recargando Nginx (evita 502 tras recrear contenedores)..."
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t
  sudo nginx -s reload
elif docker ps --format '{{.Names}}' | grep -qE 'nginx|proxy'; then
  PROXY="$(docker ps --format '{{.Names}}' | grep -E 'nginx|proxy' | head -1)"
  echo ">>> Recargando contenedor proxy: ${PROXY}"
  docker exec "${PROXY}" nginx -t
  docker exec "${PROXY}" nginx -s reload
else
  echo "WARN: nginx no encontrado en host ni contenedor; aplica reload manualmente"
fi

echo ">>> Listo. Prueba subir un track desde la agenda deportiva."
