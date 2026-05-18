/**
 * Chat adapter for the Tiny Edit Workflow.
 *
 * Two phases:
 *   - Phase A (no approval token in request): call `proposeTinyEdit`,
 *     return a structured `approvalRequest` + diff preview. The UI
 *     renders the diff and Approve/Decline buttons.
 *   - Phase B (approval token present): call `applyTinyEdit`, which
 *     re-reads the file, validates everything, applies the single
 *     replacement, re-reads, runs verification, and rolls back on any
 *     failure.
 *
 * Hard rules:
 *   - The path MUST appear in `inspectedFiles` for either phase to
 *     proceed. No edit without prior inspection.
 *   - Casual chat with no edit intent is never routed here.
 *   - The reply text never carries raw file contents — only diff
 *     preview lines + summary text.
 */

import {
  applyTinyEdit,
  defaultNodeEditor,
  defaultNodeHasher,
  proposeTinyEdit,
  type ContentHasher,
  type FileEditor,
  type TinyEditApprovalRequest,
  type TinyEditDiffPreview,
  type TinyEditResult,
  type TinyEditVerification,
} from "@/lib/editing";
import { resolveInspectionRoot } from "@/lib/reliability/safeFileInspection";

export interface EditingChatRequest {
  readonly message: string;
  readonly editProposal: {
    readonly path: string;
    readonly originalSnippet: string;
    readonly proposedSnippet: string;
    readonly reason?: string;
  };
  readonly approval?: unknown;
  readonly inspectedPaths: readonly string[];
  readonly projectRoot?: string;
  readonly editor?: FileEditor;
  readonly hashContent?: ContentHasher;
  readonly now?: () => number;
}

export type EditingChatStatus = TinyEditResult["status"];

export interface EditingChatResult {
  readonly status: EditingChatStatus;
  readonly reply: string;
  readonly path: string;
  readonly summary: string;
  readonly applied: boolean;
  readonly rolledBack: boolean;
  readonly approvalRequest?: TinyEditApprovalRequest;
  readonly diffPreview?: TinyEditDiffPreview;
  readonly verification?: TinyEditVerification;
  readonly receiptActions: readonly string[];
  readonly cloudUsed: false;
  readonly localOnly: true;
  readonly ok: boolean;
  readonly failureReason?: string;
}

function renderApprovalRequiredReply(req: TinyEditApprovalRequest, diff: TinyEditDiffPreview): string {
  const lines = [
    `Squidley wants to make a tiny edit to \`${req.path}\`. Editing is not the same as automatic — you must approve this exact change before anything is written.`,
    "",
    `Summary: ${req.summary}`,
    `Confidence: ${req.confidence}   Risk: ${req.riskLevel}`,
    "",
    "Diff preview:",
    "```",
    ...diff.lines,
    "```",
    "",
    "Click **Approve** below to apply this exact replacement once. Squidley will re-read the file and roll back automatically if anything looks wrong after writing.",
  ];
  return lines.join("\n");
}

function renderApplyResultReply(r: TinyEditResult): string {
  if (r.status === "applied-verified") {
    return `Tiny edit applied and verified in \`${r.path}\`.\n\n${r.verification?.checks
      .map((c) => `- ${c.passed ? "✓" : "✗"} ${c.description}`)
      .join("\n") ?? ""}`;
  }
  if (r.status === "applied-rolled-back") {
    return `Squidley applied the edit, but verification failed and the original contents were restored.\n\nReason: ${r.failureReason ?? "verification failed"}`;
  }
  if (r.status === "denied") {
    return `Squidley refused to apply this edit. ${r.summary}`;
  }
  return `Squidley refused to apply this edit. ${r.summary}`;
}

export async function handleEditingChatRequest(
  args: EditingChatRequest,
): Promise<EditingChatResult> {
  const projectRoot =
    args.projectRoot ??
    resolveInspectionRoot(typeof process !== "undefined" ? process.env : {});
  const editor = args.editor ?? defaultNodeEditor;
  const hashContent = args.hashContent ?? defaultNodeHasher;
  const now = args.now ?? Date.now;

  if (!args.approval) {
    const r = await proposeTinyEdit({
      path: args.editProposal.path,
      originalSnippet: args.editProposal.originalSnippet,
      proposedSnippet: args.editProposal.proposedSnippet,
      reason: args.editProposal.reason ?? args.message.slice(0, 200),
      projectRoot,
      inspectedPaths: args.inspectedPaths,
      editor,
      hashContent,
      now,
    });
    const reply =
      r.status === "approval-required" && r.proposal
        ? renderApprovalRequiredReply(r.proposal.approvalRequest, r.diffPreview!)
        : `Squidley refused to propose this edit. ${r.summary}`;
    return {
      status: r.status,
      reply,
      path: r.path,
      summary: r.summary,
      applied: r.applied,
      rolledBack: r.rolledBack,
      approvalRequest: r.proposal?.approvalRequest,
      diffPreview: r.diffPreview,
      verification: r.verification,
      receiptActions: r.receipts.map((x) => x.action),
      cloudUsed: false,
      localOnly: true,
      ok: r.ok,
      failureReason: r.failureReason,
    };
  }

  const r = await applyTinyEdit({
    path: args.editProposal.path,
    originalSnippet: args.editProposal.originalSnippet,
    proposedSnippet: args.editProposal.proposedSnippet,
    approval: args.approval,
    projectRoot,
    inspectedPaths: args.inspectedPaths,
    editor,
    hashContent,
    now,
  });
  return {
    status: r.status,
    reply: renderApplyResultReply(r),
    path: r.path,
    summary: r.summary,
    applied: r.applied,
    rolledBack: r.rolledBack,
    diffPreview: r.diffPreview,
    verification: r.verification,
    receiptActions: r.receipts.map((x) => x.action),
    cloudUsed: false,
    localOnly: true,
    ok: r.ok,
    failureReason: r.failureReason,
  };
}
