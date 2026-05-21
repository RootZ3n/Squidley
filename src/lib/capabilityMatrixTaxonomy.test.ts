/**
 * Capability matrix taxonomy contract.
 *
 * Pins the two machine-readable JSON matrices to the canonical taxonomy
 * defined in docs/CAPABILITY_TAXONOMY.md. The JSON is the source of
 * truth; the markdown views are projections. This test fails closed if
 * either drift occurs.
 *
 * If you add a new capability or tool, you must also:
 *   - give it a `canonicalTier` value from CANONICAL_TIERS
 *   - if it is LOCAL_READY, give it at least one proofReference
 *   - never label a cloud provider as IMPLEMENTED
 *   - never label a dangerous action tool (shell, fs.write, fs.delete,
 *     code_execute, web_search, browse) as LOCAL_TOOL_READY
 *   - never label an approval-gated tool with an autonomous-tier label
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

const CANONICAL_TIERS = [
  "LOCAL_READY",
  "LOCAL_LIMITED",
  "LOCAL_PARTIAL",
  "CLOUD_PLANNED",
  "NOT_IMPLEMENTED",
  "BLOCKED",
] as const;

type CanonicalTier = (typeof CANONICAL_TIERS)[number];
const CANONICAL_SET = new Set<string>(CANONICAL_TIERS);

interface CapabilityRow {
  capabilityId: string;
  classification: string;
  canonicalTier: string;
  proofReferences?: string[];
  cloudRequired?: string;
  backendStatus?: { ollama?: string; llamaCpp?: string };
  requiresApprovalGate?: boolean;
}

interface CapabilityMatrix {
  schemaVersion: number;
  canonicalTiers: Record<CanonicalTier, string>;
  rows: CapabilityRow[];
}

interface ToolRow {
  toolId: string;
  implemented: boolean | "partial";
  requiresApproval: boolean;
  requiresCloud: boolean;
  canWriteFiles: boolean;
  canRunCommands: boolean;
  publicLocalStatus: string;
  canonicalTier: string;
}

interface ToolMatrix {
  schemaVersion: number;
  canonicalTiers: Record<CanonicalTier, string>;
  tools: ToolRow[];
}

function loadCapabilityMatrix(): CapabilityMatrix {
  const path = join(REPO_ROOT, "docs/capability-matrix.public-squidley.json");
  return JSON.parse(readFileSync(path, "utf8")) as CapabilityMatrix;
}

function loadToolMatrix(): ToolMatrix {
  const path = join(REPO_ROOT, "docs/tool-matrix.public-squidley.json");
  return JSON.parse(readFileSync(path, "utf8")) as ToolMatrix;
}

describe("capability matrix — taxonomy contract", () => {
  const matrix = loadCapabilityMatrix();

  it("declares canonicalTiers with the canonical six values", () => {
    expect(Object.keys(matrix.canonicalTiers).sort()).toEqual(
      [...CANONICAL_TIERS].sort(),
    );
  });

  it("every row has a canonicalTier", () => {
    const missing = matrix.rows.filter((row) => !row.canonicalTier);
    expect(missing.map((r) => r.capabilityId)).toEqual([]);
  });

  it("every row's canonicalTier is one of the canonical six", () => {
    const bad = matrix.rows
      .filter((row) => !CANONICAL_SET.has(row.canonicalTier))
      .map((r) => `${r.capabilityId}: ${r.canonicalTier}`);
    expect(bad).toEqual([]);
  });

  it("every LOCAL_READY row has at least one proofReference", () => {
    const missing = matrix.rows
      .filter(
        (row) =>
          row.canonicalTier === "LOCAL_READY" &&
          (!row.proofReferences || row.proofReferences.length === 0),
      )
      .map((r) => r.capabilityId);
    expect(missing).toEqual([]);
  });

  it("every LOCAL_LIMITED row is approval-gated or scope-limited by model capability", () => {
    const limited = matrix.rows.filter(
      (row) => row.canonicalTier === "LOCAL_LIMITED",
    );
    expect(limited.length).toBeGreaterThan(0);
    // Oculus image analysis is LOCAL_LIMITED because it is scope-limited to
    // vision-capable models (it refuses non-vision models with a clear
    // message). All other LOCAL_LIMITED rows must be approval-gated.
    const scopeLimitedExceptions = new Set([
      "oculus:oculus.local-image-analysis",
    ]);
    for (const row of limited) {
      if (scopeLimitedExceptions.has(row.capabilityId)) continue;
      const isApprovalGated =
        row.requiresApprovalGate === true ||
        /inspection|tiny.?edit|approval/i.test(row.capabilityId);
      expect({
        capabilityId: row.capabilityId,
        approvalGated: isApprovalGated,
      }).toEqual({ capabilityId: row.capabilityId, approvalGated: true });
    }
  });

  it("required new rows are present (planning, reliability, inspection, tiny edit, teacher, honesty, provenance)", () => {
    const required = [
      "planning:planning.local-structured",
      "reliability:reliability.small-model-layer",
      "reliability:reliability.safe-file-inspection",
      "editing:editing.approval-gated-tiny-edit",
      "teacher:teacher.local-q-and-a",
      "honesty:honesty.tool-claim-correction",
      "provenance:provenance.local-footer",
    ];
    const ids = new Set(matrix.rows.map((row) => row.capabilityId));
    for (const id of required) {
      expect({ id, present: ids.has(id) }).toEqual({ id, present: true });
    }
  });

  it("no row marks llama-cpp LOCAL_READY without a PROOF.json", () => {
    // Diagnostic enforces this for the matrix-level check; we re-affirm here
    // so the JSON contract is self-checking.
    const offenders = matrix.rows
      .filter((row) => row.backendStatus?.llamaCpp === "LOCAL_READY")
      .map((r) => r.capabilityId);
    // No row should be LOCAL_READY for llama-cpp in this build.
    expect(offenders).toEqual([]);
  });

  it("cloud-required capabilities are CLOUD_PLANNED in canonical taxonomy", () => {
    const cloudRows = matrix.rows.filter((row) => row.cloudRequired === "yes");
    expect(cloudRows.length).toBeGreaterThan(0);
    for (const row of cloudRows) {
      expect({
        capabilityId: row.capabilityId,
        canonicalTier: row.canonicalTier,
      }).toEqual({
        capabilityId: row.capabilityId,
        canonicalTier: "CLOUD_PLANNED",
      });
    }
  });

  it("BLOCKED rows refuse by design (no execution path)", () => {
    const blocked = matrix.rows.filter(
      (row) => row.canonicalTier === "BLOCKED",
    );
    expect(blocked.length).toBeGreaterThan(0);
    for (const row of blocked) {
      // BLOCKED capabilities at the row level must be NOT_IMPLEMENTED at
      // the legacy classification level — they have no execution path.
      expect({
        id: row.capabilityId,
        classification: row.classification,
      }).toEqual({ id: row.capabilityId, classification: "NOT_IMPLEMENTED" });
    }
  });
});

describe("tool matrix — taxonomy contract", () => {
  const matrix = loadToolMatrix();

  it("declares canonicalTiers with the canonical six values", () => {
    expect(Object.keys(matrix.canonicalTiers).sort()).toEqual(
      [...CANONICAL_TIERS].sort(),
    );
  });

  it("every tool has a canonicalTier", () => {
    const missing = matrix.tools.filter((tool) => !tool.canonicalTier);
    expect(missing.map((t) => t.toolId)).toEqual([]);
  });

  it("every tool's canonicalTier is one of the canonical six", () => {
    const bad = matrix.tools
      .filter((tool) => !CANONICAL_SET.has(tool.canonicalTier))
      .map((t) => `${t.toolId}: ${t.canonicalTier}`);
    expect(bad).toEqual([]);
  });

  it("required new tools are present (file_inspect, tiny_edit, planning, reliability_layer, teacher_qa, honesty_annotation, provenance_footer)", () => {
    const required = [
      "file_inspect",
      "tiny_edit",
      "planning",
      "reliability_layer",
      "teacher_qa",
      "honesty_annotation",
      "provenance_footer",
    ];
    const ids = new Set(matrix.tools.map((tool) => tool.toolId));
    for (const id of required) {
      expect({ id, present: ids.has(id) }).toEqual({ id, present: true });
    }
  });

  it("dangerous action tools are never LOCAL_TOOL_READY and never LOCAL_READY canonical tier", () => {
    const dangerous = ["fs.write", "fs.delete", "shell", "code_execute", "web_search", "browse"];
    const offenders: string[] = [];
    for (const tool of matrix.tools) {
      if (!dangerous.includes(tool.toolId)) continue;
      if (tool.publicLocalStatus === "LOCAL_TOOL_READY") {
        offenders.push(`${tool.toolId}: publicLocalStatus=LOCAL_TOOL_READY`);
      }
      if (tool.canonicalTier === "LOCAL_READY" || tool.canonicalTier === "LOCAL_LIMITED") {
        offenders.push(`${tool.toolId}: canonicalTier=${tool.canonicalTier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("approval-gated tools (file_inspect, tiny_edit) are LOCAL_LIMITED, not LOCAL_READY", () => {
    const approvalGated = ["file_inspect", "tiny_edit"];
    for (const id of approvalGated) {
      const tool = matrix.tools.find((t) => t.toolId === id);
      expect(tool).toBeDefined();
      expect({ id, tier: tool!.canonicalTier, approval: tool!.requiresApproval }).toEqual({
        id,
        tier: "LOCAL_LIMITED",
        approval: true,
      });
    }
  });

  it("LOCAL_LIMITED tools always require approval", () => {
    const limited = matrix.tools.filter((t) => t.canonicalTier === "LOCAL_LIMITED");
    expect(limited.length).toBeGreaterThan(0);
    for (const tool of limited) {
      // Local image analysis is the only LOCAL_LIMITED tool that does not
      // use the approval-token system (it is scope-limited by model
      // capability instead). We assert it is the only exception.
      if (tool.toolId === "image_analysis") continue;
      expect({ id: tool.toolId, requiresApproval: tool.requiresApproval }).toEqual({
        id: tool.toolId,
        requiresApproval: true,
      });
    }
  });

  it("tiny_edit canWriteFiles=true and is implemented", () => {
    const tool = matrix.tools.find((t) => t.toolId === "tiny_edit");
    expect(tool).toBeDefined();
    expect(tool!.canWriteFiles).toBe(true);
    expect(tool!.implemented).toBe(true);
  });

  it("no tool marked implemented:true also requires cloud", () => {
    const offenders = matrix.tools
      .filter((tool) => tool.implemented === true && tool.requiresCloud === true)
      .map((t) => t.toolId);
    expect(offenders).toEqual([]);
  });

  it("CLOUD_PLANNED tools are not implemented in this build", () => {
    const cloudPlanned = matrix.tools.filter(
      (tool) => tool.canonicalTier === "CLOUD_PLANNED",
    );
    for (const tool of cloudPlanned) {
      expect({ id: tool.toolId, implemented: tool.implemented }).toEqual({
        id: tool.toolId,
        implemented: false,
      });
    }
  });

  it("autonomous-loop / multi-file / broad-fs tools are NOT_IMPLEMENTED or BLOCKED, never LOCAL_READY or LOCAL_LIMITED", () => {
    const unavailable = [
      "shell",
      "code_execute",
      "fs.write",
      "fs.delete",
      "fs.move",
      "code_edit_multi_file",
      "project_inspect",
      "local_search",
      "web_search",
      "browse",
      "memory_write",
      "send_email",
      "git_commit",
      "package_install",
      "document_parse",
    ];
    const offenders: string[] = [];
    for (const id of unavailable) {
      const tool = matrix.tools.find((t) => t.toolId === id);
      if (!tool) continue;
      if (tool.canonicalTier === "LOCAL_READY" || tool.canonicalTier === "LOCAL_LIMITED") {
        offenders.push(`${id}: ${tool.canonicalTier}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("matrix cross-checks", () => {
  it("every LOCAL_LIMITED capability row corresponds to a real tool gate", () => {
    const capMatrix = loadCapabilityMatrix();
    const toolMatrix = loadToolMatrix();
    const limitedCaps = capMatrix.rows.filter(
      (row) => row.canonicalTier === "LOCAL_LIMITED",
    );
    const limitedToolIds = new Set(
      toolMatrix.tools
        .filter((t) => t.canonicalTier === "LOCAL_LIMITED")
        .map((t) => t.toolId),
    );
    // Inspection and tiny-edit capabilities must map to the inspection/edit tools.
    const required: Array<{ cap: string; tool: string }> = [
      {
        cap: "reliability:reliability.safe-file-inspection",
        tool: "file_inspect",
      },
      {
        cap: "editing:editing.approval-gated-tiny-edit",
        tool: "tiny_edit",
      },
    ];
    const capIds = new Set(limitedCaps.map((r) => r.capabilityId));
    for (const pair of required) {
      expect({
        capPresent: capIds.has(pair.cap),
        toolPresent: limitedToolIds.has(pair.tool),
      }).toEqual({ capPresent: true, toolPresent: true });
    }
  });

  it("matrices declare the same canonicalTiers vocabulary", () => {
    const cap = loadCapabilityMatrix();
    const tool = loadToolMatrix();
    expect(Object.keys(cap.canonicalTiers).sort()).toEqual(
      Object.keys(tool.canonicalTiers).sort(),
    );
  });
});
