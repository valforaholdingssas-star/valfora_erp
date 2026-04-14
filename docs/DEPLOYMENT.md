# Despliegue en producción (FASE 6)

## Stack recomendado

- **Docker Compose** `docker-compose.production.yml`: imágenes con código embebido (sin montar `./backend` ni `./frontend` en el host).
- **Nginx** como reverse proxy: sirve el SPA estático, `/static/` y `/media/` desde volúmenes, y enruta `/api/`, `/admin/`, `/ws/` a Django (Daphne).
- **PostgreSQL** y **Redis** solo en red interna (no publicar `5432`/`6379` en el host salvo necesidad operativa).

## Variables de entorno

1. Copia `.env.production.example` a `.env.production`.
2. Obligatorias en producción:
   - `DJANGO_SECRET_KEY` (longitud adecuada, aleatoria).
   - `DJANGO_ALLOWED_HOSTS` (dominio público).
   - `CORS_ALLOWED_ORIGINS` (origen del front SPA, p. ej. `https://erp.ejemplo.com`).
   - `POSTGRES_PASSWORD` y credenciales coherentes con `db`.
   - `DJANGO_DEBUG=False` (implícito vía `config.settings.production`).
3. Frontend embebido en build (argumentos de build):
   - `VITE_API_URL` — URL pública de la API (p. ej. `https://erp.ejemplo.com/api/v1` o relativa `/api/v1` si mismo origen).
   - `VITE_WS_URL` — WebSocket (p. ej. `wss://erp.ejemplo.com/ws`).
4. Opcionales:
   - `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`.
   - `DJANGO_SECURE_SSL_REDIRECT` — `False` solo en pruebas HTTP sin TLS; con HTTPS delante, `True` (por defecto).
   - `SECURE_HSTS_SECONDS` — activar tras validar certificados TLS.

## Arranque

```bash
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
```

Migraciones y `collectstatic` se ejecutan en el arranque del servicio `web`.

Primer superusuario (una vez):

```bash
docker compose -f docker-compose.production.yml --env-file .env.production exec web python manage.py createsuperuser
```

## TLS / HTTPS

- Opción A: terminación TLS en **Nginx** (montar certificados y ampliar `nginx/nginx.prod.conf` con `listen 443 ssl`).
- Opción B: TLS en **balanceador de nube** (ALB, Cloudflare); el contenedor Nginx puede escuchar solo en `:80` y recibir `X-Forwarded-Proto: https`.

## Backups

Script de ejemplo (requiere contenedor `db` en ejecución):

```bash
chmod +x scripts/backup_postgres.sh
POSTGRES_PASSWORD=... ./scripts/backup_postgres.sh seeds_erp_prod_db ./backups
```

Automatizar con **cron** en el host o tarea programada que suba el `.sql.gz` a almacenamiento externo.

## Observabilidad

- **Health check:** `GET /api/v1/health/` (JSON estándar del proyecto).
- **Sentry:** configurar `SENTRY_DSN` en `.env` (SDK cargado solo si está definido).
- **Flower** no está incluido en `docker-compose.production.yml`; añádelo solo en red privada o con autenticación.

## CI

GitHub Actions (`.github/workflows/ci.yml`) ejecuta tests del backend en cada push/PR.

## Rollback

- Conservar etiquetas de imagen Docker versionadas.
- Antes de migraciones destructivas, backup de base de datos.
- Volver a la imagen anterior y restaurar dump si es necesario.

## AWS Linux

- Runbook operativo completo: `docs/AWS_LINUX_PRODUCTION_RUNBOOK.md`.
- Bootstrap del servidor: `scripts/bootstrap_aws_linux.sh`.
- Deploy/redeploy automatizado: `scripts/deploy_production.sh`.

## Archivo legacy

`docker-compose.yml` + `docker-compose.prod.yml` sigue siendo válido para entornos que ya lo usan; el stack **recomendado** para producción inmutable es `docker-compose.production.yml`.
