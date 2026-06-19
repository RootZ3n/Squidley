/**
 * Peh capability decision receipt helpers.
 *
 * Pure helpers that turn a CapabilityRuntimeDecision into an auditable receipt
 * event. The event shape (`type: "capability.decision"`) is intentionally
 * narrower than the persisted ActivityReceipt — it is the in-memory record
 * of *what was decided*, not of *what was executed*. A separate persistence
 * layer can later convert these events into ActivityReceipts; this module
 * deliberately does not write to storage.
 *
 * Hard constraints:
 *   - Pure. No fetch. No storage. No localStorage. No UI side effects.
 *   - Receipts carry only metadata about the decision. Never prompt text,
 *     user document contents, Velum-reviewed body, or secrets.
 *   - createdAt is deterministic when supplied via options; otherwise
 *     `Date.now()` is read once.
 *   - Specialized helpers throw a deterministic Error when given an
 *     incompatible decision rather than emitting a misleading receipt.
 */

import type { CapabilityRuntimeState, CapabilityTier } from "./contracts";
import type { CapabilityRuntimeDecision } from "./runtime";

export const CAPABILITY_DECISION_RECEIPT_TYPE = "capability.decision" as const;

export type CapabilityProviderMode = "local" | "cloud" | "mixed" | "none";

export interface CapabilityDecisionReceiptEvent {
  type: typeof CAPABILITY_DECISION_RECEIPT_TYPE;
  capabilityId: string;
  moduleId: string;
  tier: CapabilityTier;
  state: CapabilityRuntimeState;
  localAttemptAllowed: boolean;
  cloudAllowed: boolean;
  requiresCloudConsent: boolean;
  requiresVelumReview: boolean;
  honestMessage: string;
  reasons: readonly string[];
  escalationReason?: string;
  providerMode: CapabilityProviderMode;
  providerId?: string;
  modelId?: string;
  createdAt: number;
  note?: string;
}

export interface CapabilityReceiptOptions {
  providerId?: string;
  modelId?: string;
  createdAt?: number;
  note?: string;
}

export function providerModeForDecision(
  decision: CapabilityRuntimeDecision,
): CapabilityProviderMode {
  const local = decision.canAttemptLocally;
  const cloud = decision.canUseCloud;
  if (local && cloud) return "mixed";
  if (local) return "local";
  if (cloud) return "cloud";
  return "none";
}

function buildReceipt(
  decision: CapabilityRuntimeDecision,
  options: CapabilityReceiptOptions,
): CapabilityDecisionReceiptEvent {
  const event: CapabilityDecisionReceiptEvent = {
    type: CAPABILITY_DECISION_RECEIPT_TYPE,
    capabilityId: decision.capabilityId,
    moduleId: decision.moduleId,
    tier: decision.tier,
    state: decision.state,
    localAttemptAllowed: decision.canAttemptLocally,
    cloudAllowed: decision.canUseCloud,
    requiresCloudConsent: decision.requiresCloudConsent,
    requiresVelumReview: decision.requiresVelumReview,
    honestMessage: decision.honestMessage,
    reasons: [...decision.reasons],
    providerMode: providerModeForDecision(decision),
    createdAt: options.createdAt ?? Date.now(),
  };
  if (decision.receiptHint.escalationReason !== undefined) {
    event.escalationReason = decision.receiptHint.escalationReason;
  }
  if (options.providerId !== undefined) event.providerId = options.providerId;
  if (options.modelId !== undefined) event.modelId = options.modelId;
  if (options.note !== undefined) event.note = options.note;
  return event;
}

export function createCapabilityDecisionReceipt(
  decision: CapabilityRuntimeDecision,
  options: CapabilityReceiptOptions = {},
): CapabilityDecisionReceiptEvent {
  return buildReceipt(decision, options);
}

export function createCapabilityBlockedReceipt(
  decision: CapabilityRuntimeDecision,
  options: CapabilityReceiptOptions = {},
): CapabilityDecisionReceiptEvent {
  if (decision.state !== "BLOCKED") {
    throw new Error(
      `createCapabilityBlockedReceipt requires state=BLOCKED, got ${decision.state} for ${decision.capabilityId}`,
    );
  }
  return buildReceipt(decision, options);
}

export function createCapabilityEscalationOfferedReceipt(
  decision: CapabilityRuntimeDecision,
  options: CapabilityReceiptOptions = {},
): CapabilityDecisionReceiptEvent {
  const stateOk =
    decision.state === "CLOUD_OPTIONAL" || decision.state === "CLOUD_REQUIRED";
  if (!stateOk) {
    throw new Error(
      `createCapabilityEscalationOfferedReceipt requires state=CLOUD_OPTIONAL or CLOUD_REQUIRED, got ${decision.state} for ${decision.capabilityId}`,
    );
  }
  if (decision.canUseCloud) {
    throw new Error(
      `createCapabilityEscalationOfferedReceipt requires cloudAllowed=false, but ${decision.capabilityId} already permits cloud`,
    );
  }
  const hasOpenGate =
    decision.requiresCloudConsent ||
    decision.requiresVelumReview ||
    Boolean(decision.receiptHint.escalationReason);
  if (!hasOpenGate) {
    throw new Error(
      `createCapabilityEscalationOfferedReceipt requires an open gate (consent, Velum, or missing cloud requirement) for ${decision.capabilityId}`,
    );
  }
  return buildReceipt(decision, options);
}

export function createCapabilityCloudAllowedReceipt(
  decision: CapabilityRuntimeDecision,
  options: CapabilityReceiptOptions = {},
): CapabilityDecisionReceiptEvent {
  if (!decision.canUseCloud) {
    throw new Error(
      `createCapabilityCloudAllowedReceipt requires cloudAllowed=true, but ${decision.capabilityId} does not permit cloud`,
    );
  }
  return buildReceipt(decision, options);
}
