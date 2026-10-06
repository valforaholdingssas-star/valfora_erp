#!/usr/bin/env bash
# Gentle production deploy — build one service at a time to avoid OOM.
set -euo pipefail

APP_DIR="${1:-/opt/vlf_erp/valfora_erp}"
COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE=".env.production"

cd "${APP_DIR}"

echo "=== HOST ==="
uptime
free -m

echo "=== GIT ==="
git fetch --all --prune
git pull --ff-only
git log -1 --oneline

COMPOSE=(docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}")

echo "=== FREE RAM: stop celery/frontend/nginx ==="
"${COMPOSE[@]}" stop celery_worker celery_beat frontend nginx || true
sleep 3
free -m
docker builder prune -f >/dev/null 2>&1 || true

echo "=== BUILD backend (web only) ==="
"${COMPOSE[@]}" build web
docker tag seeds_erp_prod-web:latest seeds_erp_prod-celery_worker:latest
docker tag seeds_erp_prod-web:latest seeds_erp_prod-celery_beat:latest
free -m

echo "=== BUILD frontend alone ==="
"${COMPOSE[@]}" build frontend
free -m

echo "=== UP stack ==="
"${COMPOSE[@]}" up -d
sleep 20
"${COMPOSE[@]}" ps

echo "=== MIGRATE ==="
"${COMPOSE[@]}" exec -T web python manage.py migrate --noinput

echo "=== HEALTH ==="
if curl -fsS http://127.0.0.1/api/v1/health/; then
  echo
else
  curl -fsS -L http://127.0.0.1/api/v1/health/ || true
  echo
fi

echo "DEPLOY_SOFT_OK"
