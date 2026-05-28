#!/usr/bin/env bash
set -euo pipefail

# Filesystem path intentionally unchanged: the physical folder rename
# (/mnt/ai/squidley -> /mnt/ai/peh-pub) is a deferred migration step.
REPO_DIR="/mnt/ai/squidley"

# Canonical unit is peh-public.service. During the migration the host may
# still have only the legacy squidley-public.service installed, so fall back
# to it until the new unit is enabled (deferred ops task).
SERVICE_NAME="peh-public.service"
LEGACY_SERVICE_NAME="squidley-public.service"

cd "$REPO_DIR"

npm run typecheck
npm test
npm run build

if systemctl --user cat "$SERVICE_NAME" >/dev/null 2>&1; then
  ACTIVE_SERVICE="$SERVICE_NAME"
else
  ACTIVE_SERVICE="$LEGACY_SERVICE_NAME"
fi

systemctl --user restart "$ACTIVE_SERVICE"
systemctl --user --no-pager status "$ACTIVE_SERVICE"
