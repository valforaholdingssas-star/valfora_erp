# Runbook de Producción en AWS Linux

Este runbook deja la plataforma desplegada en una EC2 Linux con Docker Compose.

## 1) Prerrequisitos de infraestructura (AWS)

- EC2 Linux (Ubuntu 22.04/24.04 o Debian 12 recomendado).
- Security Group:
  - `22/tcp` solo desde IPs administrativas.
  - `80/tcp` público.
  - `443/tcp` público.
- DNS apuntando a la IP pública de la EC2 (ej. `erp.tu-dominio.com`).

## 2) Preparar servidor (solo primera vez)

Conéctate por SSH y ejecuta:

```bash
sudo bash scripts/bootstrap_aws_linux.sh
```

Si tu usuario fue agregado al grupo `docker`, vuelve a iniciar sesión.

## 3) Clonar repo y preparar variables

```bash
sudo mkdir -p /opt/vlf_erp
sudo chown -R $USER:$USER /opt/vlf_erp
cd /opt/vlf_erp
git clone <URL_DEL_REPO> .
cp .env.production.example .env.production
```

Edita `.env.production` y completa como mínimo:

- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS` (ej. `erp.tu-dominio.com`)
- `CORS_ALLOWED_ORIGINS` (ej. `https://erp.tu-dominio.com`)
- `POSTGRES_PASSWORD`
- `VITE_API_URL` y `VITE_WS_URL`

## 4) Primer despliegue

```bash
cd /opt/vlf_erp
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
```

Crear superusuario:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production exec web python manage.py createsuperuser
```

Verifica:

```bash
curl -f http://127.0.0.1/api/v1/health/
docker compose -f docker-compose.production.yml --env-file .env.production ps
```

## 5) TLS / HTTPS

Recomendado: terminar TLS en un ALB o CloudFront.

- Si TLS termina en ALB:
  - Mantén Nginx interno en `:80`.
  - Asegura `DJANGO_SECURE_SSL_REDIRECT=True`.
  - Configura healthcheck del target group a `/api/v1/health/`.

- Si TLS termina en Nginx del host:
  - Extiende `nginx/nginx.prod.conf` con bloque `listen 443 ssl`.
  - Monta certificados válidos.

## 6) Actualización de versión (deploy continuo)

```bash
cd /opt/vlf_erp
./scripts/deploy_production.sh /opt/vlf_erp
```

## 7) Backup de base de datos

```bash
cd /opt/vlf_erp
POSTGRES_PASSWORD='<tu_password>' ./scripts/backup_postgres.sh seeds_erp_prod_db ./backups
```

Sube los `.sql.gz` a almacenamiento externo (S3).

## 8) Rollback rápido

1. Volver commit/tag anterior:
```bash
git checkout <tag-o-commit-estable>
```
2. Re-desplegar:
```bash
./scripts/deploy_production.sh /opt/vlf_erp
```
3. Si migraciones rompieron compatibilidad, restaura backup.
