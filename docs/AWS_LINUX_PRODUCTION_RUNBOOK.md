# Runbook de Producción en AWS Linux

Este runbook deja la plataforma desplegada en una EC2 Linux con Docker Compose.

## 1) Prerrequisitos de infraestructura (AWS)

- EC2 Linux (Ubuntu 22.04/24.04 o Debian 12 recomendado).
- Security Group:
  - `22/tcp` solo desde IPs administrativas.
  - `80/tcp` público.
  - `443/tcp` público.
- DNS apuntando a la IP pública de la EC2 (ej. `erp.tu-dominio.com`).

## 1.1) Configuración de dominio (si aún no lo has asociado)

Si acabas de lanzar la instancia y no tienes dominio enlazado, sigue este flujo:

1. Define la estrategia de dominio.
- Opción recomendada: usar subdominio para ERP (`erp.tu-dominio.com`).
- Mantén el dominio raíz (`tu-dominio.com`) para sitio corporativo o landing.

2. Si no tienes dominio, cómpralo.
- Puedes comprar en Route 53 o en cualquier registrador (Namecheap, GoDaddy, Cloudflare, etc.).

3. Crea zona hospedada en Route 53.
- En AWS: `Route 53 > Hosted zones > Create hosted zone`.
- Tipo: `Public hosted zone`.
- Dominio: `tu-dominio.com`.

4. Configura los Name Servers del dominio.
- Route 53 te dará 4 `NS`.
- En tu registrador, reemplaza los `NS` actuales por los de Route 53.
- La propagación puede tardar desde minutos hasta 24h.

5. Crea registro DNS hacia tu instancia.
- Si usarás EC2 directamente:
  - Crea un `A record` para `erp.tu-dominio.com` apuntando a la `Elastic IP` de la EC2.
  - Recomendado: asignar primero una Elastic IP a la instancia para que no cambie.
- Si usarás ALB:
  - Crea `A record (Alias)` apuntando al DNS del ALB.

6. Verifica resolución DNS antes del deploy final.

```bash
dig +short erp.tu-dominio.com
nslookup erp.tu-dominio.com
```

Debe resolver a tu Elastic IP (o al ALB).

7. Prueba acceso HTTP.

```bash
curl -I http://erp.tu-dominio.com
```

Cuando responda, ya puedes continuar con TLS/HTTPS.

## 1.2) Despliegue temporal por IP (mientras propagan NS)

Si tu dominio todavía no resuelve, puedes salir a producción temporalmente por IP pública o Elastic IP.

Supongamos que tu IP pública es `3.120.45.67`.

En `.env.production` usa temporalmente:

```env
DJANGO_ALLOWED_HOSTS=3.120.45.67,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://3.120.45.67
VITE_API_URL=/api/v1
VITE_WS_URL=ws://3.120.45.67/ws
DJANGO_SECURE_SSL_REDIRECT=False
SECURE_HSTS_SECONDS=0
```

Notas:
- En modo IP normalmente operarás por `http` (sin certificado TLS válido para IP).
- Mantén esto solo como estado transitorio.
- Security Group debe permitir `80/tcp`.

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

Edita `.env.production` y completa como mínimo (si no tienes claves, genéralas así):

```bash
# En el servidor, dentro de /opt/vlf_erp
openssl rand -base64 48    # para DJANGO_SECRET_KEY
openssl rand -base64 32    # para POSTGRES_PASSWORD
```

Valores recomendados (ejemplo realista):

```env
DJANGO_SECRET_KEY=<pega_aqui_salida_de_openssl_rand_base64_48>
POSTGRES_PASSWORD=<pega_aqui_salida_de_openssl_rand_base64_32>

# Tu dominio público (sin protocolo)
DJANGO_ALLOWED_HOSTS=erp.tu-dominio.com

# Origen permitido del frontend (con https)
CORS_ALLOWED_ORIGINS=https://erp.tu-dominio.com

# URL del API que usará el frontend en build
# Si frontend y backend salen por el mismo dominio con nginx, deja ruta relativa:
VITE_API_URL=/api/v1

# WebSocket público
VITE_WS_URL=wss://erp.tu-dominio.com/ws
```

Notas rápidas:
- No inventes `DJANGO_SECRET_KEY`/`POSTGRES_PASSWORD` manualmente: usa `openssl`.
- `DJANGO_ALLOWED_HOSTS` no lleva `https://`, solo host.
- `CORS_ALLOWED_ORIGINS` sí lleva protocolo (`https://`).
- Si luego cambias dominio, actualiza estos 4 campos y vuelve a desplegar.

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
  - Solicita certificado en ACM para `erp.tu-dominio.com` (o wildcard `*.tu-dominio.com`) y asócialo al listener `443`.

- Si TLS termina en Nginx del host:
  - Extiende `nginx/nginx.prod.conf` con bloque `listen 443 ssl`.
  - Monta certificados válidos.

## 5.1) Cambio de IP temporal a dominio (cuando ya propagó DNS)

Cuando `dig +short erp.tu-dominio.com` ya resuelva correctamente:

1. Edita `.env.production` y reemplaza valores temporales:

```env
DJANGO_ALLOWED_HOSTS=erp.tu-dominio.com
CORS_ALLOWED_ORIGINS=https://erp.tu-dominio.com
VITE_API_URL=/api/v1
VITE_WS_URL=wss://erp.tu-dominio.com/ws
DJANGO_SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000
```

2. Rebuild + redeploy (importante: el frontend necesita rebuild por `VITE_WS_URL`):

```bash
cd /opt/vlf_erp
./scripts/deploy_production.sh /opt/vlf_erp
```

3. Valida:

```bash
curl -I https://erp.tu-dominio.com
curl -f https://erp.tu-dominio.com/api/v1/health/
```

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
