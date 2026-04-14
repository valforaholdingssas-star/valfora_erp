# Seeds ERP - Producción AWS Linux (Gist Ready)

Documento único para compartir despliegue productivo en EC2 (Amazon Linux), sin exponer secretos.

## 1) Bootstrap del servidor

```bash
cd ~/valfora_erp
git pull
sudo bash scripts/bootstrap_aws_linux.sh
```

Cerrar sesión SSH y volver a entrar.

Validar:

```bash
docker --version
docker compose version
```

## 2) Crear `.env.production`

```bash
cd /opt/vlf_erp
cp .env.production.example .env.production
```

Generar claves:

```bash
openssl rand -base64 48   # DJANGO_SECRET_KEY
openssl rand -base64 32   # POSTGRES_PASSWORD
```

## 3) Variables mínimas (modo temporal por IP)

```env
DJANGO_SECRET_KEY=<GENERADA_CON_OPENSSL>
POSTGRES_PASSWORD=<GENERADA_CON_OPENSSL>

DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_DEBUG=False

DJANGO_ALLOWED_HOSTS=<TU_IP_PUBLICA>,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://<TU_IP_PUBLICA>

VITE_API_URL=/api/v1
VITE_WS_URL=ws://<TU_IP_PUBLICA>/ws

DJANGO_SECURE_SSL_REDIRECT=False
SECURE_HSTS_SECONDS=0
```

## 4) Deploy

```bash
cd /opt/vlf_erp
./scripts/deploy_production.sh /opt/vlf_erp
```

Verificación:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production ps
curl -f http://127.0.0.1/api/v1/health/
curl -I http://<TU_IP_PUBLICA>
```

## 5) Superusuario

```bash
docker compose -f docker-compose.production.yml --env-file .env.production exec web python manage.py createsuperuser
```

## 6) Cambio a dominio (cuando DNS propague)

Actualizar `.env.production`:

```env
DJANGO_ALLOWED_HOSTS=erp.tu-dominio.com
CORS_ALLOWED_ORIGINS=https://erp.tu-dominio.com
VITE_API_URL=/api/v1
VITE_WS_URL=wss://erp.tu-dominio.com/ws
DJANGO_SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000
```

Redeploy:

```bash
cd /opt/vlf_erp
./scripts/deploy_production.sh /opt/vlf_erp
```

Validar:

```bash
curl -I https://erp.tu-dominio.com
curl -f https://erp.tu-dominio.com/api/v1/health/
```

## 7) Regla de seguridad para compartir por Gist

- Nunca publiques valores reales de:
  - `DJANGO_SECRET_KEY`
  - `POSTGRES_PASSWORD`
  - `OPENAI_API_KEY`
  - `WHATSAPP_ACCESS_TOKEN`
  - `EMAIL_HOST_PASSWORD`
  - `SENTRY_DSN` (si contiene auth)
- Comparte solo placeholders.
