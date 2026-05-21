#!/usr/bin/env node
/**
 * verify:capabilities — Public Squidley capability/tool matrix validator.
 *
 * Validates that docs/capability-matrix.public-squidley.json and
 * docs/tool-matrix.public-squidley.json are internally consistent and
 * aligned with docs/CAPABILITY_TAXONOMY.md.
 *
 * Exit code 0 on success; non-zero on any failure. Prints JSON to stdout.
 *
 * Checks performed:
 *   1. Both matrices parse.
 *   2. Both declare the canonical six-tier vocabulary in canonicalTiers.
 *   3. Every row/tool has a canonicalTier from the canonical set.
 *   4. Every LOCAL_READY capability row has at least one proofReference.
 *   5. Required new rows are present in the capability matrix.
 *   6. Required new tools are present in the tool matrix.
 *   7. Dangerous action tools (shell, fs.write/delete, code_execute,
 *      web_search, browse) are never LOCAL_READY or LOCAL_LIMITED.
 *   8. Approval-gated tools (file_inspect, tiny_edit) are LOCAL_LIMITED
 *      and requiresApproval:true.
 *   9. CLOUD_PLANNED tools are not implemented.
 *  10. tiny_edit is implemented and canWriteFiles:true.
 *  11. cross-matrix sanity: inspection/tiny-edit caps map to file_inspect/
 *      tiny_edit tools.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const CANONICAL_TIERS = new Set([
  "LOCAL_READY",
  "LOCAL_LIMITED",
  "LOCAL_PARTIAL",
  "CLOUD_PLANNED",
  "NOT_IMPLEMENTED",
  "BLOCKED",
]);

const REQUIRED_CAPABILITY_ROWS = [
  "planning:planning.local-structured",
  "reliability:reliability.small-model-layer",
  "reliability:reliability.safe-file-inspection",
  "editing:editing.approval-gated-tiny-edit",
  "teacher:teacher.local-q-and-a",
  "honesty:honesty.tool-claim-correction",
  "provenance:provenance.local-footer",
];

const REQUIRED_TOOL_ROWS = [
  "file_inspect",
  "tiny_edit",
  "planning",
  "reliability_layer",
  "teacher_qa",
  "honesty_annotation",
  "provenance_footer",
];

const DANGEROUS_TOOL_IDS = [
  "shell",
  "code_execute",
  "fs.write",
  "fs.delete",
  "fs.move",
  "web_search",
  "browse",
];

const APPROVAL_GATED_TOOL_IDS = ["file_inspect", "tiny_edit"];

const results = [];
function ok(label, detail) {
  results.push({ level: "ok", label, detail });
}
function fail(label, detail) {
  results.push({ level: "fail", label, detail });
}

const capMatrixPath = path.join(
  REPO_ROOT,
  "docs/capability-matrix.public-squidley.json",
);
const toolMatrixPath = path.join(
  REPO_ROOT,
  "docs/tool-matrix.public-squidley.json",
);

if (!existsSync(capMatrixPath)) {
  fail("capability-matrix.present", `${capMatrixPath} missing.`);
}
if (!existsSync(toolMatrixPath)) {
  fail("tool-matrix.present", `${toolMatrixPath} missing.`);
}

let cap = null;
let tool = null;
try {
  cap = JSON.parse(readFileSync(capMatrixPath, "utf8"));
  ok("capability-matrix.parse", "Capability matrix parsed.");
} catch (err) {
  fail("capability-matrix.parse", `Could not parse: ${String(err)}`);
}
try {
  tool = JSON.parse(readFileSync(toolMatrixPath, "utf8"));
  ok("tool-matrix.parse", "Tool matrix parsed.");
} catch (err) {
  fail("tool-matrix.parse", `Could not parse: ${String(err)}`);
}

if (cap && tool) {
  // Check 2 — canonicalTiers vocabulary.
  for (const [name, matrix] of [
    ["capability", cap],
    ["tool", tool],
  ]) {
    const keys = Object.keys(matrix.canonicalTiers ?? {}).sort();
    const expected = [...CANONICAL_TIERS].sort();
    if (JSON.stringify(keys) !== JSON.stringify(expected)) {
      fail(
        `${name}-matrix.canonical-tiers`,
        `Expected ${expected.join(", ")}; got ${keys.join(", ") || "(missing)"}`,
      );
    } else {
      ok(
        `${name}-matrix.canonical-tiers`,
        "Declares canonical six-tier vocabulary.",
      );
    }
  }

  // Check 3 — every row has canonicalTier and it is canonical.
  const capBad = (cap.rows || [])
    .filter((r) => !CANONICAL_TIERS.has(r.canonicalTier))
    .map((r) => `${r.capabilityId}: ${r.canonicalTier ?? "(missing)"}`);
  if (capBad.length === 0) {
    ok(
      "capability-matrix.canonical-tier-on-every-row",
      `All ${cap.rows.length} rows have a canonical tier.`,
    );
  } else {
    fail(
      "capability-matrix.canonical-tier-on-every-row",
      `Bad rows: ${capBad.join("; ")}`,
    );
  }
  const toolBad = (tool.tools || [])
    .filter((t) => !CANONICAL_TIERS.has(t.canonicalTier))
    .map((t) => `${t.toolId}: ${t.canonicalTier ?? "(missing)"}`);
  if (toolBad.length === 0) {
    ok(
      "tool-matrix.canonical-tier-on-every-tool",
      `All ${tool.tools.length} tools have a canonical tier.`,
    );
  } else {
    fail(
      "tool-matrix.canonical-tier-on-every-tool",
      `Bad tools: ${toolBad.join("; ")}`,
    );
  }

  // Check 4 — LOCAL_READY rows have proof refs.
  const missingProof = (cap.rows || [])
    .filter(
      (r) =>
        r.canonicalTier === "LOCAL_READY" &&
        (!Array.isArray(r.proofReferences) || r.proofReferences.length === 0),
    )
    .map((r) => r.capabilityId);
  if (missingProof.length === 0) {
    ok(
      "capability-matrix.proof-refs",
      "Every LOCAL_READY row has at least one proofReference.",
    );
  } else {
    fail(
      "capability-matrix.proof-refs",
      `Missing proofReferences: ${missingProof.join(", ")}`,
    );
  }

  // Check 5 — required capability rows present.
  const capIds = new Set((cap.rows || []).map((r) => r.capabilityId));
  const missingCaps = REQUIRED_CAPABILITY_ROWS.filter((id) => !capIds.has(id));
  if (missingCaps.length === 0) {
    ok(
      "capability-matrix.required-rows",
      `All ${REQUIRED_CAPABILITY_ROWS.length} required rows present.`,
    );
  } else {
    fail(
      "capability-matrix.required-rows",
      `Missing rows: ${missingCaps.join(", ")}`,
    );
  }

  // Check 6 — required tool rows present.
  const toolIds = new Set((tool.tools || []).map((t) => t.toolId));
  const missingTools = REQUIRED_TOOL_ROWS.filter((id) => !toolIds.has(id));
  if (missingTools.length === 0) {
    ok(
      "tool-matrix.required-tools",
      `All ${REQUIRED_TOOL_ROWS.length} required tools present.`,
    );
  } else {
    fail(
      "tool-matrix.required-tools",
      `Missing tools: ${missingTools.join(", ")}`,
    );
  }

  // Check 7 — dangerous tools never LOCAL_READY/LOCAL_LIMITED.
  const dangerousMislabeled = [];
  for (const id of DANGEROUS_TOOL_IDS) {
    const t = (tool.tools || []).find((x) => x.toolId === id);
    if (!t) continue;
    if (t.canonicalTier === "LOCAL_READY" || t.canonicalTier === "LOCAL_LIMITED") {
      dangerousMislabeled.push(`${id}: ${t.canonicalTier}`);
    }
    if (t.publicLocalStatus === "LOCAL_TOOL_READY") {
      dangerousMislabeled.push(`${id}: publicLocalStatus=LOCAL_TOOL_READY`);
    }
  }
  if (dangerousMislabeled.length === 0) {
    ok(
      "tool-matrix.dangerous-tools-locked",
      "No dangerous action tool is LOCAL_READY/LOCAL_LIMITED/LOCAL_TOOL_READY.",
    );
  } else {
    fail(
      "tool-matrix.dangerous-tools-locked",
      dangerousMislabeled.join("; "),
    );
  }

  // Check 8 — approval-gated tools are LOCAL_LIMITED and requiresApproval:true.
  const approvalProblems = [];
  for (const id of APPROVAL_GATED_TOOL_IDS) {
    const t = (tool.tools || []).find((x) => x.toolId === id);
    if (!t) {
      approvalProblems.push(`${id}: missing`);
      continue;
    }
    if (t.canonicalTier !== "LOCAL_LIMITED") {
      approvalProblems.push(`${id}: tier=${t.canonicalTier}, expected LOCAL_LIMITED`);
    }
    if (t.requiresApproval !== true) {
      approvalProblems.push(`${id}: requiresApproval=${t.requiresApproval}, expected true`);
    }
  }
  if (approvalProblems.length === 0) {
    ok(
      "tool-matrix.approval-gated-correctness",
      "file_inspect and tiny_edit are LOCAL_LIMITED + requiresApproval:true.",
    );
  } else {
    fail(
      "tool-matrix.approval-gated-correctness",
      approvalProblems.join("; "),
    );
  }

  // Check 9 — CLOUD_PLANNED tools are not implemented.
  const cloudImplemented = (tool.tools || [])
    .filter((t) => t.canonicalTier === "CLOUD_PLANNED" && t.implemented === true)
    .map((t) => t.toolId);
  if (cloudImplemented.length === 0) {
    ok(
      "tool-matrix.no-cloud-implemented",
      "No CLOUD_PLANNED tool is marked implemented:true.",
    );
  } else {
    fail(
      "tool-matrix.no-cloud-implemented",
      `Implemented cloud tools: ${cloudImplemented.join(", ")}`,
    );
  }

  // Check 10 — tiny_edit canWriteFiles:true AND implemented:true.
  const tinyEdit = (tool.tools || []).find((t) => t.toolId === "tiny_edit");
  if (!tinyEdit) {
    fail("tool-matrix.tiny-edit-implementation", "tiny_edit tool missing.");
  } else if (tinyEdit.implemented !== true || tinyEdit.canWriteFiles !== true) {
    fail(
      "tool-matrix.tiny-edit-implementation",
      `tiny_edit must be implemented:true and canWriteFiles:true; got implemented=${tinyEdit.implemented} canWriteFiles=${tinyEdit.canWriteFiles}`,
    );
  } else {
    ok(
      "tool-matrix.tiny-edit-implementation",
      "tiny_edit is implemented and canWriteFiles:true.",
    );
  }

  // Check 11 — cross-matrix sanity.
  const inspectionCap = (cap.rows || []).find(
    (r) => r.capabilityId === "reliability:reliability.safe-file-inspection",
  );
  const tinyEditCap = (cap.rows || []).find(
    (r) => r.capabilityId === "editing:editing.approval-gated-tiny-edit",
  );
  const fileInspectTool = (tool.tools || []).find((t) => t.toolId === "file_inspect");
  const tinyEditTool = (tool.tools || []).find((t) => t.toolId === "tiny_edit");
  const crossOK =
    inspectionCap &&
    inspectionCap.canonicalTier === "LOCAL_LIMITED" &&
    tinyEditCap &&
    tinyEditCap.canonicalTier === "LOCAL_LIMITED" &&
    fileInspectTool &&
    fileInspectTool.canonicalTier === "LOCAL_LIMITED" &&
    tinyEditTool &&
    tinyEditTool.canonicalTier === "LOCAL_LIMITED";
  if (crossOK) {
    ok(
      "cross-matrix.approval-gated-tiers-aligned",
      "Inspection and tiny-edit are LOCAL_LIMITED in both matrices.",
    );
  } else {
    fail(
      "cross-matrix.approval-gated-tiers-aligned",
      "Capability row and tool row tiers for inspection / tiny-edit disagree.",
    );
  }
}

const failures = results.filter((r) => r.level === "fail");
const summary = {
  schemaVersion: 1,
  tool: "scripts/verify-capabilities.mjs",
  completedAt: new Date().toISOString(),
  checks: results,
  failures: failures.length,
};
console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) {
  console.error(
    `\nFAIL: verify:capabilities reported ${failures.length} failure(s).`,
  );
  process.exit(1);
}
console.log("\nPASS: capability and tool matrices align with canonical taxonomy.");
process.exit(0);
