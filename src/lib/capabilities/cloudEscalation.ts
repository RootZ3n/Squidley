/**
 * Cloud escalation consent packet contract.
 *
 * Pure, auditable helpers that describe *why* cloud is needed or useful,
 * *what category* of data would be sent, and *what consent/review state*
 * is needed — without making any cloud call, switching providers, or
 * routing traffic.
 *
 * A CloudEscalationPacket is an immutable description of an offer. It does
 * not cause anything to happen. Nothing is sent merely because a packet
 * exists. UI and execution layers consume these packets later; this module
 * only builds and inspects them.
 *
 * Hard constraints:
 *   - Pure. No fetch. No storage. No localStorage. No UI side effects.
 *   - nothingSentYet is always true in this phase.
 *   - No raw user content (prompt, document, message, code, image data)
 *     enters any packet or receipt metadata field.
 *   - Only CLOUD_OPTIONAL or CLOUD_REQUIRED decisions produce offerable
 *     packets by default.
 */

import type {
  CapabilityRuntimeState,
  CapabilityTier,
  ProviderRequirement,
} from "./contracts";
import { getCapabilityById } from "./registry";
import type { CapabilityReceiptHint, CapabilityRuntimeDecision } from "./runtime";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloudEscalationDataCategory =
  | "user-message"
  | "document-excerpt"
  | "summary"
  | "metadata-only"
  | "image"
  | "code"
  | "external-query"
  | "unknown";

export type CloudEscalationConsentState =
  | "not-required"
  | "required"
  | "granted"
  | "denied"
  | "blocked";

export interface CloudEscalationPacket {
  id: string;
  capabilityId: string;
  moduleId: string;
  tier: CapabilityTier;
  state: CapabilityRuntimeState;
  reason: string;
  beginnerExplanation: string;
  dataCategories: readonly CloudEscalationDataCategory[];
  providerProfilesNeeded: readonly ProviderRequirement[];
  requiresConsent: boolean;
  consentState: CloudEscalationConsentState;
  requiresVelumReview: boolean;
  velumReviewPassed: boolean;
  nothingSentYet: true;
  blockedReasons: readonly string[];
  createdAt: number;
  receiptHint: CapabilityReceiptHint;
}

export interface CloudEscalationPacketOptions {
  id?: string;
  createdAt?: number;
  dataCategories?: readonly CloudEscalationDataCategory[];
  consentState?: CloudEscalationConsentState;
  velumReviewPassed?: boolean;
  beginnerExplanation?: string;
  /** Allow creating a blocked (non-offerable) packet from a BLOCKED decision. */
  allowBlockedPacket?: boolean;
  /** Allow creating a cloud-optional packet from a LOCAL_LIMITED decision. */
  allowLocalLimitedEscalation?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generatePacketId(createdAt: number): string {
  return `esc-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultBeginnerExplanation(
  decision: CapabilityRuntimeDecision,
): string {
  switch (decision.state) {
    case "CLOUD_REQUIRED":
      return "This capability needs a cloud provider to run. Nothing has been sent yet. Squidley will ask for your explicit permission before sending anything.";
    case "CLOUD_OPTIONAL":
      return "A cloud provider could improve the result, but is not required. Nothing has been sent yet. You can choose to keep everything local.";
    case "LOCAL_LIMITED":
      return "This runs locally but results may be limited. A cloud provider could improve quality if you choose to opt in later.";
    case "BLOCKED":
      return "This capability is currently blocked and cannot use cloud.";
    default:
      return "Cloud escalation details are not available for this state.";
  }
}

function resolveConsentState(
  decision: CapabilityRuntimeDecision,
  options: CloudEscalationPacketOptions,
): CloudEscalationConsentState {
  if (options.consentState !== undefined) return options.consentState;
  if (decision.state === "BLOCKED") return "blocked";
  if (
    decision.state === "CLOUD_REQUIRED" ||
    decision.state === "CLOUD_OPTIONAL"
  ) {
    return "required";
  }
  // LOCAL_LIMITED with allowLocalLimitedEscalation
  if (decision.state === "LOCAL_LIMITED") return "required";
  return "not-required";
}

function resolveBlockedReasons(
  decision: CapabilityRuntimeDecision,
): readonly string[] {
  if (decision.state !== "BLOCKED") return [];
  return decision.reasons.length > 0
    ? decision.reasons
    : ["Capability is blocked."];
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Returns true when a cloud escalation offer can be presented to the user
 * for this decision. LOCAL_READY and BLOCKED decisions are not offerable by
 * default; LOCAL_LIMITED is not offerable unless explicitly allowed.
 */
export function canOfferCloudEscalation(
  decision: CapabilityRuntimeDecision,
  options?: Pick<CloudEscalationPacketOptions, "allowLocalLimitedEscalation">,
): boolean {
  if (
    decision.state === "CLOUD_REQUIRED" ||
    decision.state === "CLOUD_OPTIONAL"
  ) {
    return true;
  }
  if (
    decision.state === "LOCAL_LIMITED" &&
    decision.tier === "cloud-optional" &&
    options?.allowLocalLimitedEscalation === true
  ) {
    return true;
  }
  return false;
}

/**
 * Build an immutable cloud escalation packet from a runtime decision.
 *
 * Returns null for LOCAL_READY decisions (no escalation applicable) and for
 * BLOCKED/LOCAL_LIMITED decisions unless explicitly allowed via options.
 */
export function createCloudEscalationPacket(
  decision: CapabilityRuntimeDecision,
  options: CloudEscalationPacketOptions = {},
): CloudEscalationPacket | null {
  // LOCAL_READY: no escalation applicable.
  if (decision.state === "LOCAL_READY") return null;

  // BLOCKED: only with explicit opt-in.
  if (decision.state === "BLOCKED" && !options.allowBlockedPacket) return null;

  // LOCAL_LIMITED: only when capability tier is cloud-optional and caller opts in.
  if (decision.state === "LOCAL_LIMITED") {
    if (
      decision.tier !== "cloud-optional" ||
      !options.allowLocalLimitedEscalation
    ) {
      return null;
    }
  }

  const createdAt = options.createdAt ?? Date.now();
  const consentState = resolveConsentState(decision, options);

  return {
    id: options.id ?? generatePacketId(createdAt),
    capabilityId: decision.capabilityId,
    moduleId: decision.moduleId,
    tier: decision.tier,
    state: decision.state,
    reason: decision.honestMessage,
    beginnerExplanation:
      options.beginnerExplanation ?? defaultBeginnerExplanation(decision),
    dataCategories: options.dataCategories ?? ["unknown"],
    providerProfilesNeeded: decision.state === "BLOCKED"
      ? []
      : [...extractCloudRequirements(decision)],
    requiresConsent: consentState !== "not-required" && consentState !== "blocked",
    consentState,
    requiresVelumReview: decision.requiresVelumReview,
    velumReviewPassed: options.velumReviewPassed ?? false,
    nothingSentYet: true,
    blockedReasons: resolveBlockedReasons(decision),
    createdAt,
    receiptHint: { ...decision.receiptHint },
  };
}

/**
 * Derive provider requirements from the decision's receipt hint. Since
 * CapabilityRuntimeDecision does not directly carry cloudRequirements, we
 * look them up from the registry. If the capability is unknown we return
 * an empty array rather than throwing.
 */
function extractCloudRequirements(
  decision: CapabilityRuntimeDecision,
): readonly ProviderRequirement[] {
  return getCapabilityById(decision.capabilityId)?.cloudRequirements ?? [];
}

/**
 * Returns true when the packet represents an actionable offer (consent not
 * denied/blocked, and the state is offerable).
 */
export function isCloudEscalationActionable(
  packet: CloudEscalationPacket,
): boolean {
  if (packet.consentState === "denied") return false;
  if (packet.consentState === "blocked") return false;
  if (packet.state === "BLOCKED") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Receipt metadata
// ---------------------------------------------------------------------------

/**
 * Convert a packet into safe receipt metadata fields. Never includes raw
 * user content, prompt text, document text, code, image data, or secrets.
 */
export function cloudEscalationPacketToReceiptMetadata(
  packet: CloudEscalationPacket,
): Record<string, string | number | boolean> {
  const meta: Record<string, string | number | boolean> = {
    escalationPacketId: packet.id,
    capabilityId: packet.capabilityId,
    moduleId: packet.moduleId,
    capabilityTier: packet.tier,
    capabilityState: packet.state,
    consentState: packet.consentState,
    requiresConsent: packet.requiresConsent,
    requiresVelumReview: packet.requiresVelumReview,
    velumReviewPassed: packet.velumReviewPassed,
    nothingSentYet: packet.nothingSentYet,
    dataCategories: packet.dataCategories.join(", "),
    reason: packet.reason,
  };
  if (packet.blockedReasons.length > 0) {
    meta.blockedReasons = packet.blockedReasons.join("; ");
  }
  return meta;
}
