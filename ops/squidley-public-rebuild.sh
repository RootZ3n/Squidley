#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/mnt/ai/squidley"
SERVICE_NAME="squidley-public.service"

cd "$REPO_DIR"

npm run typecheck
npm test
npm run build

systemctl --user restart "$SERVICE_NAME"
systemctl --user --no-pager status "$SERVICE_NAME"
