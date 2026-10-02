#!/usr/bin/env bash
# Installs and starts CX CRM ERP on a fresh Ubuntu server (Hostinger VPS).
#   With a domain (recommended, gives HTTPS):   bash deploy/install.sh crm.yourdomain.com
#   Without a domain, for a first look:         bash deploy/install.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN="${1:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is missing. Install the docker-compose-plugin package and run this again." >&2
  exit 1
fi

rand() { openssl rand -hex "$1"; }

if [ ! -f .env ]; then
  echo "Creating .env with new random secrets..."
  cat > .env <<EOF
SITE_ADDRESS=:80
APP_URL=http://localhost
COOKIE_SECURE=false
POSTGRES_PASSWORD=$(rand 24)
JWT_SECRET=$(rand 48)
ENCRYPTION_KEY=$(rand 32)
APP_TIMEZONE=Asia/Kolkata
EOF
  chmod 600 .env
fi

set_env() { # set_env KEY VALUE: replace the line in .env
  local tmp; tmp="$(mktemp)"
  grep -v "^$1=" .env > "$tmp" || true
  echo "$1=$2" >> "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
}

if [ -n "$DOMAIN" ]; then
  set_env SITE_ADDRESS "$DOMAIN"
  set_env APP_URL "https://$DOMAIN"
  set_env COOKIE_SECURE true
  ADDRESS="https://$DOMAIN"
else
  IP="$(hostname -I | awk '{print $1}')"
  set_env SITE_ADDRESS ":80"
  set_env APP_URL "http://$IP"
  set_env COOKIE_SECURE false
  ADDRESS="http://$IP"
fi

echo "Building and starting. The first build takes a few minutes..."
docker compose up -d --build

echo "Waiting for the app to answer..."
for i in $(seq 1 60); do
  if docker compose exec -T api node -e "fetch('http://localhost:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    echo
    echo "CX CRM ERP is running."
    echo "Open $ADDRESS in your browser and fill in the setup page to create your company and your login."
    [ -z "$DOMAIN" ] && echo "This is running without HTTPS. When your domain points to this server, run: bash deploy/install.sh your-domain.com"
    echo "Keep a private copy of the .env file. It holds the keys to your data."
    exit 0
  fi
  sleep 3
done
echo "The app did not start in time. See what went wrong with: docker compose logs api" >&2
exit 1
