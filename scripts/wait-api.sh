#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://127.0.0.1:18790/health}"
TRIES="${2:-40}"          # 40 * 0.25s = 10s
SLEEP="${3:-0.25}"

for i in $(seq 1 "$TRIES"); do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    echo "✅ API up: $URL"
    exit 0
  fi
  sleep "$SLEEP"
done

echo "❌ API not up after $TRIES tries: $URL" >&2
exit 1
