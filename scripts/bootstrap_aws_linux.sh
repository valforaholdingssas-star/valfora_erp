#!/usr/bin/env bash
set -euo pipefail

# Bootstrap base para servidor AWS Linux.
# Ejecutar como root:
#   sudo bash scripts/bootstrap_aws_linux.sh

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta este script como root (sudo)." >&2
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg git ufw

  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg || true
    if [[ ! -s /etc/apt/keyrings/docker.gpg ]]; then
      curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    fi
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  . /etc/os-release
  CODENAME="${VERSION_CODENAME:-bookworm}"
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
elif command -v dnf >/dev/null 2>&1; then
  dnf update -y
  dnf install -y ca-certificates curl git docker

  # Compose plugin: intenta paquete nativo, si no existe usa binario oficial.
  if ! dnf install -y docker-compose-plugin; then
    install -d -m 0755 /usr/local/lib/docker/cli-plugins
    ARCH="$(uname -m)"
    case "${ARCH}" in
      x86_64) COMPOSE_ARCH="x86_64" ;;
      aarch64) COMPOSE_ARCH="aarch64" ;;
      *) COMPOSE_ARCH="x86_64" ;;
    esac
    curl -fsSL "https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-${COMPOSE_ARCH}" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  fi
else
  echo "Sistema no soportado por este script (requiere apt-get o dnf)." >&2
  exit 1
fi

systemctl enable docker
systemctl start docker

if [[ -n "${SUDO_USER:-}" ]]; then
  usermod -aG docker "${SUDO_USER}" || true
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw --force enable || true
fi

echo "Bootstrap completado."
echo "Si agregaste usuario al grupo docker, cierra y abre sesión para aplicar permisos."
