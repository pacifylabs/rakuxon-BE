#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${SSH_ORIGINAL_COMMAND:-}" =~ ^(frontend|backend)\ ([0-9a-f]{40})$ ]]; then
  exec bash /root/projects/rakuxon/backend/ops/deploy.sh "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
fi
echo 'Only Rakuxon deployment commands are allowed.' >&2
exit 64
