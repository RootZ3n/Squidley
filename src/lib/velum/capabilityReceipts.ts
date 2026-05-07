/**
 * Velum capability decision receipt helpers.
 *
 * Bridges the Velum local-review flow into the capability decision receipt
 * pipeline. Pure functions only; no fetch, no provider calls, no cloud calls.
 *
 * Important: this receipt is about Squidley's *capability decision* (i.e.
 * "Velum's deterministic-review capability is LOCAL_READY") -- it is NOT a
 * record of the reviewed text. The reviewed text and per-finding previews
 * stay in memory inside the VelumReviewResult and are never copied here.
 * The existing `buildVelumReviewReceipt` covers the content-side audit row.
 *
 * Delegates to the shared preflight helper while preserving all public exports.
 */

import {
  buildCapabilityPreflightReceiptInput,
  recordCapabilityPreflightReceipt,
} from "@/lib/capabilities/preflight";
import type {
  TabulariumReceipt,
  TabulariumReceiptInput,
} from "@/lib/tabularium/receipts";

export const VELUM_CAPABILITY_ID = "velum:velum.deterministic-review" as const;

export interface VelumCapabilityReceiptArgs {
  /**
   * Whether a deterministic Velum review just completed. When true, the
   * runtime context records `velumReviewPassed: true` so the resulting
   * receipt accurately reflects the runtime state at the moment of logging.
   * Defaults to false (no review has run yet).
   */
  reviewCompleted?: boolean;
  createdAt?: number;
  receiptId?: string;
}

export function buildVelumCapabilityDecisionReceiptInput(
  args: VelumCapabilityReceiptArgs = {},
): TabulariumReceiptInput {
  return buildCapabilityPreflightReceiptInput({
    capabilityId: VELUM_CAPABILITY_ID,
    velumReviewPassed: Boolean(args.reviewCompleted),
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}

/**
 * Persist a Velum capability decision receipt through the existing local
 * Tabularium pipeline. Returns the persisted receipt on success or null if
 * `logTabulariumReceipt` could not write (e.g. storage unavailable). The
 * caller is expected to treat the return value as advisory -- Velum review
 * success must not depend on receipt persistence.
 */
export function recordVelumCapabilityDecisionReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: VelumCapabilityReceiptArgs = {},
): TabulariumReceipt | null {
  return recordCapabilityPreflightReceipt(storage, {
    capabilityId: VELUM_CAPABILITY_ID,
    velumReviewPassed: Boolean(args.reviewCompleted),
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}
