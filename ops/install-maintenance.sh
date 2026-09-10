#!/usr/bin/env bash
set -Eeuo pipefail
cat > /etc/systemd/system/rakuxon-backup.service <<'UNIT'
[Unit]
Description=Back up the Rakuxon PostgreSQL database
Requires=docker.service
After=docker.service
[Service]
Type=oneshot
ExecStart=/bin/bash /root/projects/rakuxon/backend/ops/backup.sh
UMask=0077
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
UNIT
cat > /etc/systemd/system/rakuxon-backup.timer <<'UNIT'
[Unit]
Description=Daily Rakuxon database backup
[Timer]
OnCalendar=*-*-* 02:20:00 UTC
RandomizedDelaySec=600
Persistent=true
[Install]
WantedBy=timers.target
UNIT
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/rakuxon-nginx-reload <<'HOOK'
#!/bin/sh
set -eu
[ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/rakuxon.com ] || exit 0
docker exec nginx_proxy nginx -t
docker exec nginx_proxy nginx -s reload
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/rakuxon-nginx-reload
systemctl daemon-reload
systemctl enable --now rakuxon-backup.timer
