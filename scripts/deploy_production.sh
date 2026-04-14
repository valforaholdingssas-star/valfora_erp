#!/usr/bin/env bash
set -euo pipefail

# Despliegue/re-despliegue productivo para AWS Linux usando Docker Compose.
# Uso:
#   ./scripts/deploy_production.sh /opt/vlf_erp
#
# Requiere:
# - Repo clonado en la ruta dada
# - Archivo .env.production en la raíz del repo
# - Docker + compose plugin instalados

APP_DIR="${1:-$(pwd)}"
COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE=".env.production"

cd "${APP_DIR}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "No existe ${COMPOSE_FILE} en ${APP_DIR}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "No existe ${ENV_FILE}. Cópialo desde .env.production.example y completa secretos." >&2
  exit 1
fi

echo "[1/6] Actualizando código"
git fetch --all --prune
git pull --ff-only

echo "[2/6] Construyendo imágenes"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" build

echo "[3/6] Levantando stack"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d

echo "[4/6] Aplicando migraciones"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T web python manage.py migrate --noinput

echo "[5/6] Ejecutando collectstatic"
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T web python manage.py collectstatic --noinput

echo "[6/6] Verificación de salud"
curl -fsS http://127.0.0.1/api/v1/health/ >/dev/null
echo "Despliegue completado: healthcheck OK."
