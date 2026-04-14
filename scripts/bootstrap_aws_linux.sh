#!/usr/bin/env bash
set -euo pipefail

# Bootstrap base para servidor AWS Linux (Ubuntu 22.04/24.04 o Debian 12).
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
else
  echo "Sistema no soportado por este script (solo apt-get)." >&2
  exit 1
fi

systemctl enable docker
systemctl start docker

if [[ -n "${SUDO_USER:-}" ]]; then
  usermod -aG docker "${SUDO_USER}" || true
fi

ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

echo "Bootstrap completado."
echo "Si agregaste usuario al grupo docker, cierra y abre sesión para aplicar permisos."
