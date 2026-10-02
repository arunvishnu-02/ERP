#!/usr/bin/env bash
# Saves the database and the uploaded files into the backups folder and keeps the newest 14.
# Run it every night:  crontab -e  then add the line
#   30 2 * * * cd /opt/cx-crm-erp && bash deploy/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
docker compose exec -T db pg_dump -U cx -d cx --no-owner | gzip > "backups/db-$STAMP.sql.gz"
docker compose exec -T api tar -czf - -C /data uploads > "backups/uploads-$STAMP.tar.gz"
ls -1t backups/db-*.sql.gz | tail -n +15 | xargs -r rm -f
ls -1t backups/uploads-*.tar.gz | tail -n +15 | xargs -r rm -f
echo "$(date '+%F %T') backup saved: backups/db-$STAMP.sql.gz and backups/uploads-$STAMP.tar.gz"
