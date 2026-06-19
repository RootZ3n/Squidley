/**
 * Approval-Gated Tiny Edit Workflow — types.
 *
 * Two-phase commit:
 *   Phase A — Proposal:  no approval token. Server hashes the current
 *     file + the snippets, returns a TinyEditProposal with the diff
 *     preview. NOTHING is written.
 *   Phase B — Apply:     valid approval token bound to the exact
 *     (path, originalHash, proposedHash, fileHash). Server backs up
 *     the file contents in memory, applies one and only one
 *     replacement, re-reads, runs verification, and rolls back on
 *     any failure.
 *
 * Scope is deliberately tiny:
 *   - one file
 *   - exactly one replacement of an EXACT existing snippet
 *   - text-only allow-listed extensions
 *   - file must already be in `inspectedFiles` (proves prior approval)
 *   - max diff size capped
 *
 * Hard rules enforced at the type level:
 *   - `cloudUsed: false` is a literal type on every result.
 *   - `rolledBack` is only true when a backup was restored.
 *   - `applied` and `rolledBack` can both be true only if a write
 *     succeeded then verification failed.
 */

import type { ActivityReceipt } from "@/lib/activity-log/receipts";

export type TinyEditRiskLevel = "safe" | "review" | "elevated" | "blocked";

export type TinyEditConfidence = "high" | "medium" | "low";

export type TinyEditReceiptAction =
  | "editing.proposed"
  | "editing.approval-requested"
  | "editing.approved"
  | "editing.applied"
  | "editing.verified"
  | "editing.rollback-started"
  | "editing.rollback-completed"
  | "editing.failed";

export type TinyEditCheckId =
  | "replacement-present"
  | "original-removed"
  | "file-not-empty"
  | "file-length-reasonable"
  | "json-parses"
  | "balanced-delimiters"
  | "no-unterminated-strings";

export interface TinyEditCheck {
  readonly id: TinyEditCheckId;
  readonly description: string;
  readonly passed: boolean;
  readonly detail?: string;
}

export interface TinyEditVerification {
  readonly checks: readonly TinyEditCheck[];
  readonly expectedOutcome: string;
  readonly verificationStatus: "passed" | "failed";
  readonly failureReason?: string;
}

export interface TinyEditApprovalRequest {
  readonly action: "tiny_edit";
  readonly path: string;
  readonly originalSnippet: string;
  readonly proposedSnippet: string;
  /** SHA-256 of the original snippet bytes (UTF-8). */
  readonly originalHash: string;
  /** SHA-256 of the proposed snippet bytes (UTF-8). */
  readonly proposedHash: string;
  /** SHA-256 of the current full file contents at proposal time. */
  readonly fileHash: string;
  readonly summary: string;
  readonly reason: string;
  readonly confidence: TinyEditConfidence;
  readonly riskLevel: TinyEditRiskLevel;
  readonly expiresInMs: number;
  readonly limitations: readonly string[];
}

export interface TinyEditDiffPreview {
  readonly path: string;
  /** Unified-diff style lines with -/+ prefix. Beginner-readable. */
  readonly lines: readonly string[];
  readonly headExcerpt: string;
  readonly tailExcerpt: string;
  readonly bytesRemoved: number;
  readonly bytesAdded: number;
  readonly linesChanged: number;
}

export interface TinyEditProposal {
  readonly id: string;
  readonly path: string;
  readonly originalSnippet: string;
  readonly proposedSnippet: string;
  readonly summary: string;
  readonly reason: string;
  readonly confidence: TinyEditConfidence;
  readonly riskLevel: TinyEditRiskLevel;
  /** What checks Peh will run after applying the edit. */
  readonly verificationPlan: readonly TinyEditCheckId[];
  /** Always true in this build — we always have an in-memory backup. */
  readonly rollbackAvailable: true;
  readonly requiresApproval: true;
  readonly approvalRequest: TinyEditApprovalRequest;
  readonly diffPreview: TinyEditDiffPreview;
  readonly receipts: readonly ActivityReceipt[];
  readonly cloudUsed: false;
  readonly localOnly: true;
}

export type TinyEditApplyStatus =
  | "approval-required"
  | "blocked"
  | "applied-verified"
  | "applied-rolled-back"
  | "denied";

export interface TinyEditResult {
  readonly ok: boolean;
  readonly status: TinyEditApplyStatus;
  readonly applied: boolean;
  readonly rolledBack: boolean;
  readonly path: string;
  readonly summary: string;
  readonly diffPreview?: TinyEditDiffPreview;
  readonly verification?: TinyEditVerification;
  readonly proposal?: TinyEditProposal;
  readonly receipts: readonly ActivityReceipt[];
  readonly cloudUsed: false;
  readonly localOnly: true;
  /** When apply succeeded but verification failed, this carries the
   *  reason in beginner-friendly language. */
  readonly failureReason?: string;
}

/** Stable id helpers. */
export function makeProposalId(now: number = Date.now()): string {
  return `tiny-edit-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeEditApprovalId(now: number = Date.now()): string {
  return `edit-appr-${now}-${Math.random().toString(36).slice(2, 8)}`;
}
