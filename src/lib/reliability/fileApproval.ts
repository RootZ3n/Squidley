/**
 * Approval tokens for read-only file inspection.
 *
 * Approval shape:
 *   - action: always "inspect_one_file_safely" in this build.
 *   - path:   the exact path the approval is bound to. Inspection MUST
 *             reject any request whose target path differs.
 *   - approvedAt: epoch ms. Approvals expire after FILE_APPROVAL_TTL_MS.
 *   - approvalId: a short opaque string for audit receipts.
 *
 * Stateless: the server does NOT store approvals between requests. The
 * client (Colloquium UI) creates the approval after the user clicks
 * "Approve" and includes it in the chat request body. This is acceptable
 * for a single-user local-first app — the approval is a self-attestation
 * the client makes on the user's behalf and the path-safety layer still
 * bounds what is possible at all.
 *
 * Hard rules enforced here:
 *   - TTL: expired approvals are rejected.
 *   - Path binding: approval.path === requested path (after normalization).
 *   - Action binding: action must match.
 *   - Shape: required string fields must be present + non-empty.
 */

export const FILE_APPROVAL_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const FILE_APPROVAL_ACTION = "inspect_one_file_safely" as const;

export interface FileInspectionApproval {
  readonly action: typeof FILE_APPROVAL_ACTION;
  readonly path: string;
  readonly approvedAt: number;
  readonly approvalId: string;
}

export type ApprovalCheckReason =
  | "no-approval"
  | "wrong-action"
  | "path-mismatch"
  | "expired"
  | "malformed";

export interface ApprovalOk {
  readonly ok: true;
  readonly approval: FileInspectionApproval;
}

export interface ApprovalError {
  readonly ok: false;
  readonly reason: ApprovalCheckReason;
  readonly detail: string;
}

export type ApprovalCheckResult = ApprovalOk | ApprovalError;

export interface ApprovalCheckOptions {
  readonly requestedPath: string;
  readonly now?: number;
  readonly ttlMs?: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(reason: ApprovalCheckReason, detail: string): ApprovalError {
  return { ok: false, reason, detail };
}

/**
 * Parse and validate an approval token against a requested path.
 *
 * The approval is shape-checked first, then TTL-checked, then path-bound.
 * We do NOT trust any field beyond what we explicitly validate.
 */
export function checkFileInspectionApproval(
  raw: unknown,
  options: ApprovalCheckOptions,
): ApprovalCheckResult {
  if (raw === undefined || raw === null) {
    return fail("no-approval", "No approval token was supplied.");
  }
  if (!isObject(raw)) {
    return fail("malformed", "Approval token must be an object.");
  }
  const { action, path, approvedAt, approvalId } = raw;
  if (action !== FILE_APPROVAL_ACTION) {
    return fail("wrong-action", `Approval is for a different action: ${String(action)}.`);
  }
  if (typeof path !== "string" || path.trim().length === 0) {
    return fail("malformed", "Approval is missing a path.");
  }
  if (typeof approvedAt !== "number" || !Number.isFinite(approvedAt)) {
    return fail("malformed", "Approval timestamp is invalid.");
  }
  if (typeof approvalId !== "string" || approvalId.trim().length === 0) {
    return fail("malformed", "Approval id is missing.");
  }

  const now = options.now ?? Date.now();
  const ttl = options.ttlMs ?? FILE_APPROVAL_TTL_MS;
  if (now - approvedAt > ttl || approvedAt > now + 60_000) {
    return fail(
      "expired",
      now - approvedAt > ttl
        ? `Approval expired ${Math.round((now - approvedAt - ttl) / 1000)}s ago.`
        : "Approval timestamp is in the future.",
    );
  }

  const requested = (options.requestedPath ?? "").trim();
  const approved = path.trim();
  if (requested !== approved) {
    return fail(
      "path-mismatch",
      `Approval is for '${approved}', not '${requested}'.`,
    );
  }

  return {
    ok: true,
    approval: {
      action: FILE_APPROVAL_ACTION,
      path: approved,
      approvedAt,
      approvalId,
    },
  };
}

/** Build a fresh approval (used by tests and the UI's approve button). */
export function buildFileInspectionApproval(args: {
  path: string;
  now?: number;
  approvalId?: string;
}): FileInspectionApproval {
  const approvedAt = args.now ?? Date.now();
  const approvalId =
    args.approvalId ??
    `appr-${approvedAt}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    action: FILE_APPROVAL_ACTION,
    path: args.path,
    approvedAt,
    approvalId,
  };
}
