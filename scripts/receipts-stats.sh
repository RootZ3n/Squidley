#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECEIPTS_DIR="${ZENSQUID_RECEIPTS_DIR:-$REPO_ROOT/data/receipts}"

say() { echo -e "$*"; }

human_bytes() {
  local n="$1"
  if command -v numfmt >/dev/null 2>&1; then
    numfmt --to=iec-i --suffix=B "$n"
  else
    echo "${n}B"
  fi
}

file_size() {
  if stat --version >/dev/null 2>&1; then stat -c %s "$1"; else stat -f %z "$1"; fi
}

file_mtime_epoch() {
  if stat --version >/dev/null 2>&1; then stat -c %Y "$1"; else stat -f %m "$1"; fi
}

epoch_to_local() {
  local e="$1"
  if date --version >/dev/null 2>&1; then
    date -d "@$e" "+%Y-%m-%d %H:%M:%S %Z"
  else
    date -r "$e" "+%Y-%m-%d %H:%M:%S %Z"
  fi
}

main() {
  if [[ ! -d "$RECEIPTS_DIR" ]]; then
    say "receipts-stats: receipts dir not found:"
    say "  $RECEIPTS_DIR"
    exit 1
  fi

  mapfile -t files < <(find "$RECEIPTS_DIR" -maxdepth 1 -type f -name '*.json' -print 2>/dev/null | sort)
  local count="${#files[@]}"

  if [[ "$count" -eq 0 ]]; then
    say "receipts-stats: dir=$RECEIPTS_DIR"
    say "  total=0 (empty)"
    exit 0
  fi

  local total_bytes=0
  local oldest_file="" newest_file=""
  local oldest_label="" newest_label=""

  # trap-safe temp
  local tmp=""
  cleanup() {
    if [[ -n "${tmp:-}" && -f "${tmp:-}" ]]; then rm -f "$tmp" || true; fi
  }
  trap cleanup EXIT

  if command -v jq >/dev/null 2>&1; then
    tmp="$(mktemp -t zensquid-receipts-stats.XXXXXX)"

    for f in "${files[@]}"; do
      total_bytes=$(( total_bytes + $(file_size "$f") ))
      jq -r --arg f "$f" '
        (.created_at // empty) as $c
        | (try ($c | fromdateiso8601) catch empty) as $e
        | if ($e|type)=="number" then "\($e)\t\($f)\t\($c)" else empty end
      ' "$f" >> "$tmp" 2>/dev/null || true
    done

    if [[ -s "$tmp" ]]; then
      IFS=$'\t' read -r _e_old oldest_file oldest_label < <(sort -n "$tmp" | head -n 1)
      IFS=$'\t' read -r _e_new newest_file newest_label < <(sort -nr "$tmp" | head -n 1)
    else
      # created_at missing/unparseable; fallback to mtime
      local oldest_t=9999999999 newest_t=0
      for f in "${files[@]}"; do
        t="$(file_mtime_epoch "$f")"
        if (( t < oldest_t )); then oldest_t="$t"; oldest_file="$f"; fi
        if (( t > newest_t )); then newest_t="$t"; newest_file="$f"; fi
      done
      oldest_label="$(epoch_to_local "$oldest_t")"
      newest_label="$(epoch_to_local "$newest_t")"
    fi
  else
    # no jq -> mtime
    for f in "${files[@]}"; do total_bytes=$(( total_bytes + $(file_size "$f") )); done
    local oldest_t=9999999999 newest_t=0
    for f in "${files[@]}"; do
      t="$(file_mtime_epoch "$f")"
      if (( t < oldest_t )); then oldest_t="$t"; oldest_file="$f"; fi
      if (( t > newest_t )); then newest_t="$t"; newest_file="$f"; fi
    done
    oldest_label="$(epoch_to_local "$oldest_t")"
    newest_label="$(epoch_to_local "$newest_t")"
  fi

  say "receipts-stats: dir=$RECEIPTS_DIR"
  say "  total=$count ($(human_bytes "$total_bytes"))"
  say "  oldest=$oldest_label  file=$(basename "$oldest_file")"
  say "  newest=$newest_label  file=$(basename "$newest_file")"
  say ""

  say "  top_10_largest:"
  {
    for f in "${files[@]}"; do
      echo "$(file_size "$f") $f"
    done
  } | sort -nr | head -n 10 | while read -r bytes path; do
    printf "    - %8s  %s\n" "$(human_bytes "$bytes")" "$(basename "$path")"
  done

  say ""
  say "Tip: run with a custom dir:"
  say "  ZENSQUID_RECEIPTS_DIR=/path/to/receipts ./scripts/receipts-stats.sh"
}

main "$@"