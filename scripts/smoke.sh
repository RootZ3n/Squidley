#!/usr/bin/env bash
set -euo pipefail

API_URL="${ZENSQUID_API_URL:-http://127.0.0.1:18790}"

# Keep Playwright browsers out of home dir + out of git (you already .gitignore this)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$REPO_ROOT/.playwright-browsers}"

echo "== restart api =="
systemctl --user restart squidley-api.service
./scripts/wait-api.sh

echo "== api health =="
curl -fsS "$API_URL/health" | jq .

echo "== tools list =="
curl -fsS "$API_URL/tools/list" | jq '.ok, (.tools | length)'

echo "== receipts =="
# receipts endpoint returns: { count, receipts: [...] }
curl -fsS "$API_URL/receipts?limit=1" | jq -e '.count >= 0' >/dev/null
echo "✅ receipts ok"

echo "== web build =="
pnpm -C apps/web build >/dev/null
echo "✅ web build ok"

echo "== playwright setup =="
# Ensure browsers exist (idempotent; safe to run every time)
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"
pnpm -C apps/web exec playwright install chromium >/dev/null
echo "✅ playwright chromium ready (PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH)"

echo "== playwright =="
pnpm -C apps/web exec playwright test
echo "✅ playwright ok"

echo "🎉 SMOKE PASS"