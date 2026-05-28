/**
 * Approval-gated tiny edit apply engine.
 *
 * Two callers in the same module:
 *   - `proposeTinyEdit()` : Phase A — no token. Validates safety,
 *     hashes everything, builds a proposal with diff preview and an
 *     approval request. NOTHING is written.
 *   - `applyTinyEdit()`   : Phase B — token present. Re-validates
 *     safety, checks the approval, reads the file, backs it up, writes
 *     exactly one replacement, re-reads, runs verification, rolls back
 *     on any failure. Receipts are emitted for every transition.
 *
 * Hard rules:
 *   - Reader is injected as `FileEditor` which has stat / readFile /
 *     writeFile only. No mkdir, no unlink, no rename, no exec.
 *   - The same FileEditor instance is used for read AND write — never
 *     swapped between read and write to prevent a sneaky reader that
 *     returns different content than was hashed.
 *   - File reads happen TWICE: once for the proposal (hash + diff
 *     preview), and once at apply time (re-hash + match-exists check).
 *     The approval is bound to all three hashes (path/original/proposed
 *     + the file-state hash at proposal time).
 *   - cloudUsed: false on every receipt. The file path appears in
 *     metadata; the raw snippet contents do NOT.
 */

import {
  createTabulariumReceipt,
  type TabulariumReceipt,
} from "@/lib/tabularium/receipts";
import { checkInspectPath } from "@/lib/reliability/fileSafety";
import { buildDiffPreview } from "./diff";
import {
  buildEditApprovalToken,
  checkEditApproval,
  TINY_EDIT_APPROVAL_TTL_MS,
} from "./approval";
import { checkEditSafety } from "./safety";
import {
  makeEditApprovalId,
  makeProposalId,
  type TinyEditApprovalRequest,
  type TinyEditCheckId,
  type TinyEditConfidence,
  type TinyEditDiffPreview,
  type TinyEditProposal,
  type TinyEditReceiptAction,
  type TinyEditResult,
  type TinyEditRiskLevel,
} from "./types";
import { buildVerification } from "./verifier";

export interface FileEditor {
  stat(absolutePath: string): Promise<
    { ok: true; size: number } | { ok: false; reason?: string }
  >;
  readFile(absolutePath: string): Promise<string>;
  writeFile(absolutePath: string, contents: string): Promise<void>;
}

export type ContentHasher = (content: string) => Promise<string>;

export interface ProposeTinyEditArgs {
  readonly path: string;
  readonly originalSnippet: string;
  readonly proposedSnippet: string;
  readonly reason: string;
  readonly projectRoot: string;
  readonly inspectedPaths: readonly string[];
  readonly editor: FileEditor;
  readonly hashContent: ContentHasher;
  readonly now?: () => number;
}

export interface ApplyTinyEditArgs {
  readonly path: string;
  readonly originalSnippet: string;
  readonly proposedSnippet: string;
  readonly approval: unknown;
  readonly projectRoot: string;
  readonly inspectedPaths: readonly string[];
  readonly editor: FileEditor;
  readonly hashContent: ContentHasher;
  readonly now?: () => number;
}

function buildReceipt(args: {
  action: TinyEditReceiptAction;
  status: "info" | "succeeded" | "failed" | "interrupted";
  title: string;
  summary: string;
  metadata?: Record<string, string | number | boolean>;
  now: () => number;
}): TabulariumReceipt {
  return createTabulariumReceipt({
    module: "system",
    action: args.action,
    status: args.status,
    title: args.title,
    summary: args.summary,
    metadata: {
      cloud_used: false,
      tiny_edit: true,
      ...(args.metadata ?? {}),
    },
    createdAt: args.now(),
  });
}

function deriveRisk(): TinyEditRiskLevel {
  // Tiny edits are by definition small and targeted; we surface them
  // as `review` so the UI shows the approval card with the cautious
  // colour. We never emit `safe` for edits to avoid lulling users into
  // approving without reading.
  return "review";
}

function deriveConfidence(args: {
  inspectedPaths: readonly string[];
  path: string;
}): TinyEditConfidence {
  if (args.inspectedPaths.includes(args.path)) return "high";
  return "medium";
}

const VERIFICATION_PLAN_GENERIC: readonly TinyEditCheckId[] = [
  "replacement-present",
  "original-removed",
  "file-not-empty",
  "file-length-reasonable",
];

function verificationPlanFor(extension: string): readonly TinyEditCheckId[] {
  if (extension === ".json") {
    return [...VERIFICATION_PLAN_GENERIC, "json-parses"];
  }
  if (
    extension === ".ts" ||
    extension === ".tsx" ||
    extension === ".js" ||
    extension === ".jsx"
  ) {
    return [
      ...VERIFICATION_PLAN_GENERIC,
      "balanced-delimiters",
      "no-unterminated-strings",
    ];
  }
  return VERIFICATION_PLAN_GENERIC;
}

const TINY_EDIT_LIMITATIONS: readonly string[] = [
  "Peh applies one targeted text replacement and nothing else.",
  "Peh does not run shell commands or build steps.",
  "Peh does not edit more than one file per approval.",
  "Peh re-reads the file after writing and rolls back on any verification failure.",
];

function blockedResult(args: {
  path: string;
  reason: string;
  receipts: TabulariumReceipt[];
  now: () => number;
}): TinyEditResult {
  args.receipts.push(
    buildReceipt({
      action: "editing.failed",
      status: "failed",
      title: "Tiny edit blocked",
      summary: args.reason,
      metadata: { path: args.path, phase: "blocked" },
      now: args.now,
    }),
  );
  return {
    ok: false,
    status: "blocked",
    applied: false,
    rolledBack: false,
    path: args.path,
    summary: args.reason,
    receipts: args.receipts,
    cloudUsed: false,
    localOnly: true,
    failureReason: args.reason,
  };
}

/**
 * Phase A: Build a tiny-edit proposal. No write happens.
 */
export async function proposeTinyEdit(
  args: ProposeTinyEditArgs,
): Promise<TinyEditResult> {
  const now = args.now ?? Date.now;
  const receipts: TabulariumReceipt[] = [];

  const path = checkInspectPath(args.path, { projectRoot: args.projectRoot });
  if (!path.ok) {
    return blockedResult({ path: args.path, reason: path.detail, receipts, now });
  }
  if (!args.inspectedPaths.includes(path.relativePath)) {
    return blockedResult({
      path: path.relativePath,
      reason: `Peh will only edit files that were previously approved for inspection. Inspect '${path.relativePath}' first.`,
      receipts,
      now,
    });
  }

  const stat = await args.editor.stat(path.absolutePath);
  if (!stat.ok) {
    return blockedResult({
      path: path.relativePath,
      reason: stat.reason ?? "File not accessible.",
      receipts,
      now,
    });
  }

  let currentContent: string;
  try {
    currentContent = await args.editor.readFile(path.absolutePath);
  } catch (err) {
    return blockedResult({
      path: path.relativePath,
      reason: err instanceof Error ? err.message : "read failed",
      receipts,
      now,
    });
  }

  const safety = checkEditSafety({
    projectRoot: args.projectRoot,
    path: args.path,
    currentFileContent: currentContent,
    originalSnippet: args.originalSnippet,
    proposedSnippet: args.proposedSnippet,
    inspectedPaths: args.inspectedPaths,
  });
  if (!safety.ok) {
    return blockedResult({
      path: path.relativePath,
      reason: safety.detail,
      receipts,
      now,
    });
  }

  // Hashes
  const [originalHash, proposedHash, fileHash] = await Promise.all([
    args.hashContent(args.originalSnippet),
    args.hashContent(args.proposedSnippet),
    args.hashContent(currentContent),
  ]);

  const diffPreview: TinyEditDiffPreview = buildDiffPreview({
    path: path.relativePath,
    fileContent: currentContent,
    originalSnippet: args.originalSnippet,
    proposedSnippet: args.proposedSnippet,
    anchorIndex: safety.anchorIndex,
  });

  const approvalRequest: TinyEditApprovalRequest = {
    action: "tiny_edit",
    path: path.relativePath,
    originalSnippet: args.originalSnippet,
    proposedSnippet: args.proposedSnippet,
    originalHash,
    proposedHash,
    fileHash,
    summary: `Replace ${diffPreview.bytesRemoved} bytes with ${diffPreview.bytesAdded} bytes in '${path.relativePath}'.`,
    reason: args.reason,
    confidence: deriveConfidence({ inspectedPaths: args.inspectedPaths, path: path.relativePath }),
    riskLevel: deriveRisk(),
    expiresInMs: TINY_EDIT_APPROVAL_TTL_MS,
    limitations: TINY_EDIT_LIMITATIONS,
  };

  const proposal: TinyEditProposal = {
    id: makeProposalId(now()),
    path: path.relativePath,
    originalSnippet: args.originalSnippet,
    proposedSnippet: args.proposedSnippet,
    summary: approvalRequest.summary,
    reason: args.reason,
    confidence: approvalRequest.confidence,
    riskLevel: approvalRequest.riskLevel,
    verificationPlan: verificationPlanFor(path.extension),
    rollbackAvailable: true,
    requiresApproval: true,
    approvalRequest,
    diffPreview,
    receipts: [],
    cloudUsed: false,
    localOnly: true,
  };

  receipts.push(
    buildReceipt({
      action: "editing.proposed",
      status: "info",
      title: "Tiny edit proposed",
      summary: approvalRequest.summary,
      metadata: {
        path: path.relativePath,
        bytes_removed: diffPreview.bytesRemoved,
        bytes_added: diffPreview.bytesAdded,
        proposal_id: proposal.id,
      },
      now,
    }),
  );
  receipts.push(
    buildReceipt({
      action: "editing.approval-requested",
      status: "info",
      title: "Tiny edit approval requested",
      summary:
        "Peh wants your approval to apply this tiny edit. Reading is not editing — approval applies to this exact change only.",
      metadata: { path: path.relativePath, proposal_id: proposal.id },
      now,
    }),
  );

  return {
    ok: false,
    status: "approval-required",
    applied: false,
    rolledBack: false,
    path: path.relativePath,
    summary: approvalRequest.summary,
    diffPreview,
    proposal: { ...proposal, receipts },
    receipts,
    cloudUsed: false,
    localOnly: true,
  };
}

/**
 * Phase B: Apply the tiny edit. Requires a valid approval token.
 */
export async function applyTinyEdit(
  args: ApplyTinyEditArgs,
): Promise<TinyEditResult> {
  const now = args.now ?? Date.now;
  const receipts: TabulariumReceipt[] = [];

  const path = checkInspectPath(args.path, { projectRoot: args.projectRoot });
  if (!path.ok) {
    return blockedResult({ path: args.path, reason: path.detail, receipts, now });
  }

  // Read current content
  let beforeContent: string;
  try {
    beforeContent = await args.editor.readFile(path.absolutePath);
  } catch (err) {
    return blockedResult({
      path: path.relativePath,
      reason: err instanceof Error ? err.message : "read failed",
      receipts,
      now,
    });
  }

  const safety = checkEditSafety({
    projectRoot: args.projectRoot,
    path: args.path,
    currentFileContent: beforeContent,
    originalSnippet: args.originalSnippet,
    proposedSnippet: args.proposedSnippet,
    inspectedPaths: args.inspectedPaths,
  });
  if (!safety.ok) {
    return blockedResult({
      path: path.relativePath,
      reason: safety.detail,
      receipts,
      now,
    });
  }

  const [originalHash, proposedHash, fileHash] = await Promise.all([
    args.hashContent(args.originalSnippet),
    args.hashContent(args.proposedSnippet),
    args.hashContent(beforeContent),
  ]);

  const approvalCheck = checkEditApproval(args.approval, {
    requestedPath: path.relativePath,
    requestedOriginalHash: originalHash,
    requestedProposedHash: proposedHash,
    requestedFileHash: fileHash,
    now: now(),
  });
  if (!approvalCheck.ok) {
    receipts.push(
      buildReceipt({
        action: "editing.failed",
        status: "interrupted",
        title: "Tiny edit denied",
        summary: approvalCheck.detail,
        metadata: { path: path.relativePath, reason: approvalCheck.reason },
        now,
      }),
    );
    return {
      ok: false,
      status: "denied",
      applied: false,
      rolledBack: false,
      path: path.relativePath,
      summary: approvalCheck.detail,
      receipts,
      cloudUsed: false,
      localOnly: true,
      failureReason: approvalCheck.detail,
    };
  }
  receipts.push(
    buildReceipt({
      action: "editing.approved",
      status: "info",
      title: "Tiny edit approval valid",
      summary: `Approval ${approvalCheck.approval.approvalId} matches all four hashes.`,
      metadata: { path: path.relativePath, approval_id: approvalCheck.approval.approvalId },
      now,
    }),
  );

  // Apply (one and only one replacement; the safety layer already
  // confirmed exactly-one occurrence).
  const afterContent =
    beforeContent.slice(0, safety.anchorIndex) +
    args.proposedSnippet +
    beforeContent.slice(safety.anchorIndex + args.originalSnippet.length);

  try {
    await args.editor.writeFile(path.absolutePath, afterContent);
  } catch (err) {
    return blockedResult({
      path: path.relativePath,
      reason: err instanceof Error ? err.message : "write failed",
      receipts,
      now,
    });
  }
  receipts.push(
    buildReceipt({
      action: "editing.applied",
      status: "info",
      title: "Tiny edit applied",
      summary: `Wrote ${args.proposedSnippet.length} bytes in place of ${args.originalSnippet.length} bytes.`,
      metadata: {
        path: path.relativePath,
        bytes_removed: args.originalSnippet.length,
        bytes_added: args.proposedSnippet.length,
      },
      now,
    }),
  );

  // Re-read + verify
  let reread: string;
  try {
    reread = await args.editor.readFile(path.absolutePath);
  } catch (err) {
    // Try to roll back even though the re-read failed.
    await rollback(args.editor, path.absolutePath, beforeContent, receipts, now);
    return {
      ok: false,
      status: "applied-rolled-back",
      applied: true,
      rolledBack: true,
      path: path.relativePath,
      summary: `Re-read after write failed (${err instanceof Error ? err.message : "unknown"}). Rolled back.`,
      receipts,
      cloudUsed: false,
      localOnly: true,
      failureReason: "re-read failed after write",
    };
  }

  const verification = buildVerification({
    path: path.relativePath,
    originalBefore: args.originalSnippet,
    proposedSnippet: args.proposedSnippet,
    contentAfter: reread,
    contentBefore: beforeContent,
    extension: path.extension,
  });

  if (verification.verificationStatus === "failed") {
    receipts.push(
      buildReceipt({
        action: "editing.rollback-started",
        status: "interrupted",
        title: "Verification failed — rolling back",
        summary: verification.failureReason ?? "Verification failed.",
        metadata: { path: path.relativePath },
        now,
      }),
    );
    await rollback(args.editor, path.absolutePath, beforeContent, receipts, now);
    return {
      ok: false,
      status: "applied-rolled-back",
      applied: true,
      rolledBack: true,
      path: path.relativePath,
      summary: `Verification failed; rolled back. ${verification.failureReason ?? ""}`.trim(),
      verification,
      receipts,
      cloudUsed: false,
      localOnly: true,
      failureReason: verification.failureReason,
    };
  }

  receipts.push(
    buildReceipt({
      action: "editing.verified",
      status: "succeeded",
      title: "Tiny edit verified",
      summary: "All deterministic checks passed.",
      metadata: {
        path: path.relativePath,
        checks_passed: verification.checks.length,
      },
      now,
    }),
  );

  return {
    ok: true,
    status: "applied-verified",
    applied: true,
    rolledBack: false,
    path: path.relativePath,
    summary: `Tiny edit applied and verified in '${path.relativePath}'.`,
    verification,
    receipts,
    cloudUsed: false,
    localOnly: true,
  };
}

async function rollback(
  editor: FileEditor,
  absolutePath: string,
  backup: string,
  receipts: TabulariumReceipt[],
  now: () => number,
): Promise<void> {
  try {
    await editor.writeFile(absolutePath, backup);
    receipts.push(
      buildReceipt({
        action: "editing.rollback-completed",
        status: "interrupted",
        title: "Rollback completed",
        summary: "The original file contents were restored from the in-memory backup.",
        metadata: { path: absolutePath, restored_bytes: backup.length },
        now,
      }),
    );
  } catch (err) {
    receipts.push(
      buildReceipt({
        action: "editing.failed",
        status: "failed",
        title: "Rollback failed",
        summary:
          "Peh could not restore the original contents. The file may be in a partially-edited state. " +
          (err instanceof Error ? err.message : "unknown error"),
        metadata: { path: absolutePath },
        now,
      }),
    );
  }
}

/**
 * Default node-fs hasher using node:crypto.
 */
export const defaultNodeHasher: ContentHasher = async (content) => {
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
};

/** Default node-fs editor. Has only stat / readFile / writeFile. */
export const defaultNodeEditor: FileEditor = {
  async stat(absolutePath) {
    const fs = await import("node:fs/promises");
    try {
      const s = await fs.stat(absolutePath);
      if (!s.isFile()) return { ok: false, reason: "Not a regular file." };
      return { ok: true, size: s.size };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "stat failed",
      };
    }
  },
  async readFile(absolutePath) {
    const fs = await import("node:fs/promises");
    return await fs.readFile(absolutePath, { encoding: "utf-8" });
  },
  async writeFile(absolutePath, contents) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(absolutePath, contents, { encoding: "utf-8" });
  },
};

/** Used by tests + the chat adapter to build a fresh approval client-side. */
export { buildEditApprovalToken, makeEditApprovalId };
