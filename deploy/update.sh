#!/usr/bin/env bash
# Rebuilds and restarts after you have replaced the code with a newer version. Data is kept.
set -euo pipefail
cd "$(dirname "$0")/.."
bash deploy/backup.sh
docker compose up -d --build
docker image prune -f >/dev/null
echo "Updated. Database changes in apps/api/migrations are applied when the API starts."
