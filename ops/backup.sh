#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=/root/projects/rakuxon
cd "$root/backend"
mkdir -p "$root/backups"
file="$root/backups/database-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec postgres pg_dump -U postgres -d rakuxon_db --format=custom > "$file.tmp"
test -s "$file.tmp"
docker exec -i postgres pg_restore --list < "$file.tmp" > /dev/null
mv "$file.tmp" "$file"
find "$root/backups" -maxdepth 1 -name 'database-*.dump' -mtime +14 -delete
printf 'Verified database backup: %s\n' "$file"
