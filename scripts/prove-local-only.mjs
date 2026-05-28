#!/usr/bin/env node
/**
 * scripts/prove-local-only.mjs
 *
 * Egress proof for Public Squidley.
 *
 * Two layers:
 *
 *   1. STATIC: scan src/ for cloud URLs outside the allowed metadata files
 *      and assert there are none.
 *
 *   2. DYNAMIC: run the runtime egress-guard test suite
 *      (src/lib/egressGuard.test.ts) which replaces global fetch with an
 *      interceptor that throws on any non-local URL, then exercises chat,
 *      stream, fabrica, oculus, health, models, and detection. This is the
 *      real dynamic proof — it does NOT require tsx, because vitest is
 *      already a devDependency of this repo.
 *
 *   3. The egress-guard test is also part of the regular `npm test` run,
 *      so dynamic proof is enforced on every CI build.
 *
 * Static-only fallback is gated behind ALLOW_STATIC_ONLY_LOCAL_PROOF=1 and
 * is never accepted by `npm run verify:release`.
 *
 * Exit codes:
 *   0  static + dynamic proof passed
 *   1  static or dynamic proof failed
 *   2  setup/import error
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");

function staticProof() {
  const cmd = [
    "grep",
    "-RIn",
    "https://api\\.openai\\.com\\|openrouter\\.ai\\|api\\.anthropic\\.com\\|generativelanguage\\.googleapis\\.com",
    "src/",
    "--include=*.ts",
    "--include=*.tsx",
    "--include=*.js",
  ];
  const result = spawnSync(cmd[0], cmd.slice(1), {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const allowList = [
    "src/lib/providers/registry.ts",
    "src/lib/ratio/modelCapabilities.ts",
    "src/lib/security/promptGateway.ts",
  ];
  const hits = (result.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !line.includes(".test.") &&
        !allowList.some((p) => line.startsWith(p + ":")),
    );
  return { ok: hits.length === 0, hits };
}

function dynamicProof() {
  // Run only the egress-guard test file. Vitest is a devDependency, so this
  // works in any environment that has node_modules installed — no global
  // tsx required.
  const result = spawnSync(
    "npx",
    ["--no-install", "vitest", "run", "--silent", "src/lib/egressGuard.test.ts"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();
  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout,
    stderr,
  };
}

function writeReport(report) {
  const dir = path.join(REPO_ROOT, "reports", "local-only-proof");
  mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `${report.completedAt.replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return file;
}

const allowStaticOnly =
  process.env.ALLOW_STATIC_ONLY_LOCAL_PROOF === "1" ||
  process.env.ALLOW_STATIC_ONLY_LOCAL_PROOF === "true";

const static_ = staticProof();
let dynamic = null;
if (!allowStaticOnly) {
  if (!existsSync(path.join(REPO_ROOT, "node_modules", "vitest"))) {
    console.error(
      "FAIL: vitest is not installed. Run `npm install` first or rerun with ALLOW_STATIC_ONLY_LOCAL_PROOF=1 (NOT permitted for verify:release).",
    );
    const report = {
      schemaVersion: 1,
      tool: "scripts/prove-local-only.mjs",
      completedAt: new Date().toISOString(),
      static: static_,
      dynamic: { ok: false, reason: "vitest-not-installed" },
      verdict: "FAIL",
    };
    writeReport(report);
    process.exit(1);
  }
  dynamic = dynamicProof();
}

const verdict =
  static_.ok && (allowStaticOnly || (dynamic && dynamic.ok))
    ? "PASS"
    : "FAIL";

const report = {
  schemaVersion: 1,
  tool: "scripts/prove-local-only.mjs",
  completedAt: new Date().toISOString(),
  allowStaticOnly,
  static: static_,
  dynamic,
  verdict,
};

const reportPath = writeReport(report);
console.log(JSON.stringify(report, null, 2));
console.log(`report: ${reportPath}`);

if (!static_.ok) {
  console.error(
    `\nFAIL: static proof found ${static_.hits.length} cloud URL hit(s) outside locked metadata.`,
  );
  process.exit(1);
}

if (!allowStaticOnly && dynamic && !dynamic.ok) {
  console.error("\nFAIL: dynamic egress-guard test failed.");
  if (dynamic.stderr) console.error(dynamic.stderr);
  if (dynamic.stdout) console.error(dynamic.stdout);
  process.exit(1);
}

if (allowStaticOnly) {
  console.log(
    "\nWARN: dynamic proof skipped via ALLOW_STATIC_ONLY_LOCAL_PROOF. Static proof passed. NOT acceptable for verify:release.",
  );
  process.exit(0);
}

console.log("\nPASS: static and dynamic local-only proofs clean.");
process.exit(0);
