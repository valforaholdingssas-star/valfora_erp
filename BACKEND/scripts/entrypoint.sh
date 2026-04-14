#!/usr/bin/env bash
set -euo pipefail

python /app/scripts/wait_for_db.py
python manage.py migrate
python manage.py collectstatic --noinput
exec "$@"
