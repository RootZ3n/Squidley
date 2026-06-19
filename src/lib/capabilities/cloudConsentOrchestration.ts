/**
 * Cloud consent receipt orchestration helper.
 *
 * Coordinates recording a cloud escalation offer receipt and the user's
 * consent decision receipt from dialog callbacks. This is bookkeeping
 * only — it does NOT execute cloud calls, switch providers, persist global
 * consent state, or send data.
 *
 * Hard constraints:
 *   - No fetch. No provider calls. No cloud calls.
 *   - Storage writes only through supplied storage via logActivityReceipt.
 *   - nothingSentYet is always true.
 *   - granted does not imply cloud execution.
 *   - No raw user content enters any receipt.
 */

import type { CloudEscalationPacket } from "./cloudEscalation";
import {
  recordCloudEscalationOfferReceipt,
  type CloudEscalationReceiptOptions,
} from "./cloudEscalationReceipts";
import {
  recordCloudConsentReceipt,
  type CloudConsentDecision,
  type CloudConsentReceiptOptions,
} from "./cloudConsentReceipts";
import type { ActivityReceipt } from "@/lib/activity-log/receipts";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface CloudConsentOrchestrationResult {
  offerReceipt: ActivityReceipt | null;
  decisionReceipt: ActivityReceipt | null;
  offerRecorded: boolean;
  decisionRecorded: boolean;
  decision: CloudConsentDecision;
  errors: string[];
  nothingSentYet: true;
}

export interface CloudConsentOrchestrationOptions {
  offerOptions?: CloudEscalationReceiptOptions;
  decisionOptions?: CloudConsentReceiptOptions;
  /**
   * When true (default), the decision receipt is attempted even when the
   * offer receipt write fails. The user's decision is still worth recording.
   */
  attemptDecisionOnOfferFailure?: boolean;
}

// ---------------------------------------------------------------------------
// Individual helpers
// ---------------------------------------------------------------------------

/**
 * Record only the cloud escalation offer receipt. Returns the receipt or
 * null on storage failure. Never throws.
 */
export function recordCloudEscalationOfferOnly(
  storage: Pick<Storage, "getItem" | "setItem">,
  packet: CloudEscalationPacket,
  options?: CloudEscalationReceiptOptions,
): ActivityReceipt | null {
  return recordCloudEscalationOfferReceipt(storage, packet, options);
}

/**
 * Record only the cloud consent decision receipt. Returns the receipt or
 * null on storage failure. Throws on invalid grant (non-actionable packet
 * or Velum not passed).
 */
export function recordCloudConsentDecisionOnly(
  storage: Pick<Storage, "getItem" | "setItem">,
  packet: CloudEscalationPacket,
  decision: CloudConsentDecision,
  options?: CloudConsentReceiptOptions,
): ActivityReceipt | null {
  return recordCloudConsentReceipt(storage, packet, decision, options);
}

// ---------------------------------------------------------------------------
// Combined orchestration
// ---------------------------------------------------------------------------

/**
 * Record the offer receipt first, then the consent decision receipt.
 *
 * Default behavior: if the offer write fails, the decision write is still
 * attempted (the user's decision is worth recording regardless). Set
 * `attemptDecisionOnOfferFailure: false` to skip the decision on offer
 * failure.
 *
 * Throws on invalid grant (non-actionable or Velum not passed) before any
 * write. All other storage failures are captured in the result's `errors`
 * array.
 */
export function recordCloudEscalationOfferAndDecision(
  storage: Pick<Storage, "getItem" | "setItem">,
  packet: CloudEscalationPacket,
  decision: CloudConsentDecision,
  options: CloudConsentOrchestrationOptions = {},
): CloudConsentOrchestrationResult {
  const attemptDecisionOnOfferFailure =
    options.attemptDecisionOnOfferFailure ?? true;
  const errors: string[] = [];

  // --- Offer ---
  let offerReceipt: ActivityReceipt | null = null;
  let offerRecorded = false;
  try {
    offerReceipt = recordCloudEscalationOfferReceipt(
      storage,
      packet,
      options.offerOptions,
    );
    offerRecorded = offerReceipt !== null;
  } catch (err) {
    errors.push(
      `Offer receipt failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!offerRecorded && errors.length === 0) {
    errors.push("Offer receipt write returned null (storage may be unavailable).");
  }

  // --- Decision ---
  let decisionReceipt: ActivityReceipt | null = null;
  let decisionRecorded = false;

  if (!offerRecorded && !attemptDecisionOnOfferFailure) {
    errors.push("Decision receipt skipped because offer write failed.");
  } else {
    // This may throw on invalid grant — that is intentional and propagates.
    decisionReceipt = recordCloudConsentReceipt(
      storage,
      packet,
      decision,
      options.decisionOptions,
    );
    decisionRecorded = decisionReceipt !== null;
    if (!decisionRecorded) {
      errors.push("Decision receipt write returned null (storage may be unavailable).");
    }
  }

  return {
    offerReceipt,
    decisionReceipt,
    offerRecorded,
    decisionRecorded,
    decision,
    errors,
    nothingSentYet: true,
  };
}

// ---------------------------------------------------------------------------
// Dialog callback helpers
// ---------------------------------------------------------------------------

export interface CloudConsentDialogCallbacks {
  onGranted?: (result: CloudConsentOrchestrationResult) => void;
  onDenied?: (result: CloudConsentOrchestrationResult) => void;
  onCancelled?: (result: CloudConsentOrchestrationResult) => void;
}

export interface CloudConsentDialogHandlers {
  handleGrant: () => void;
  handleDeny: () => void;
  handleCancel: () => void;
}

/**
 * Create dialog callback handlers that record consent decision receipts.
 * These do not wire into any live UI automatically — they must be
 * explicitly connected to dialog onGrant/onDeny/onClose props.
 */
export function createCloudConsentDialogHandlers(
  storage: Pick<Storage, "getItem" | "setItem">,
  packet: CloudEscalationPacket,
  callbacks?: CloudConsentDialogCallbacks,
): CloudConsentDialogHandlers {
  return {
    handleGrant() {
      const result = recordCloudEscalationOfferAndDecision(
        storage,
        packet,
        "granted",
      );
      callbacks?.onGranted?.(result);
    },
    handleDeny() {
      const result = recordCloudEscalationOfferAndDecision(
        storage,
        packet,
        "denied",
      );
      callbacks?.onDenied?.(result);
    },
    handleCancel() {
      const result = recordCloudEscalationOfferAndDecision(
        storage,
        packet,
        "cancelled",
      );
      callbacks?.onCancelled?.(result);
    },
  };
}
