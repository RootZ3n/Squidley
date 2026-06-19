#!/usr/bin/env bash
# Peh Public — Local Egress Proof Procedure
#
# This script documents how to verify that Peh Public local mode
# makes NO outbound requests to cloud AI endpoints. It is a procedure
# document, not an automated test. Run each section manually.
#
# STATUS: Egress proof procedure (not yet executed with packet capture).
#
# ─── Prerequisites ───────────────────────────────────────────────────
#
# 1. Ollama running locally:  ollama serve
# 2. A model pulled:          ollama pull llama3.2
# 3. Peh dev server:     npm run dev
# 4. Root/sudo for tcpdump (optional)
#
# ─── Cloud endpoints to monitor ──────────────────────────────────────
#
CLOUD_DOMAINS=(
  "api.openai.com"
  "openrouter.ai"
  "api.anthropic.com"
  "generativelanguage.googleapis.com"
  "gemini.google.com"
  "api.cohere.com"
  "api.mistral.ai"
  "api.together.xyz"
)

set -euo pipefail

echo "=== Peh Public — Egress Proof Procedure ==="
echo ""

# ─── Layer 1: Code-level proof (static analysis) ────────────────────
echo "--- Layer 1: Code-level endpoint guard ---"
echo ""
echo "The local endpoint guard (src/lib/providers/local.ts:isAllowedLocalEndpoint)"
echo "rejects any URL that is not:"
echo "  - http:// protocol only (no https)"
echo "  - localhost, ::1, .local, private IPv4 (10.x, 127.x, 172.16-31.x, 192.168.x)"
echo "  - IPv6 unique-local (fc/fd) or link-local (fe80:)"
echo ""
echo "Cloud URLs (https://api.openai.com etc.) fail both the protocol and host checks."
echo ""

# Check that cloud URLs exist ONLY in locked metadata and test guards
echo "Scanning source for cloud API URLs outside of locked metadata..."
CLOUD_HITS=$(grep -rn \
  'api\.openai\.com\|openrouter\.ai\|api\.anthropic\.com\|googleapis\.com' \
  src/ \
  --include='*.ts' --include='*.tsx' \
  | grep -v 'registry\.ts' \
  | grep -v '\.test\.' \
  | grep -v 'modelCapabilities\.ts' \
  | grep -v 'promptGateway\.ts' \
  || true)

if [ -z "$CLOUD_HITS" ]; then
  echo "PASS: No cloud API URLs found outside locked metadata, tests, and gateway."
else
  echo "REVIEW: Cloud API URLs found in unexpected locations:"
  echo "$CLOUD_HITS"
fi
echo ""

# ─── Layer 2: Test-level proof ───────────────────────────────────────
echo "--- Layer 2: Test coverage ---"
echo ""
echo "Running test suite to confirm endpoint guard and no-cloud tests pass..."
npx vitest run --reporter=verbose 2>&1 | grep -E '(isAllowedLocal|cloud|no.silent|local.endpoint|publicReleaseSafety)' || true
echo ""
echo "Key tests:"
echo "  - isAllowedLocalEndpoint rejects https://api.openai.com"
echo "  - publicReleaseSafety.test.ts: no silent cloud fallback"
echo "  - local endpoint guard blocks non-local URLs"
echo ""

# ─── Layer 3: Runtime network monitoring (manual) ────────────────────
echo "--- Layer 3: Runtime network monitoring (manual) ---"
echo ""
echo "To run packet capture during a local session:"
echo ""
echo "  # Terminal 1: Start tcpdump watching for cloud DNS/connections"
echo "  sudo tcpdump -i any -n 'port 443 or port 53' -w peh-egress.pcap &"
echo "  TCPDUMP_PID=\$!"
echo ""
echo "  # Terminal 2: Start Peh"
echo "  npm run dev"
echo ""
echo "  # Terminal 3: Exercise all local features"
echo "  # 1. GET  http://localhost:3000/api/local/health"
echo "  # 2. GET  http://localhost:3000/api/local/models"
echo "  # 3. POST http://localhost:3000/api/chat         (Colloquium)"
echo "  # 4. POST http://localhost:3000/api/chat/stream  (streaming)"
echo "  # 5. POST http://localhost:3000/api/fabrica/suggest (Fabrica)"
echo "  # 6. Run:  npm run gauntlet:local-model"
echo ""
echo "  # After exercising features, stop tcpdump:"
echo "  sudo kill \$TCPDUMP_PID"
echo ""
echo "  # Analyze the capture for cloud connections:"
DOMAIN_FILTER=""
for d in "${CLOUD_DOMAINS[@]}"; do
  if [ -n "$DOMAIN_FILTER" ]; then
    DOMAIN_FILTER="$DOMAIN_FILTER or "
  fi
  DOMAIN_FILTER="${DOMAIN_FILTER}host $d"
done
echo "  tcpdump -r peh-egress.pcap '$DOMAIN_FILTER' | head -50"
echo ""
echo "  # Expected result: 0 packets matching cloud endpoints."
echo ""

# ─── Layer 4: ss/lsof spot check ────────────────────────────────────
echo "--- Layer 4: Active connection spot check ---"
echo ""
echo "While Peh dev server is running, check for cloud connections:"
echo ""
echo "  # Check established connections from the Node process:"
echo "  ss -tnp | grep node | grep -v '127.0.0.1\|::1\|localhost'"
echo ""
echo "  # Or with lsof:"
echo "  lsof -i -n -P | grep node | grep -v 'localhost\|127.0.0.1\|::1'"
echo ""
echo "  # Expected: only local connections (127.0.0.1, ::1, localhost)."
echo ""

# ─── Layer 5: Fetch call inventory ───────────────────────────────────
echo "--- Layer 5: Fetch call site inventory ---"
echo ""
echo "All fetch() calls in src/ (excluding tests):"
grep -rn 'fetch(' src/ --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v 'node_modules' || true
echo ""
echo "Each fetch call above should target:"
echo "  - The configured local endpoint (PEH_LOCAL_ENDPOINT)"
echo "  - A relative /api/ path (Next.js internal routing)"
echo "  - No hardcoded cloud URLs"
echo ""

echo "=== Egress proof procedure complete ==="
echo ""
echo "DISCLAIMER: This is a proof procedure, not a certification."
echo "Packet capture validation has not been run yet."
echo "Code-level and test-level evidence supports the no-cloud claim."
