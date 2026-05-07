/**
 * Velum capability decision receipt helpers.
 *
 * Bridges the Velum local-review flow into the capability decision receipt
 * pipeline. Pure functions only; no fetch, no provider calls, no cloud calls.
 *
 * Important: this receipt is about Squidley's *capability decision* (i.e.
 * "Velum's deterministic-review capability is LOCAL_READY") — it is NOT a
 * record of the reviewed text. The reviewed text and per-finding previews
 * stay in memory inside the VelumReviewResult and are never copied here.
 * The existing `buildVelumReviewReceipt` covers the content-side audit row.
 */

import {
  capabilityDecisionToTabulariumReceiptInput,
  type CapabilityTabulariumAdapterOptions,
} from "@/lib/capabilities/tabularium-adapter";
import { createCapabilityDecisionReceipt } from "@/lib/capabilities/receipts";
import {
  resolveCapabilityRuntimeForId,
  type CapabilityRuntimeInput,
} from "@/lib/capabilities/runtime";
import {
  logTabulariumReceipt,
  type TabulariumReceipt,
  type TabulariumReceiptInput,
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

function velumRuntimeContext(
  reviewCompleted: boolean,
): Omit<CapabilityRuntimeInput, "capabilityId"> {
  return {
    availableLocalProfiles: [],
    availableCloudProfiles: [],
    cloudUnlocked: false,
    cloudConsentGranted: false,
    velumReviewPassed: reviewCompleted,
  };
}

export function buildVelumCapabilityDecisionReceiptInput(
  args: VelumCapabilityReceiptArgs = {},
): TabulariumReceiptInput {
  const decision = resolveCapabilityRuntimeForId(
    VELUM_CAPABILITY_ID,
    velumRuntimeContext(Boolean(args.reviewCompleted)),
  );
  const event = createCapabilityDecisionReceipt(decision, {
    createdAt: args.createdAt,
  });
  const adapterOptions: CapabilityTabulariumAdapterOptions = {};
  if (args.receiptId !== undefined) adapterOptions.receiptId = args.receiptId;
  return capabilityDecisionToTabulariumReceiptInput(event, adapterOptions);
}

/**
 * Persist a Velum capability decision receipt through the existing local
 * Tabularium pipeline. Returns the persisted receipt on success or null if
 * `logTabulariumReceipt` could not write (e.g. storage unavailable). The
 * caller is expected to treat the return value as advisory — Velum review
 * success must not depend on receipt persistence.
 */
export function recordVelumCapabilityDecisionReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: VelumCapabilityReceiptArgs = {},
): TabulariumReceipt | null {
  return logTabulariumReceipt(
    storage,
    buildVelumCapabilityDecisionReceiptInput(args),
  );
}
