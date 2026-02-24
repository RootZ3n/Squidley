#!/usr/bin/env bash
set -euo pipefail

WEB_URL="${1:-http://127.0.0.1:3001}"

# Wait up to ~20s
TRIES="${TRIES:-80}"
SLEEP_S="${SLEEP_S:-0.25}"

echo "== wait web =="
echo "Target: $WEB_URL"

for ((i=1; i<=TRIES; i++)); do
  if curl -fsS --max-time 2 "$WEB_URL" >/dev/null 2>&1; then
    echo "✅ web ready"
    exit 0
  fi
  sleep "$SLEEP_S"
done

echo "❌ web did not become ready in time: $WEB_URL" >&2
exit 1