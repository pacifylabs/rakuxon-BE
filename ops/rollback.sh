#!/usr/bin/env bash
set -Eeuo pipefail
root=/root/projects/rakuxon
exec 9>"$root/.deploy.lock"
flock -w 1800 9
cd "$root/backend"
chmod 644 ops/nginx/gateway.conf
source "$root/previous-release.env"
export BE_SHA FE_SHA
gzip -dc "$root/backups/rollback-images.tar.gz" | docker image load
docker compose --env-file "$root/release.env" -f ops/compose.yml up -d --no-build --wait --wait-timeout 180 api site partner schools admin gateway
docker compose --env-file "$root/release.env" -f ops/compose.yml up -d --no-build --no-deps --force-recreate --wait --wait-timeout 60 gateway
bash ops/smoke.sh
cp "$root/previous-release.env" "$root/release.env"
echo 'Previous application images restored. Database schema has not been reverted.'
