#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECEIPTS_DIR="${ZENSQUID_RECEIPTS_DIR:-$REPO_ROOT/data/receipts}"
DAYS="${1:-14}"

say() { echo -e "$*"; }

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "❌ missing dependency: $1" >&2
    exit 1
  }
}

epoch_from_iso() {
  local iso="$1"
  date -d "$iso" +%s 2>/dev/null || true
}

# NOTE: tmp paths must be global (NOT local), because EXIT traps run after functions return.
tmp=""
tmp_filtered=""

cleanup() {
  # be safe under `set -u`
  [[ -n "${tmp:-}" ]] && rm -f "${tmp}" >/dev/null 2>&1 || true
  [[ -n "${tmp_filtered:-}" ]] && rm -f "${tmp_filtered}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

main() {
  need jq
  need find
  need sort
  need awk
  need date
  need wc
  need mktemp

  if [[ ! -d "$RECEIPTS_DIR" ]]; then
    say "receipts-histogram: receipts dir not found:"
    say "  $RECEIPTS_DIR"
    exit 1
  fi

  mapfile -t files < <(find "$RECEIPTS_DIR" -maxdepth 1 -type f -name '*.json' -print 2>/dev/null)
  total="${#files[@]}"

  say "receipts-histogram: dir=$RECEIPTS_DIR"
  say "  total_files=$total"
  say "  window_days=$DAYS"
  echo ""

  if [[ "$total" -eq 0 ]]; then
    say "  (no receipts)"
    exit 0
  fi

  cutoff_epoch="$(date -d "$DAYS days ago" +%s)"

  tmp="$(mktemp -t zensquid-receipts-hist.XXXXXX)"
  tmp_filtered="${tmp}.filtered"

  # TSV: epoch \t day \t kind \t mode \t skill \t file
  for f in "${files[@]}"; do
    created_at="$(jq -r '.created_at // empty' "$f" 2>/dev/null || true)"
    [[ -n "$created_at" ]] || continue

    ep="$(epoch_from_iso "$created_at")"
    [[ -n "$ep" ]] || continue

    day="${created_at:0:10}"
    kind="$(jq -r '.request.kind // "-"' "$f" 2>/dev/null || echo '-')"
    mode="$(jq -r '.request.mode // "-"' "$f" 2>/dev/null || echo '-')"
    skill="$(jq -r '.request.selected_skill // "-"' "$f" 2>/dev/null || echo '-')"

    printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$ep" "$day" "$kind" "$mode" "$skill" "$(basename "$f")" >> "$tmp"
  done

  if [[ ! -s "$tmp" ]]; then
    say "❌ No parseable created_at timestamps found in receipts."
    say "   Debug: jq -r '.created_at' \"$RECEIPTS_DIR\"/*.json | head"
    exit 1
  fi

  awk -F'\t' -v cutoff="$cutoff_epoch" '$1 >= cutoff { print }' "$tmp" > "$tmp_filtered" || true

  in_window="$(wc -l < "$tmp_filtered" | tr -d ' ')"

  say "  receipts_in_window=$in_window"
  echo ""

  if [[ "$in_window" -eq 0 ]]; then
    say "  (no receipts within last $DAYS days)"
    exit 0
  fi

  say "counts_per_day:"
  awk -F'\t' '{ print $2 }' "$tmp_filtered" \
    | sort | uniq -c \
    | awk '{ printf "  %s  %s\n", $1, $2 }'
  echo ""

  say "top_request_kinds:"
  awk -F'\t' '{ print $3 }' "$tmp_filtered" \
    | sort | uniq -c | sort -nr | head -n 12 \
    | awk '{ printf "  %6s  %s\n", $1, $2 }'
  echo ""

  say "top_modes:"
  awk -F'\t' '{ print $4 }' "$tmp_filtered" \
    | sort | uniq -c | sort -nr | head -n 12 \
    | awk '{ printf "  %6s  %s\n", $1, $2 }'
  echo ""

  say "top_selected_skills:"
  awk -F'\t' '{ print $5 }' "$tmp_filtered" \
    | sort | uniq -c | sort -nr | head -n 12 \
    | awk '{ printf "  %6s  %s\n", $1, $2 }'
  echo ""

  say "Tip:"
  say "  - Change window: ./scripts/receipts-histogram.sh 30"
  say "  - Custom dir: ZENSQUID_RECEIPTS_DIR=/path/to/receipts ./scripts/receipts-histogram.sh"
}

main "$@"