# Guía Final de Despliegue en AWS Linux (EC2)

Este documento es el flujo final recomendado para publicar la plataforma en una EC2 con Amazon Linux, primero por IP (mientras propaga DNS) y luego migrar a dominio.

## 1) Preparación inicial del servidor

Conéctate por SSH y entra al repo:

```bash
cd ~/valfora_erp
git pull
```

Ejecuta bootstrap (instala Docker, compose plugin, habilita servicio):

```bash
sudo bash scripts/bootstrap_aws_linux.sh
```

Después, cierra sesión y vuelve a entrar para aplicar el grupo `docker`.

Valida:

```bash
docker --version
docker compose version
```

## 2) Crear `.env.production`

```bash
cd /opt/vlf_erp
cp .env.production.example .env.production
```

Genera claves (si aún no las tienes):

```bash
openssl rand -base64 48   # DJANGO_SECRET_KEY
openssl rand -base64 32   # POSTGRES_PASSWORD
```

## 3) Configuración temporal por IP (sin dominio aún)

Edita `.env.production` y deja al menos esto:

```env
DJANGO_SECRET_KEY=<TU_SECRET_KEY>
POSTGRES_PASSWORD=<TU_POSTGRES_PASSWORD>

DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=<TU_IP_PUBLICA>,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://<TU_IP_PUBLICA>

VITE_API_URL=/api/v1
VITE_WS_URL=ws://<TU_IP_PUBLICA>/ws

DJANGO_SECURE_SSL_REDIRECT=False
SECURE_HSTS_SECONDS=0
```

Notas:
- `DJANGO_ALLOWED_HOSTS` va sin `http://`.
- `CORS_ALLOWED_ORIGINS` sí lleva `http://` o `https://`.
- En modo IP se usa `ws://` y no `wss://`.

## 4) Despliegue

```bash
cd /opt/vlf_erp
./scripts/deploy_production.sh /opt/vlf_erp
```

Verifica:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production ps
curl -f http://127.0.0.1/api/v1/health/
curl -I http://<TU_IP_PUBLICA>
```

## 5) Crear superusuario

```bash
docker compose -f docker-compose.production.yml --env-file .env.production exec web python manage.py createsuperuser
```

## 6) Migración de IP a dominio (cuando DNS ya propagó)

Cuando `dig +short erp.tu-dominio.com` responda correctamente:

1. Cambia en `.env.production`:

```env
DJANGO_ALLOWED_HOSTS=erp.tu-dominio.com
CORS_ALLOWED_ORIGINS=https://erp.tu-dominio.com
VITE_API_URL=/api/v1
VITE_WS_URL=wss://erp.tu-dominio.com/ws
DJANGO_SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000
```

2. Redeploy (importante porque `VITE_WS_URL` se compila en frontend):

```bash
cd /opt/vlf_erp
./scripts/deploy_production.sh /opt/vlf_erp
```

3. Validación final:

```bash
curl -I https://erp.tu-dominio.com
curl -f https://erp.tu-dominio.com/api/v1/health/
```

## 7) Checklist rápido de salida a producción

- Security Group: `22` restringido, `80/443` público.
- `.env.production` no versionado en git.
- Backups de DB configurados (`scripts/backup_postgres.sh`).
- Credenciales no compartidas en chats/correos.
- Si las claves se expusieron, regenerarlas antes del go-live definitivo.
