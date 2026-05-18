/**
 * Approval tokens for the tiny-edit workflow.
 *
 * Distinct from FileInspectionApproval — edits are more sensitive, so:
 *   - shorter TTL (5 minutes vs 10),
 *   - approval is bound to FOUR hashes, not one path:
 *       1. path             (what file)
 *       2. originalHash     (which exact snippet the user approved)
 *       3. proposedHash     (which exact replacement)
 *       4. fileHash         (which exact file state at proposal time)
 *     A change to any one of them invalidates the approval. This
 *     gives strong replay-resistance: a token cannot be reused after
 *     the file has changed, even by one byte.
 *
 * Hashing is sha256(utf-8 bytes). The hash function is injected so
 * the same code runs in tests without `node:crypto`.
 */

export const TINY_EDIT_APPROVAL_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const TINY_EDIT_APPROVAL_ACTION = "tiny_edit" as const;

export interface TinyEditApprovalToken {
  readonly action: typeof TINY_EDIT_APPROVAL_ACTION;
  readonly path: string;
  readonly originalHash: string;
  readonly proposedHash: string;
  readonly fileHash: string;
  readonly approvedAt: number;
  readonly approvalId: string;
}

export type EditApprovalCheckReason =
  | "no-approval"
  | "malformed"
  | "wrong-action"
  | "path-mismatch"
  | "original-hash-mismatch"
  | "proposed-hash-mismatch"
  | "file-hash-mismatch"
  | "expired";

export interface EditApprovalOk {
  readonly ok: true;
  readonly approval: TinyEditApprovalToken;
}

export interface EditApprovalError {
  readonly ok: false;
  readonly reason: EditApprovalCheckReason;
  readonly detail: string;
}

export type EditApprovalCheckResult = EditApprovalOk | EditApprovalError;

export interface CheckEditApprovalOptions {
  readonly requestedPath: string;
  readonly requestedOriginalHash: string;
  readonly requestedProposedHash: string;
  readonly requestedFileHash: string;
  readonly now?: number;
  readonly ttlMs?: number;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(reason: EditApprovalCheckReason, detail: string): EditApprovalError {
  return { ok: false, reason, detail };
}

export function checkEditApproval(
  raw: unknown,
  options: CheckEditApprovalOptions,
): EditApprovalCheckResult {
  if (raw === undefined || raw === null) {
    return fail("no-approval", "No edit approval token was supplied.");
  }
  if (!isObject(raw)) {
    return fail("malformed", "Edit approval must be an object.");
  }
  const action = raw.action;
  if (action !== TINY_EDIT_APPROVAL_ACTION) {
    return fail("wrong-action", `Approval is for a different action: ${String(action)}.`);
  }
  const {
    path,
    originalHash,
    proposedHash,
    fileHash,
    approvedAt,
    approvalId,
  } = raw;
  if (
    typeof path !== "string" ||
    path.trim().length === 0 ||
    typeof originalHash !== "string" ||
    typeof proposedHash !== "string" ||
    typeof fileHash !== "string" ||
    typeof approvedAt !== "number" ||
    !Number.isFinite(approvedAt) ||
    typeof approvalId !== "string"
  ) {
    return fail("malformed", "Edit approval is missing required fields.");
  }
  const now = options.now ?? Date.now();
  const ttl = options.ttlMs ?? TINY_EDIT_APPROVAL_TTL_MS;
  if (now - approvedAt > ttl || approvedAt > now + 60_000) {
    return fail(
      "expired",
      now - approvedAt > ttl
        ? `Edit approval expired ${Math.round((now - approvedAt - ttl) / 1000)}s ago.`
        : "Edit approval timestamp is in the future.",
    );
  }
  if (path.trim() !== options.requestedPath.trim()) {
    return fail("path-mismatch", `Approval is for '${path}', not '${options.requestedPath}'.`);
  }
  if (originalHash !== options.requestedOriginalHash) {
    return fail(
      "original-hash-mismatch",
      "The original snippet does not match what the user approved.",
    );
  }
  if (proposedHash !== options.requestedProposedHash) {
    return fail(
      "proposed-hash-mismatch",
      "The proposed snippet does not match what the user approved.",
    );
  }
  if (fileHash !== options.requestedFileHash) {
    return fail(
      "file-hash-mismatch",
      "The file changed since the user approved this edit. Re-inspect and re-propose.",
    );
  }
  return {
    ok: true,
    approval: {
      action: TINY_EDIT_APPROVAL_ACTION,
      path: path.trim(),
      originalHash,
      proposedHash,
      fileHash,
      approvedAt,
      approvalId,
    },
  };
}

export function buildEditApprovalToken(args: {
  path: string;
  originalHash: string;
  proposedHash: string;
  fileHash: string;
  now?: number;
  approvalId?: string;
}): TinyEditApprovalToken {
  const approvedAt = args.now ?? Date.now();
  const approvalId =
    args.approvalId ??
    `edit-appr-${approvedAt}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    action: TINY_EDIT_APPROVAL_ACTION,
    path: args.path,
    originalHash: args.originalHash,
    proposedHash: args.proposedHash,
    fileHash: args.fileHash,
    approvedAt,
    approvalId,
  };
}
