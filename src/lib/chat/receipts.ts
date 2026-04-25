/**
 * Receipts — the small log of "what just happened" shown alongside chat.
 *
 * Receipts are intentionally simple in this pass: a request creates one in
 * the "running" state; the response either succeeds it (with a duration) or
 * fails it (with a friendly message). Cloud-used and tools-used are encoded
 * as `false` so the UI can display the safety guarantee at a glance.
 */

export type ReceiptStatus = "running" | "succeeded" | "failed";

export interface Receipt {
  /** Stable identifier for React keys and updates. */
  id: string;
  provider: "local";
  model: string;
  status: ReceiptStatus;
  startedAt: number;
  completedAt?: number;
  /** Always false in this pass; surfaced so the UI can show "no cloud". */
  cloudUsed: false;
  /** Always false in this pass. */
  toolsUsed: false;
  /** Beginner-readable error message when status === "failed". */
  errorMessage?: string;
}

export function createRunningReceipt(args: {
  id: string;
  model: string;
  startedAt: number;
}): Receipt {
  return {
    id: args.id,
    provider: "local",
    model: args.model,
    status: "running",
    startedAt: args.startedAt,
    cloudUsed: false,
    toolsUsed: false,
  };
}

export function succeedReceipt(receipt: Receipt, completedAt: number): Receipt {
  return {
    ...receipt,
    status: "succeeded",
    completedAt,
  };
}

export function failReceipt(
  receipt: Receipt,
  completedAt: number,
  errorMessage: string,
): Receipt {
  return {
    ...receipt,
    status: "failed",
    completedAt,
    errorMessage,
  };
}

export function receiptDurationMs(r: Receipt): number | undefined {
  if (typeof r.completedAt !== "number") return undefined;
  return Math.max(0, r.completedAt - r.startedAt);
}

/** Replace the receipt with the same id; append if not present. */
export function upsertReceipt(list: Receipt[], next: Receipt): Receipt[] {
  const i = list.findIndex((r) => r.id === next.id);
  if (i === -1) return [...list, next];
  const copy = list.slice();
  copy[i] = next;
  return copy;
}
