#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

echo "== restart api =="
systemctl --user restart squidley-api.service
"$ROOT/scripts/wait-api.sh" "http://127.0.0.1:18790/health" 60 0.25

echo "== api health =="
curl -fsS http://127.0.0.1:18790/health | jq

echo "== tools list =="
curl -fsS http://127.0.0.1:18790/tools/list | jq '.ok, (.tools|length)'

echo "== web build =="
pnpm -C apps/web build >/dev/null
echo "✅ web build ok"

echo "== playwright =="
PLAYWRIGHT_BROWSERS_PATH="$ROOT/.playwright-browsers" pnpm -C apps/web exec playwright test
echo "✅ playwright ok"

echo "🎉 SMOKE PASS"
