#!/usr/bin/env bash
set -Eeuo pipefail
for host in rakuxon.com app.rakuxon.com schools.rakuxon.com admin.rakuxon.com; do
  docker exec rakuxon_gateway wget -q -O /dev/null --header="Host: $host" http://127.0.0.1:8080/
  docker exec rakuxon_gateway wget -qO- --header="Host: $host" http://127.0.0.1:8080/api/v1/health |
    python3 -c 'import json,sys; b=json.load(sys.stdin); assert b["status"] == "ok" and b["dependencies"]["database"] == "up"'
  printf 'PASS %s: frontend and API/database\n' "$host"
done
