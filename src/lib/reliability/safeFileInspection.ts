/**
 * Approval-gated, read-only file inspection.
 *
 * Pipeline (each step builds a receipt before continuing):
 *   1. Path safety  — checkInspectPath() against the project root.
 *   2. Approval     — checkFileInspectionApproval() vs the requested path.
 *   3. Stat         — confirm the file is small enough; refuse otherwise.
 *   4. Read         — via the injected `FileInspectionReader`.
 *   5. Redact       — redactSecrets() before any context packing.
 *   6. Pack         — packContext() with a strict char budget.
 *   7. Receipts     — every transition gets a Tabularium receipt with
 *                     cloudUsed=false. Raw secret values never enter a
 *                     receipt — only counts and categories.
 *
 * Hard constraints:
 *   - No filesystem traversal: only the exact approved path is opened.
 *   - No write API is invoked. The reader interface has no write method.
 *   - cloudUsed is `false` on every emitted receipt.
 */

import {
  createTabulariumReceipt,
  type TabulariumReceipt,
} from "@/lib/tabularium/receipts";
import { packContext, type PackedContext } from "./contextPacker";
import {
  FILE_INSPECTION_SAFETY_RULES,
  MAX_INSPECT_FILE_BYTES,
  checkInspectPath,
  type PathSafetyResult,
} from "./fileSafety";
import {
  checkFileInspectionApproval,
  type ApprovalCheckResult,
  type FileInspectionApproval,
} from "./fileApproval";
import {
  SECRET_REDACTION_DISCLAIMER,
  redactSecrets,
  type RedactionApplied,
} from "./secretRedaction";

export type FileInspectionReceiptAction =
  | "reliability.file-inspection-requested"
  | "reliability.file-inspection-approved"
  | "reliability.file-inspection-denied"
  | "reliability.file-inspection-blocked"
  | "reliability.file-inspection-redacted"
  | "reliability.file-inspection-packed"
  | "reliability.file-inspection-completed";

export interface FileInspectionReader {
  /**
   * Stat the file at an ABSOLUTE path. Return `{ ok: true, size }` if
   * the path exists and is a regular file. Return `{ ok: false }` (with
   * an optional reason string) otherwise.
   */
  stat(absolutePath: string): Promise<
    { ok: true; size: number } | { ok: false; reason?: string }
  >;
  /** Read the file as UTF-8. Should throw if the path does not exist. */
  readFile(absolutePath: string): Promise<string>;
}

export type InspectionOutcomeStatus =
  | "approval-required"
  | "denied"
  | "blocked"
  | "completed";

export interface InspectionApprovalRequest {
  readonly action: "inspect_one_file_safely";
  readonly path: string;
  readonly reason: string;
  readonly riskLevel: "low" | "medium" | "high";
  readonly willRead: string;
  readonly willNotRead: readonly string[];
  readonly secretRedaction: {
    readonly applied: true;
    readonly disclaimer: string;
  };
  readonly safetyRules: readonly string[];
  readonly expiresInMs: number;
}

export interface InspectionOutcome {
  readonly ok: boolean;
  readonly status: InspectionOutcomeStatus;
  readonly path: string;
  /** Beginner-readable summary of what happened. */
  readonly summary: string;
  /** Approval request body — only present when status="approval-required". */
  readonly approvalRequest?: InspectionApprovalRequest;
  /** Why the request was blocked — only present when status="blocked". */
  readonly blockedReason?: string;
  /** Packed context — only present when status="completed". */
  readonly packedContext?: PackedContext;
  /** Categories + counts of redactions applied. */
  readonly redactionsApplied: readonly RedactionApplied[];
  /** Receipts emitted along the way. */
  readonly receipts: readonly TabulariumReceipt[];
  /** Always false. */
  readonly cloudUsed: false;
  readonly localOnly: true;
}

export interface InspectFileOptions {
  readonly path: string;
  readonly reason: string;
  readonly projectRoot: string;
  readonly approval?: unknown;
  readonly reader: FileInspectionReader;
  readonly packBudget?: number;
  readonly now?: () => number;
}

function buildReceipt(args: {
  action: FileInspectionReceiptAction;
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
    metadata: { cloud_used: false, read_only: true, ...(args.metadata ?? {}) },
    createdAt: args.now(),
  });
}

function blockedOutcome(args: {
  path: string;
  reason: string;
  pathSafety?: PathSafetyResult;
  receipts: TabulariumReceipt[];
  now: () => number;
}): InspectionOutcome {
  args.receipts.push(
    buildReceipt({
      action: "reliability.file-inspection-blocked",
      status: "failed",
      title: "File inspection blocked",
      summary: args.reason,
      metadata: {
        path: args.path,
        block_reason:
          args.pathSafety && !args.pathSafety.ok ? args.pathSafety.reason : "unknown",
      },
      now: args.now,
    }),
  );
  return {
    ok: false,
    status: "blocked",
    path: args.path,
    summary: args.reason,
    blockedReason: args.reason,
    redactionsApplied: [],
    receipts: args.receipts,
    cloudUsed: false,
    localOnly: true,
  };
}

function approvalRequiredOutcome(args: {
  path: string;
  reason: string;
  receipts: TabulariumReceipt[];
  now: () => number;
}): InspectionOutcome {
  const request: InspectionApprovalRequest = {
    action: "inspect_one_file_safely",
    path: args.path,
    reason: args.reason,
    riskLevel: "low",
    willRead: `One file at \`${args.path}\` (read-only).`,
    willNotRead: [
      "No other files. No directory listings.",
      "No .env, credentials, keys, certificates, or ssh files.",
      "Nothing inside node_modules, .git, dist, build, .next, coverage.",
      "Nothing larger than the size cap (256 KB).",
    ],
    secretRedaction: { applied: true, disclaimer: SECRET_REDACTION_DISCLAIMER },
    safetyRules: FILE_INSPECTION_SAFETY_RULES,
    expiresInMs: 10 * 60 * 1000,
  };
  args.receipts.push(
    buildReceipt({
      action: "reliability.file-inspection-requested",
      status: "info",
      title: "File inspection approval requested",
      summary: `Squidley wants approval to read '${args.path}' once. Reading is not the same as editing.`,
      metadata: { path: args.path },
      now: args.now,
    }),
  );
  return {
    ok: false,
    status: "approval-required",
    path: args.path,
    summary:
      "Squidley wants to read this file so it can answer your question. Reading is not the same as editing. Approve or decline below.",
    approvalRequest: request,
    redactionsApplied: [],
    receipts: args.receipts,
    cloudUsed: false,
    localOnly: true,
  };
}

function deniedOutcome(args: {
  path: string;
  detail: string;
  receipts: TabulariumReceipt[];
  now: () => number;
}): InspectionOutcome {
  args.receipts.push(
    buildReceipt({
      action: "reliability.file-inspection-denied",
      status: "interrupted",
      title: "File inspection denied",
      summary: `Approval failed validation: ${args.detail}`,
      metadata: { path: args.path },
      now: args.now,
    }),
  );
  return {
    ok: false,
    status: "denied",
    path: args.path,
    summary: `Squidley needs a fresh approval for '${args.path}'. ${args.detail}`,
    redactionsApplied: [],
    receipts: args.receipts,
    cloudUsed: false,
    localOnly: true,
  };
}

/**
 * Run one approval-gated, read-only file inspection.
 */
export async function safeFileInspect(
  opts: InspectFileOptions,
): Promise<InspectionOutcome> {
  const now = opts.now ?? Date.now;
  const receipts: TabulariumReceipt[] = [];

  // 1. Path safety
  const safety = checkInspectPath(opts.path, { projectRoot: opts.projectRoot });
  if (!safety.ok) {
    return blockedOutcome({
      path: opts.path,
      reason: safety.detail,
      pathSafety: safety,
      receipts,
      now,
    });
  }

  // 2. Approval
  if (opts.approval === undefined || opts.approval === null) {
    return approvalRequiredOutcome({
      path: safety.relativePath,
      reason: opts.reason,
      receipts,
      now,
    });
  }
  const approvalCheck: ApprovalCheckResult = checkFileInspectionApproval(
    opts.approval,
    { requestedPath: safety.relativePath, now: now() },
  );
  if (!approvalCheck.ok) {
    return deniedOutcome({
      path: safety.relativePath,
      detail: approvalCheck.detail,
      receipts,
      now,
    });
  }
  const approval: FileInspectionApproval = approvalCheck.approval;
  receipts.push(
    buildReceipt({
      action: "reliability.file-inspection-approved",
      status: "info",
      title: "File inspection approval valid",
      summary: `Approval ${approval.approvalId} matches path '${safety.relativePath}'.`,
      metadata: { path: safety.relativePath, approval_id: approval.approvalId },
      now,
    }),
  );

  // 3. Stat + size enforcement
  const stat = await opts.reader.stat(safety.absolutePath);
  if (!stat.ok) {
    return blockedOutcome({
      path: safety.relativePath,
      reason: stat.reason ?? "File could not be opened.",
      receipts,
      now,
    });
  }
  if (stat.size > MAX_INSPECT_FILE_BYTES) {
    return blockedOutcome({
      path: safety.relativePath,
      reason: `File is ${stat.size} bytes; limit is ${MAX_INSPECT_FILE_BYTES}. Squidley does not silently truncate at this stage.`,
      receipts,
      now,
    });
  }

  // 4. Read
  let raw: string;
  try {
    raw = await opts.reader.readFile(safety.absolutePath);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Unknown read error";
    return blockedOutcome({
      path: safety.relativePath,
      reason: detail,
      receipts,
      now,
    });
  }

  // 5. Redact before packing
  const redaction = redactSecrets(raw);
  receipts.push(
    buildReceipt({
      action: "reliability.file-inspection-redacted",
      status: "info",
      title: "File inspection redacted",
      summary: redaction.anyApplied
        ? `Redacted ${redaction.applied.length} secret category(ies) before packing.`
        : "No obvious secrets detected. Custom secret shapes may still exist.",
      metadata: {
        path: safety.relativePath,
        categories_redacted: redaction.applied.map((a) => a.category).join(",") || "none",
        total_redactions: redaction.applied.reduce((acc, a) => acc + a.count, 0),
      },
      now,
    }),
  );

  // 6. Pack
  const packed = packContext(
    [
      {
        id: safety.relativePath,
        kind: "snippet",
        label: safety.relativePath,
        body: redaction.content,
      },
    ],
    { maxChars: opts.packBudget ?? 4000 },
  );
  receipts.push(
    buildReceipt({
      action: "reliability.file-inspection-packed",
      status: "info",
      title: "File inspection packed",
      summary: packed.safeForLocalModel
        ? `Packed ${packed.estimatedSize} chars (safe for a small local model).`
        : `Packed ${packed.estimatedSize} chars (above the small-model safe threshold; consider asking about one section).`,
      metadata: {
        path: safety.relativePath,
        estimated_size: packed.estimatedSize,
        truncated_count: packed.truncationNotes.length,
        omitted_count: packed.omittedItems.length,
      },
      now,
    }),
  );

  // 7. Completed
  receipts.push(
    buildReceipt({
      action: "reliability.file-inspection-completed",
      status: "succeeded",
      title: "File inspection completed",
      summary: `Read-only inspection of '${safety.relativePath}' done.`,
      metadata: {
        path: safety.relativePath,
        bytes_read: stat.size,
        redactions: redaction.applied.reduce((acc, a) => acc + a.count, 0),
      },
      now,
    }),
  );

  return {
    ok: true,
    status: "completed",
    path: safety.relativePath,
    summary: redaction.anyApplied
      ? `Squidley read '${safety.relativePath}' (read-only) and redacted obvious secrets before reasoning about it.`
      : `Squidley read '${safety.relativePath}' (read-only). No obvious secrets were detected.`,
    packedContext: packed,
    redactionsApplied: redaction.applied,
    receipts,
    cloudUsed: false,
    localOnly: true,
  };
}

/**
 * Resolve the configured project root. Defaults to process.cwd(). The
 * route layer passes this in once per request so this module stays
 * environment-free.
 */
export function resolveInspectionRoot(env: Record<string, string | undefined>): string {
  const fromEnv = env.SQUIDLEY_INSPECTION_ROOT?.trim();
  const cwd = typeof process !== "undefined" ? process.cwd() : "/";
  return fromEnv && fromEnv.length > 0 ? fromEnv : cwd;
}
