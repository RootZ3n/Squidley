/**
 * Cloud escalation offer receipt helpers and Tabularium adapter.
 *
 * Pure helpers that turn a CloudEscalationPacket into an auditable receipt
 * event and Tabularium receipt input. The record helper may write through
 * the existing logTabulariumReceipt path but does nothing else.
 *
 * Hard constraints:
 *   - Pure except recordCloudEscalationOfferReceipt (which writes via
 *     supplied storage only).
 *   - No fetch. No provider calls. No cloud calls.
 *   - nothingSentYet is always true.
 *   - No raw user content enters any receipt field.
 *   - A receipt does not imply that a cloud call occurred.
 */

import type { CapabilityRuntimeState, CapabilityTier } from "./contracts";
import type { CloudEscalationConsentState, CloudEscalationPacket } from "./cloudEscalation";
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
// Constants
// ---------------------------------------------------------------------------

export const CLOUD_ESCALATION_OFFER_TYPE = "cloud-escalation.offer" as const;
export const CLOUD_ESCALATION_OFFER_ACTION = "cloud-escalation.offer" as const;

// ---------------------------------------------------------------------------
// Receipt event
// ---------------------------------------------------------------------------

export interface CloudEscalationReceiptEvent {
  type: typeof CLOUD_ESCALATION_OFFER_TYPE;
  escalationPacketId: string;
  capabilityId: string;
  moduleId: string;
  tier: CapabilityTier;
  state: CapabilityRuntimeState;
  reason: string;
  beginnerExplanation: string;
  dataCategories: readonly string[];
  providerProfilesNeeded: readonly string[];
  requiresConsent: boolean;
  consentState: CloudEscalationConsentState;
  requiresVelumReview: boolean;
  velumReviewPassed: boolean;
  nothingSentYet: true;
  actionable: boolean;
  blockedReasons: readonly string[];
  createdAt: number;
}

export interface CloudEscalationReceiptOptions {
  createdAt?: number;
  receiptId?: string;
  status?: TabulariumStatus;
}

// ---------------------------------------------------------------------------
// Event creation
// ---------------------------------------------------------------------------

export function createCloudEscalationOfferReceiptEvent(
  packet: CloudEscalationPacket,
  options: Pick<CloudEscalationReceiptOptions, "createdAt"> = {},
): CloudEscalationReceiptEvent {
  return {
    type: CLOUD_ESCALATION_OFFER_TYPE,
    escalationPacketId: packet.id,
    capabilityId: packet.capabilityId,
    moduleId: packet.moduleId,
    tier: packet.tier,
    state: packet.state,
    reason: packet.reason,
    beginnerExplanation: packet.beginnerExplanation,
    dataCategories: [...packet.dataCategories],
    providerProfilesNeeded: packet.providerProfilesNeeded.map(
      (r) => `${r.providerId}:${r.capabilityProfile}`,
    ),
    requiresConsent: packet.requiresConsent,
    consentState: packet.consentState,
    requiresVelumReview: packet.requiresVelumReview,
    velumReviewPassed: packet.velumReviewPassed,
    nothingSentYet: true,
    actionable: isCloudEscalationActionable(packet),
    blockedReasons: [...packet.blockedReasons],
    createdAt: options.createdAt ?? packet.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Tabularium adapter
// ---------------------------------------------------------------------------

function buildSummary(event: CloudEscalationReceiptEvent): string {
  const parts: string[] = [
    "Cloud escalation offer recorded. Nothing has been sent.",
  ];
  parts.push(`Consent: ${event.consentState}.`);
  if (event.requiresVelumReview) {
    parts.push(
      event.velumReviewPassed
        ? "Velum review: passed."
        : "Velum review: required but not yet passed.",
    );
  }
  if (!event.actionable) {
    parts.push("This offer is not currently actionable.");
  }
  return parts.join(" ");
}

function buildMetadata(
  event: CloudEscalationReceiptEvent,
): Record<string, string | number | boolean> {
  // Keep within Tabularium metadata cap of 16. Prioritize the most
  // important audit fields; optional context follows.
  const meta: Record<string, string | number | boolean> = {
    escalationPacketId: event.escalationPacketId,
    capabilityId: event.capabilityId,
    moduleId: event.moduleId,
    capabilityTier: event.tier,
    capabilityState: event.state,
    consentState: event.consentState,
    requiresConsent: event.requiresConsent,
    requiresVelumReview: event.requiresVelumReview,
    velumReviewPassed: event.velumReviewPassed,
    nothingSentYet: event.nothingSentYet,
    actionable: event.actionable,
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

export function cloudEscalationOfferToTabulariumReceiptInput(
  event: CloudEscalationReceiptEvent,
  options: CloudEscalationReceiptOptions = {},
): TabulariumReceiptInput {
  return {
    ...(options.receiptId !== undefined ? { id: options.receiptId } : {}),
    createdAt: event.createdAt,
    module: moduleIdToTabulariumModule(event.moduleId),
    action: CLOUD_ESCALATION_OFFER_ACTION,
    status: options.status ?? "info",
    title: `Cloud escalation offer: ${event.capabilityId}`,
    summary: buildSummary(event),
    modelUsed: false,
    metadata: buildMetadata(event),
  };
}

export function createCloudEscalationOfferTabulariumReceipt(
  event: CloudEscalationReceiptEvent,
  options: CloudEscalationReceiptOptions = {},
): TabulariumReceipt {
  return createTabulariumReceipt(
    cloudEscalationOfferToTabulariumReceiptInput(event, options),
  );
}

/**
 * Record a cloud escalation offer receipt through the existing local
 * Tabularium pipeline. Returns the persisted receipt on success or null
 * when storage is unavailable. Never throws on storage failure.
 */
export function recordCloudEscalationOfferReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  packet: CloudEscalationPacket,
  options: CloudEscalationReceiptOptions = {},
): TabulariumReceipt | null {
  const event = createCloudEscalationOfferReceiptEvent(packet, options);
  return logTabulariumReceipt(
    storage,
    cloudEscalationOfferToTabulariumReceiptInput(event, options),
  );
}
