#!/usr/bin/env bash
# Backup PostgreSQL (Docker). Uso:
#   ./scripts/backup_postgres.sh seeds_erp_db backups
# Variables opcionales: POSTGRES_USER, POSTGRES_DB (por defecto seeds_user / seeds_erp)

set -euo pipefail

CONTAINER="${1:-seeds_erp_db}"
OUT_DIR="${2:-./backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
USER_NAME="${POSTGRES_USER:-seeds_user}"
DB_NAME="${POSTGRES_DB:-seeds_erp}"

mkdir -p "${OUT_DIR}"
FILE="${OUT_DIR}/${DB_NAME}_${STAMP}.sql.gz"

echo "Dumping ${DB_NAME} from ${CONTAINER} -> ${FILE}"
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "${CONTAINER}" \
  pg_dump -U "${USER_NAME}" "${DB_NAME}" | gzip > "${FILE}"

echo "Done. Size: $(du -h "${FILE}" | cut -f1)"
