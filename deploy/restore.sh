#!/usr/bin/env bash
# Puts a backup back. Everything now in the database is replaced.
#   bash deploy/restore.sh backups/db-20261002-023000.sql.gz [backups/uploads-20261002-023000.tar.gz]
set -euo pipefail
cd "$(dirname "$0")/.."
DB_FILE="${1:?Give the database backup file, for example backups/db-20261002-023000.sql.gz}"
UPLOADS_FILE="${2:-}"
read -r -p "This replaces all current data with $DB_FILE. Type yes to continue: " OK
[ "$OK" = "yes" ] || { echo "Stopped. Nothing was changed."; exit 1; }
docker compose stop api web
docker compose exec -T db psql -U cx -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS cx WITH (FORCE)' -c 'CREATE DATABASE cx'
gunzip -c "$DB_FILE" | docker compose exec -T db psql -U cx -d cx -v ON_ERROR_STOP=1 >/dev/null
docker compose start api web
if [ -n "$UPLOADS_FILE" ]; then
  docker compose exec -T api sh -c 'rm -rf /data/uploads/*'
  docker compose exec -T api tar -xzf - -C /data < "$UPLOADS_FILE"
fi
echo "Restored."
