#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=/root/projects/rakuxon
component=${1:?frontend or backend required}
sha=${2:?exact commit required}
[[ "$component" =~ ^(frontend|backend)$ && "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 64
exec 9>"$root/.deploy.lock"
flock -w 1800 9
repo="$root/$component"
[[ -z "$(git -C "$repo" status --porcelain)" ]] || { echo 'Server checkout has local changes; refusing to overwrite.'; exit 1; }
git -C "$repo" fetch origin main
# Only verified production-branch commits may be deployed.
git -C "$repo" merge-base --is-ancestor "$sha" origin/main
if [[ "$(git -C "$repo" rev-parse HEAD)" != "$sha" ]] && git -C "$repo" merge-base --is-ancestor "$sha" HEAD; then
  echo 'Skipping a superseded deployment.'
  exit 0
fi
old_git=$(git -C "$repo" rev-parse HEAD)
git -C "$repo" checkout --detach "$sha"
cd "$root/backend"
source "$root/release.env"
old_be=$BE_SHA; old_fe=$FE_SHA
if [[ "$component" == backend ]]; then BE_SHA=$sha; services=(api); else FE_SHA=$sha; services=(site partner schools admin); fi
export BE_SHA FE_SHA
compose=(docker compose --env-file "$root/release.env" -f ops/compose.yml)
# Build before disturbing running services; avoid concurrent builds on a shared VPS.
for service in "${services[@]}"; do "${compose[@]}" build "$service"; done
# Keep rollback images outside Docker's weekly unused-image cleanup.
old_images=("rakuxon-api:$old_be" "rakuxon-site:$old_fe" "rakuxon-partner:$old_fe" "rakuxon-schools:$old_fe" "rakuxon-admin:$old_fe")
docker image save "${old_images[@]}" | gzip -1 > "$root/backups/rollback-images.tar.gz.tmp"
mv "$root/backups/rollback-images.tar.gz.tmp" "$root/backups/rollback-images.tar.gz"
printf 'BE_SHA=%s\nFE_SHA=%s\n' "$old_be" "$old_fe" > "$root/previous-release.env"
bash ops/backup.sh
rollback() {
  status=$?
  trap - ERR
  echo 'Deployment failed. Restoring the previous application images; database changes are not automatically reverted.' >&2
  git -C "$repo" checkout --detach "$old_git"
  export BE_SHA=$old_be FE_SHA=$old_fe
  "${compose[@]}" up -d --no-build --wait --wait-timeout 180 api site partner schools admin || true
  "${compose[@]}" up -d --no-build --no-deps --force-recreate --wait --wait-timeout 60 gateway || true
  exit "$status"
}
trap rollback ERR
if [[ "$component" == backend ]]; then
  "${compose[@]}" run --rm --no-deps migrate
fi
"${compose[@]}" up -d --no-build --wait --wait-timeout 180 "${services[@]}"
"${compose[@]}" up -d --no-build --no-deps --force-recreate --wait --wait-timeout 60 gateway
bash ops/smoke.sh
printf 'BE_SHA=%s\nFE_SHA=%s\n' "$BE_SHA" "$FE_SHA" > "$root/release.env.tmp"
mv "$root/release.env.tmp" "$root/release.env"
trap - ERR
printf 'Deployed %s at %s\n' "$component" "$sha"
