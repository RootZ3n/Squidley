#!/usr/bin/env bash
set -euo pipefail

API_URL="${ZENSQUID_API_URL:-http://127.0.0.1:18790}"
WEB_URL="${ZENSQUID_WEB_URL:-http://127.0.0.1:3001}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { echo -e "$*"; }

step() {
  local name="$1"; shift
  log "\n== $name =="
  "$@"
}

# Load secrets if present (no echo; safe for local dev + smoke)
load_secrets() {
  local envfile="$REPO_ROOT/config/secrets/api.env"
  if [[ -f "$envfile" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$envfile"
    set +a
  fi
}

wait_http () {
  local url="$1"
  local name="${2:-service}"
  local tries="${3:-80}"   # 80 * 0.25s = 20s max

  for _i in $(seq 1 "$tries"); do
    if curl -fsS --connect-timeout 1 --max-time 2 "$url" >/dev/null 2>&1; then
      echo "✅ $name ready: $url"
      return 0
    fi
    sleep 0.25
  done

  echo "❌ $name not ready after $tries tries: $url"
  return 1
}

main() {
  log "== smoke start =="
  log "REPO_ROOT=$REPO_ROOT"
  log "API_URL=$API_URL"
  log "WEB_URL=$WEB_URL"

  load_secrets

  step "bootstrap deps" bash -lc '
    set -euo pipefail
    if [[ -d node_modules ]]; then
      echo "Deps look OK (skipping install)."
    else
      echo "Installing deps…"
      pnpm -r install --frozen-lockfile
    fi
  '

  step "build api" bash -lc "set -euo pipefail; cd \"$REPO_ROOT\" && pnpm -C apps/api build"

  step "build web" bash -lc "
    set -euo pipefail
    cd \"$REPO_ROOT\"

    logf=\".smoke-logs/build_web_\$(date +%F_%H%M%S).log\"
    mkdir -p .smoke-logs

    echo \"Running: pnpm -C apps/web build\"
    if pnpm -C apps/web build 2>&1 | tee \"\$logf\"; then
      exit 0
    fi

    # If we hit the known Next/punycode invalid package config bug, do a one-time heal+retry
    if grep -Eq \"ERR_INVALID_PACKAGE_CONFIG|punycode/package\\.json|compiled/punycode/package\\.json\" \"\$logf\"; then
      echo \"\"
      echo \"⚠️  Detected pnpm/next compiled punycode invalid package config. Attempting one-time dependency heal…\"
      pnpm store prune
      pnpm -r install --prefer-frozen-lockfile --force

      echo \"\"
      echo \"Retrying: pnpm -C apps/web build\"
      pnpm -C apps/web build
      exit 0
    fi

    echo \"❌ Web build failed (not the known punycode issue). Log: \$logf\" >&2
    exit 1
  "

  step "restart services" bash -lc "set -euo pipefail; cd \"$REPO_ROOT\" && \"$REPO_ROOT/scripts/squid\" restart"

  step "wait for services" bash -lc "
    set -euo pipefail
    wait_http() {
      local url=\"\$1\"
      local name=\"\${2:-service}\"
      local tries=\"\${3:-80}\"
      for _i in \$(seq 1 \"\$tries\"); do
        if curl -fsS --connect-timeout 1 --max-time 2 \"\$url\" >/dev/null 2>&1; then
          echo \"✅ \$name ready: \$url\"
          return 0
        fi
        sleep 0.25
      done
      echo \"❌ \$name not ready after \$tries tries: \$url\"
      return 1
    }

    wait_http \"$API_URL/health\" \"API\"
    wait_http \"$WEB_URL\" \"Web\"
  "

  step "api health" bash -lc "set -euo pipefail; curl -fsS --connect-timeout 3 --max-time 10 \"$API_URL/health\""
  log ""

  step "tools list" bash -lc "set -euo pipefail; curl -fsS --connect-timeout 3 --max-time 10 \"$API_URL/tools/list\""
  log ""

  # IMPORTANT: keep *all* tmp/jq usage inside the same bash -lc so $tmp exists there.
  step "receipts endpoint" bash -lc "
    set -euo pipefail

    tmp=\$(mktemp -t zensquid-receipts.XXXXXX)
    trap 'rm -f \"\$tmp\"' EXIT

    if [[ -z \"\${ZENSQUID_ADMIN_TOKEN:-}\" ]]; then
      echo \"ZENSQUID_ADMIN_TOKEN not set; asserting /receipts returns 401 (expected).\" >&2

      curl_rc=0
      code=\$(curl -sS --connect-timeout 3 --max-time 10 -o \"\$tmp\" -w '%{http_code}' \"$API_URL/receipts?limit=1\") || curl_rc=\$?

      if [[ \"\$curl_rc\" == \"28\" ]]; then
        echo \"❌ /receipts timed out (curl exit 28) while expecting 401. Server may be hung.\" >&2
        exit 1
      fi

      if [[ \"\$code\" != \"401\" ]]; then
        echo \"Unexpected HTTP \$code from /receipts (expected 401). Body:\" >&2
        cat \"\$tmp\" >&2 || true
        exit 1
      fi

      cat \"\$tmp\" || true
      exit 0
    fi

    curl_rc=0
    code=\$(curl -sS --connect-timeout 3 --max-time 10 -o \"\$tmp\" -w '%{http_code}' \
      -H \"x-zensquid-admin-token: \${ZENSQUID_ADMIN_TOKEN}\" \
      \"$API_URL/receipts?limit=1\") || curl_rc=\$?

    if [[ \"\$curl_rc\" == \"28\" ]]; then
      echo \"❌ /receipts timed out (curl exit 28). Server may be hung.\" >&2
      exit 1
    fi

    if [[ \"\$code\" != \"200\" ]]; then
      echo \"Unexpected HTTP \$code from /receipts (expected 200). Body:\" >&2
      cat \"\$tmp\" >&2 || true
      exit 1
    fi

    # Correctly read decision fields from .decision
    jq '{
      ok,
      count,
      first_receipt: (
        .receipts[0]
        | {
            receipt_id,
            created_at,
            decision: ((.decision // {}) | {tier, provider, model, escalated})
          }
      )
    }' \"\$tmp\"
  "

  log "\n✅ SMOKE PASSED"
}

main "$@"