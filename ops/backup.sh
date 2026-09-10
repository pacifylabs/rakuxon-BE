#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=/root/projects/rakuxon
cd "$root/backend"
mkdir -p "$root/backups"
file="$root/backups/database-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file "$root/secrets/compose.env" -f ops/compose.yml exec -T db \
  pg_dump -U rakuxon_owner -d rakuxon --format=custom > "$file.tmp"
test -s "$file.tmp"
docker compose --env-file "$root/secrets/compose.env" -f ops/compose.yml exec -T db \
  pg_restore --list < "$file.tmp" > /dev/null
mv "$file.tmp" "$file"
find "$root/backups" -maxdepth 1 -name 'database-*.dump' -mtime +14 -delete
printf 'Verified database backup: %s\n' "$file"
