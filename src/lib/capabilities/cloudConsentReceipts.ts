/**
 * Cloud consent decision receipt helpers and Tabularium adapter.
 *
 * Records the user's explicit consent decision (granted, denied, cancelled,
 * blocked) for a CloudEscalationPacket. Recording consent is permission
 * bookkeeping — it does NOT execute a cloud call or send data.
 *
 * Hard constraints:
 *   - Pure except recordCloudConsentReceipt (which writes via supplied
 *     storage only).
 *   - No fetch. No provider calls. No cloud calls.
 *   - nothingSentYet is always true in this phase.
 *   - granted means the user allowed future cloud use, not that anything
 *     was sent.
 *   - No raw user content enters any receipt field.
 */

import type { CapabilityRuntimeState, CapabilityTier } from "./contracts";
import type {
  CloudEscalationConsentState,
  CloudEscalationPacket,
} from "./cloudEscalation";
import { isCloudEscalationActionable } from "./cloudEscalation";
import { moduleIdToTabulariumModule } from "./tabularium-adapter";
import {
  createTabulariumReceipt,
  logTabulariumReceipt,
  type TabulariumReceipt,
  type TabulariumReceiptInput,
  type TabulariumStatus,
} from "@/lib/tabularium/receipts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloudConsentDecision =
  | "granted"
  | "denied"
  | "cancelled"
  | "blocked";

export const CLOUD_CONSENT_ACTIONS: Record<CloudConsentDecision, string> = {
  granted: "cloud-consent.granted",
  denied: "cloud-consent.denied",
  cancelled: "cloud-consent.cancelled",
  blocked: "cloud-consent.blocked",
};

export const CLOUD_CONSENT_EVENT_TYPE = "cloud-consent.decision" as const;

export interface CloudConsentReceiptEvent {
  type: typeof CLOUD_CONSENT_EVENT_TYPE;
  action: string;
  decision: CloudConsentDecision;
  escalationPacketId: string;
  capabilityId: string;
  moduleId: string;
  tier: CapabilityTier;
  state: CapabilityRuntimeState;
  consentStateBefore: CloudEscalationConsentState;
  consentStateAfter: CloudEscalationConsentState;
  requiresVelumReview: boolean;
  velumReviewPassed: boolean;
  nothingSentYet: true;
  reason: string;
  dataCategories: readonly string[];
  providerProfilesNeeded: readonly string[];
  blockedReasons: readonly string[];
  createdAt: number;
}

export interface CloudConsentReceiptOptions {
  createdAt?: number;
  receiptId?: string;
  status?: TabulariumStatus;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Consent state mapping
// ---------------------------------------------------------------------------

function consentStateAfter(decision: CloudConsentDecision): CloudEscalationConsentState {
  switch (decision) {
    case "granted": return "granted";
    case "denied": return "denied";
    case "cancelled": return "required";
    case "blocked": return "blocked";
  }
}

// ---------------------------------------------------------------------------
// Event creation
// ---------------------------------------------------------------------------

/**
 * Create a consent decision receipt event from a packet and the user's
 * decision. Throws if the user grants consent on a non-actionable packet.
 */
export function createCloudConsentReceiptEvent(
  packet: CloudEscalationPacket,
  decision: CloudConsentDecision,
  options: CloudConsentReceiptOptions = {},
): CloudConsentReceiptEvent {
  if (decision === "granted" && !isCloudEscalationActionable(packet)) {
    throw new Error(
      `Cannot grant cloud consent for non-actionable packet ${packet.id} ` +
      `(consentState=${packet.consentState}, state=${packet.state})`,
    );
  }
  if (decision === "granted" && packet.requiresVelumReview && !packet.velumReviewPassed) {
    throw new Error(
      `Cannot grant cloud consent for packet ${packet.id}: Velum review is required but not passed`,
    );
  }

  return {
    type: CLOUD_CONSENT_EVENT_TYPE,
    action: CLOUD_CONSENT_ACTIONS[decision],
    decision,
    escalationPacketId: packet.id,
    capabilityId: packet.capabilityId,
    moduleId: packet.moduleId,
    tier: packet.tier,
    state: packet.state,
    consentStateBefore: packet.consentState,
    consentStateAfter: consentStateAfter(decision),
    requiresVelumReview: packet.requiresVelumReview,
    velumReviewPassed: packet.velumReviewPassed,
    nothingSentYet: true,
    reason: options.reason ?? packet.reason,
    dataCategories: [...packet.dataCategories],
    providerProfilesNeeded: packet.providerProfilesNeeded.map(
      (r) => `${r.providerId}:${r.capabilityProfile}`,
    ),
    blockedReasons: [...packet.blockedReasons],
    createdAt: options.createdAt ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Tabularium adapter
// ---------------------------------------------------------------------------

const DECISION_SUMMARIES: Record<CloudConsentDecision, string> = {
  granted:
    "Cloud consent granted for this capability. Nothing has been sent yet.",
  denied:
    "Cloud consent denied. Peh will keep this local or stop this action.",
  cancelled:
    "Cloud consent dialog was closed. Nothing has been sent.",
  blocked:
    "Cloud consent is blocked for this capability. Nothing has been sent.",
};

function buildMetadata(
  event: CloudConsentReceiptEvent,
): Record<string, string | number | boolean> {
  const meta: Record<string, string | number | boolean> = {
    escalationPacketId: event.escalationPacketId,
    capabilityId: event.capabilityId,
    moduleId: event.moduleId,
    capabilityTier: event.tier,
    capabilityState: event.state,
    decision: event.decision,
    consentStateBefore: event.consentStateBefore,
    consentStateAfter: event.consentStateAfter,
    requiresVelumReview: event.requiresVelumReview,
    velumReviewPassed: event.velumReviewPassed,
    nothingSentYet: event.nothingSentYet,
    dataCategories: event.dataCategories.join(", "),
  };
  if (event.providerProfilesNeeded.length > 0) {
    meta.providerProfilesNeeded = event.providerProfilesNeeded.join(", ");
  }
  if (event.reason.length > 0) {
    meta.reason = event.reason;
  }
  if (event.blockedReasons.length > 0) {
    meta.blockedReasons = event.blockedReasons.join("; ");
  }
  return meta;
}

export function cloudConsentToTabulariumReceiptInput(
  event: CloudConsentReceiptEvent,
  options: CloudConsentReceiptOptions = {},
): TabulariumReceiptInput {
  return {
    ...(options.receiptId !== undefined ? { id: options.receiptId } : {}),
    createdAt: event.createdAt,
    module: moduleIdToTabulariumModule(event.moduleId),
    action: event.action,
    status: options.status ?? "info",
    title: `Cloud consent ${event.decision}: ${event.capabilityId}`,
    summary: DECISION_SUMMARIES[event.decision],
    modelUsed: false,
    metadata: buildMetadata(event),
  };
}

export function createCloudConsentTabulariumReceipt(
  event: CloudConsentReceiptEvent,
  options: CloudConsentReceiptOptions = {},
): TabulariumReceipt {
  return createTabulariumReceipt(
    cloudConsentToTabulariumReceiptInput(event, options),
  );
}

/**
 * Record a cloud consent decision through the existing local Tabularium
 * pipeline. Returns the persisted receipt on success or null when storage
 * is unavailable. Never throws on storage failure (but does throw on
 * invalid grant attempts before writing).
 */
export function recordCloudConsentReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  packet: CloudEscalationPacket,
  decision: CloudConsentDecision,
  options: CloudConsentReceiptOptions = {},
): TabulariumReceipt | null {
  const event = createCloudConsentReceiptEvent(packet, decision, options);
  return logTabulariumReceipt(
    storage,
    cloudConsentToTabulariumReceiptInput(event, options),
  );
}
