/**
 * Chat adapter for approval-gated file inspection.
 *
 * Three exit paths:
 *   1. Intent matched but no path was extractable → return a friendly
 *      assistant reply asking the user to name a file. No filesystem
 *      access, no approval requested.
 *   2. Approval missing or invalid → return an approval-required
 *      response (or "denied" if approval was supplied but stale /
 *      mismatched).
 *   3. Approval valid + path safe → run safeFileInspect and return the
 *      packed summary as the reply.
 *
 * Hard rules:
 *   - We never fall through to the local model pretending we read the
 *     file. If the request was about a file but we did not actually
 *     read it, the response says so.
 *   - cloudUsed = false on every outcome.
 *   - The node-fs reader is the default; tests can inject a fake.
 */

import type { ActivityReceipt } from "@/lib/activity-log/receipts";
import { createActivityReceipt } from "@/lib/activity-log/receipts";
import {
  resolveInspectionRoot,
  safeFileInspect,
  type FileInspectionReader,
  type InspectionApprovalRequest,
  type InspectionOutcome,
} from "@/lib/reliability/safeFileInspection";

export interface FileInspectionChatRequest {
  readonly message: string;
  readonly path: string | null;
  readonly approval?: unknown;
  readonly projectRoot?: string;
  readonly reader?: FileInspectionReader;
  readonly now?: () => number;
}

export type FileInspectionChatStatus =
  | "needs-path"
  | "approval-required"
  | "denied"
  | "blocked"
  | "completed";

export interface FileInspectionChatResult {
  readonly status: FileInspectionChatStatus;
  readonly reply: string;
  readonly approvalRequest?: InspectionApprovalRequest;
  readonly path?: string;
  readonly receipts: readonly ActivityReceipt[];
  readonly summary: string;
  readonly cloudUsed: false;
  readonly localOnly: true;
  readonly ok: boolean;
}

function buildNeedsPathReceipt(now: () => number): ActivityReceipt {
  return createActivityReceipt({
    module: "system",
    action: "reliability.file-inspection-requested",
    status: "info",
    title: "File inspection — path needed",
    summary:
      "User asked for file inspection but did not name a file. Peh asked the user to name one.",
    metadata: { cloud_used: false, read_only: true, needs_path: true },
    createdAt: now(),
  });
}

function buildPackedSummaryReply(outcome: InspectionOutcome): string {
  if (outcome.status !== "completed" || !outcome.packedContext) {
    return outcome.summary;
  }
  const item = outcome.packedContext.includedItems[0];
  const head = `\`${outcome.path}\` (read-only inspection):`;
  const redactionsNote =
    outcome.redactionsApplied.length > 0
      ? `Redactions applied before reading: ${outcome.redactionsApplied
          .map((r) => `${r.category}×${r.count}`)
          .join(", ")}.`
      : "No obvious secrets detected (custom secret formats may still exist).";
  const truncationNote =
    outcome.packedContext.truncationNotes.length > 0
      ? `\n\n${outcome.packedContext.truncationNotes.join("\n")}`
      : "";
  const omittedNote =
    outcome.packedContext.omittedItems.length > 0
      ? `\n\nOmitted: ${outcome.packedContext.omittedItems
          .map((o) => `${o.label} (${o.reason})`)
          .join(", ")}`
      : "";
  const body = item?.body ?? "";
  const sizeNote = outcome.packedContext.safeForLocalModel
    ? `Packed ${outcome.packedContext.estimatedSize} chars — safe for a small local model.`
    : `Packed ${outcome.packedContext.estimatedSize} chars — above the small-model safe threshold; consider asking about one section.`;
  return [
    head,
    redactionsNote,
    sizeNote,
    "---",
    body,
    truncationNote,
    omittedNote,
  ]
    .filter((s) => s.length > 0)
    .join("\n\n");
}

/**
 * Default Node `fs/promises` reader. Pure import here would pull `fs`
 * into the bundle even when not needed; we lazy-import via dynamic
 * import inside the methods.
 */
export const defaultNodeReader: FileInspectionReader = {
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
};

/**
 * Run the chat-side adapter. Returns one of five outcome statuses.
 */
export async function handleFileInspectionRequest(
  args: FileInspectionChatRequest,
): Promise<FileInspectionChatResult> {
  const now = args.now ?? Date.now;
  const reader = args.reader ?? defaultNodeReader;

  if (args.path === null) {
    return {
      status: "needs-path",
      reply:
        "Peh wants to read a file to answer that. Please name the file (for example: 'inspect src/app/page.tsx'). Peh will then ask for your approval before reading it.",
      summary:
        "User asked for file inspection but did not name a file. Peh asked for one.",
      receipts: [buildNeedsPathReceipt(now)],
      cloudUsed: false,
      localOnly: true,
      ok: false,
    };
  }

  const projectRoot =
    args.projectRoot ??
    resolveInspectionRoot(typeof process !== "undefined" ? process.env : {});

  const outcome = await safeFileInspect({
    path: args.path,
    reason: args.message.slice(0, 200),
    projectRoot,
    approval: args.approval,
    reader,
    now,
  });

  if (outcome.status === "approval-required") {
    return {
      status: "approval-required",
      reply:
        "Peh wants to read this file so it can answer your question. Reading is not the same as editing. Approve or decline below.",
      approvalRequest: outcome.approvalRequest,
      path: outcome.path,
      summary: outcome.summary,
      receipts: outcome.receipts,
      cloudUsed: false,
      localOnly: true,
      ok: false,
    };
  }

  if (outcome.status === "denied") {
    return {
      status: "denied",
      reply: outcome.summary,
      path: outcome.path,
      summary: outcome.summary,
      receipts: outcome.receipts,
      cloudUsed: false,
      localOnly: true,
      ok: false,
    };
  }

  if (outcome.status === "blocked") {
    return {
      status: "blocked",
      reply: `Peh refused to read \`${outcome.path}\`: ${outcome.blockedReason}`,
      path: outcome.path,
      summary: outcome.blockedReason ?? "blocked",
      receipts: outcome.receipts,
      cloudUsed: false,
      localOnly: true,
      ok: false,
    };
  }

  // completed
  return {
    status: "completed",
    reply: buildPackedSummaryReply(outcome),
    path: outcome.path,
    summary: outcome.summary,
    receipts: outcome.receipts,
    cloudUsed: false,
    localOnly: true,
    ok: true,
  };
}
