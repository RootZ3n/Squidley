#!/usr/bin/env node
/**
 * Squidley receipts retention (local-only).
 *
 * Defaults:
 *  - keep 30 days
 *  - keep at most 5000 receipts
 *  - always keep escalations + errors + admin/tool/memory.write receipts
 *
 * Env overrides:
 *  - ZENSQUID_RECEIPTS_DIR (default: <repo>/data/receipts)
 *  - ZENSQUID_RECEIPTS_KEEP_DAYS (default: 30)
 *  - ZENSQUID_RECEIPTS_MAX_COUNT (default: 5000)
 *  - ZENSQUID_RECEIPTS_DRY_RUN (default: 0)
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function toInt(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function nowMs() {
  return Date.now();
}

function parseArgs(argv) {
  const out = {
    days: undefined,
    max: undefined,
    dir: undefined,
    dryRun: undefined,
    verbose: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--days") out.days = argv[++i];
    else if (a === "--max") out.max = argv[++i];
    else if (a === "--dir") out.dir = argv[++i];
    else if (a === "--dry-run") out.dryRun = "1";
    else if (a === "--verbose") out.verbose = true;
    else if (a === "-h" || a === "--help") {
      console.log(`
Usage:
  node scripts/receipts-prune.mjs [--days N] [--max N] [--dir PATH] [--dry-run] [--verbose]

Env:
  ZENSQUID_RECEIPTS_DIR
  ZENSQUID_RECEIPTS_KEEP_DAYS
  ZENSQUID_RECEIPTS_MAX_COUNT
  ZENSQUID_RECEIPTS_DRY_RUN
`);
      process.exit(0);
    }
  }

  return out;
}

function shouldKeepAlways(obj) {
  // Keep escalations
  if (obj?.decision?.escalated === true) return true;

  // Keep "error-ish" receipts
  // (lots of shapes are possible; we just try common ones)
  if (typeof obj?.error === "string" && obj.error.trim()) return true;
  if (typeof obj?.provider_response?.error === "string" && obj.provider_response.error.trim()) return true;
  if (obj?.provider_response?.error && typeof obj.provider_response.error === "object") return true;

  // Keep admin/tool/memory write actions (audit trail)
  const kind = String(obj?.request?.kind ?? "").toLowerCase();
  if (
    kind.includes("admin") ||
    kind.includes("tool") ||
    kind.includes("memory.write") ||
    kind.includes("memory") && kind.includes("write")
  ) return true;

  // Keep anything explicitly marked important (future-proof)
  if (obj?.meta?.important === true) return true;

  return false;
}

function parseCreatedAtMs(obj) {
  const s = obj?.created_at;
  if (typeof s === "string") {
    const t = Date.parse(s);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const args = parseArgs(process.argv);

  const receiptsDir =
    args.dir ??
    process.env.ZENSQUID_RECEIPTS_DIR ??
    path.resolve(repoRoot, "data/receipts");

  const keepDays = clamp(
    toInt(args.days ?? process.env.ZENSQUID_RECEIPTS_KEEP_DAYS, 30),
    1,
    3650
  );

  const maxCount = clamp(
    toInt(args.max ?? process.env.ZENSQUID_RECEIPTS_MAX_COUNT, 5000),
    100,
    500000
  );

  const dryRun =
    String(args.dryRun ?? process.env.ZENSQUID_RECEIPTS_DRY_RUN ?? "0") === "1";

  const verbose = !!args.verbose;

  if (!(await fileExists(receiptsDir))) {
    console.error(`❌ receipts dir not found: ${receiptsDir}`);
    process.exit(2);
  }

  const cutoffMs = nowMs() - keepDays * 24 * 60 * 60 * 1000;

  const files = (await fs.readdir(receiptsDir).catch(() => []))
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.resolve(receiptsDir, f));

  if (files.length === 0) {
    console.log(`✅ receipts-prune: nothing to do (0 receipts).`);
    process.exit(0);
  }

  // Read+stat each receipt. We intentionally tolerate parse errors.
  const items = [];
  for (const full of files) {
    const name = path.basename(full);
    try {
      const [raw, st] = await Promise.all([
        fs.readFile(full, "utf-8"),
        fs.stat(full),
      ]);
      let obj = null;
      try {
        obj = JSON.parse(raw);
      } catch {
        // If JSON is corrupted, treat as deletable unless you prefer "keep".
        obj = null;
      }

      const createdAtMs = obj ? parseCreatedAtMs(obj) : null;
      const sortMs = createdAtMs ?? st.mtimeMs;

      items.push({
        full,
        name,
        sortMs,
        createdAtMs,
        mtimeMs: st.mtimeMs,
        size: st.size,
        keepAlways: obj ? shouldKeepAlways(obj) : false,
        obj,
      });
    } catch (e) {
      // If stat/read fails, skip it (don’t crash maintenance)
      if (verbose) console.warn(`warn: skip ${name}: ${String(e?.message ?? e)}`);
    }
  }

  // Sort newest -> oldest (descending ms)
  items.sort((a, b) => b.sortMs - a.sortMs);

  const keep = [];
  const candidates = [];

  for (const it of items) {
    if (it.keepAlways) {
      keep.push({ it, reason: "keepAlways" });
      continue;
    }
    // Age-based deletion candidate
    if (it.sortMs < cutoffMs) {
      candidates.push({ it, reason: `older_than_${keepDays}d` });
      continue;
    }
    keep.push({ it, reason: "within_window" });
  }

  // Enforce maxCount among NON-keepAlways receipts.
  // We keep all keepAlways receipts regardless of count.
  const keepAlwaysSet = new Set(keep.filter(k => k.reason === "keepAlways").map(k => k.it.full));
  const nonAlways = items.filter((it) => !keepAlwaysSet.has(it.full));

  // nonAlways is already newest->oldest because items is sorted.
  if (nonAlways.length > maxCount) {
    const overflow = nonAlways.slice(maxCount); // oldest overflow
    for (const it of overflow) {
      // Don’t double-add if already candidate
      if (!candidates.some((c) => c.it.full === it.full)) {
        candidates.push({ it, reason: `over_maxCount_${maxCount}` });
      }
    }
  }

  // Final deletions: unique by path
  const delMap = new Map();
  for (const c of candidates) delMap.set(c.it.full, c.reason);
  const deletions = [...delMap.entries()].map(([full, reason]) => ({ full, reason }));

  // Report
  const totalBytes = items.reduce((s, it) => s + (it.size ?? 0), 0);
  const delBytes = deletions.reduce((s, d) => {
    const it = items.find((x) => x.full === d.full);
    return s + (it?.size ?? 0);
  }, 0);

  console.log(
    `receipts-prune: dir=${receiptsDir}\n` +
    `  total=${items.length} (${Math.round(totalBytes / 1024)} KiB)\n` +
    `  keepDays=${keepDays} cutoff=${new Date(cutoffMs).toISOString()}\n` +
    `  maxCount=${maxCount}\n` +
    `  keepAlways=${keepAlwaysSet.size}\n` +
    `  delete=${deletions.length} (${Math.round(delBytes / 1024)} KiB)\n` +
    `  dryRun=${dryRun ? "yes" : "no"}`
  );

  if (verbose && deletions.length) {
    for (const d of deletions.slice(0, 50)) {
      console.log(`  delete: ${path.basename(d.full)}  (${d.reason})`);
    }
    if (deletions.length > 50) console.log(`  ...and ${deletions.length - 50} more`);
  }

  if (dryRun || deletions.length === 0) {
    process.exit(0);
  }

  // Delete oldest junk
  let deleted = 0;
  for (const d of deletions) {
    try {
      await fs.unlink(d.full);
      deleted++;
    } catch (e) {
      if (verbose) console.warn(`warn: failed delete ${path.basename(d.full)}: ${String(e?.message ?? e)}`);
    }
  }

  console.log(`✅ receipts-prune: deleted=${deleted}`);
}

main().catch((err) => {
  console.error(`❌ receipts-prune crashed: ${String(err?.stack ?? err)}`);
  process.exit(1);
});