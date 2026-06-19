/**
 * Capability transparency badge helpers.
 *
 * Pure mappers from a CapabilityRuntimeDecision OR a ActivityLog-style
 * capability decision metadata blob into a small, beginner-friendly view
 * model. UI components consume these — they do not import provider, fetch,
 * or storage code from here.
 *
 * Important contract:
 *   - These helpers describe *decisions and permissions*, not *invocations*.
 *   - `cloudUsed` is ALWAYS false: a capability decision receipt records
 *     what Peh evaluated, never that a cloud call took place.
 *   - `cloudAllowed === true` means cloud is permitted (consent + Velum +
 *     matching cloud profile). It is NOT the same as "cloud was used."
 *   - `providerMode === "cloud"` likewise describes routing intent on a
 *     decision, not that a network call occurred.
 */

import type {
  CapabilityRuntimeState,
  CapabilityTier,
} from "./contracts";
import type { CapabilityProviderMode } from "./receipts";
import type { CapabilityRuntimeDecision } from "./runtime";

export type CapabilityBadgeTone =
  | "local"
  | "limited"
  | "cloud-optional"
  | "cloud-required"
  | "blocked"
  | "neutral";

export interface CapabilityBadgeView {
  label: string;
  tone: CapabilityBadgeTone;
  shortDescription: string;
  detail: string;
  cloudUsed: boolean;
  localAttemptAllowed: boolean;
  cloudAllowed: boolean;
}

const STATE_LABELS: Record<CapabilityRuntimeState, string> = {
  LOCAL_READY: "Local ready",
  LOCAL_LIMITED: "Local limited",
  CLOUD_OPTIONAL: "Cloud optional",
  CLOUD_REQUIRED: "Cloud required",
  BLOCKED: "Blocked",
};

const STATE_TONES: Record<CapabilityRuntimeState, CapabilityBadgeTone> = {
  LOCAL_READY: "local",
  LOCAL_LIMITED: "limited",
  CLOUD_OPTIONAL: "cloud-optional",
  CLOUD_REQUIRED: "cloud-required",
  BLOCKED: "blocked",
};

const STATE_SHORT_DESCRIPTIONS: Record<CapabilityRuntimeState, string> = {
  LOCAL_READY: "Runs locally on your device.",
  LOCAL_LIMITED: "Can run locally; results may be limited.",
  CLOUD_OPTIONAL: "Local works; cloud may improve the result.",
  CLOUD_REQUIRED: "Cloud is required.",
  BLOCKED: "Currently unavailable.",
};

export function capabilityStateToBadgeLabel(
  state: CapabilityRuntimeState | string,
): string {
  if (isCapabilityRuntimeState(state)) return STATE_LABELS[state];
  return "Capability decision";
}

function isCapabilityRuntimeState(value: unknown): value is CapabilityRuntimeState {
  return (
    value === "LOCAL_READY" ||
    value === "LOCAL_LIMITED" ||
    value === "CLOUD_OPTIONAL" ||
    value === "CLOUD_REQUIRED" ||
    value === "BLOCKED"
  );
}

function detailFor(
  state: CapabilityRuntimeState,
  cloudAllowed: boolean,
  honestMessage?: string,
): string {
  switch (state) {
    case "LOCAL_READY":
      return "Peh can run this locally. No cloud is required.";
    case "LOCAL_LIMITED":
      return "Peh can try this locally, but results may be weaker or slower than a larger model.";
    case "CLOUD_OPTIONAL":
      return "Peh can run this locally. Cloud could improve the result, but is not used unless you opt in.";
    case "CLOUD_REQUIRED":
      return cloudAllowed
        ? "This needs a cloud capability. Consent was granted, but no cloud call was made by this decision."
        : "This needs a cloud capability before it can run. Nothing has been sent.";
    case "BLOCKED": {
      const trimmed = honestMessage?.trim();
      if (trimmed && trimmed.length > 0) return trimmed;
      return "This capability is currently unavailable.";
    }
  }
}

const NEUTRAL_VIEW: CapabilityBadgeView = {
  label: "Capability decision",
  tone: "neutral",
  shortDescription: "Capability state is not available.",
  detail:
    "Peh does not have enough information to describe this capability decision yet.",
  cloudUsed: false,
  localAttemptAllowed: false,
  cloudAllowed: false,
};

export function capabilityDecisionToBadgeView(
  decision: CapabilityRuntimeDecision,
): CapabilityBadgeView {
  return {
    label: STATE_LABELS[decision.state],
    tone: STATE_TONES[decision.state],
    shortDescription: STATE_SHORT_DESCRIPTIONS[decision.state],
    detail: detailFor(decision.state, decision.canUseCloud, decision.honestMessage),
    cloudUsed: false,
    localAttemptAllowed: decision.canAttemptLocally,
    cloudAllowed: decision.canUseCloud,
  };
}

/**
 * Tolerant view-builder for receipt metadata as it lands in ActivityLog —
 * keys may be missing, mistyped, or truncated. Falls back to a neutral view
 * rather than throwing.
 */
export function capabilityReceiptMetadataToBadgeView(
  metadata: Readonly<Record<string, string | number | boolean>> | null | undefined,
): CapabilityBadgeView {
  if (!metadata || typeof metadata !== "object") return { ...NEUTRAL_VIEW };

  const stateRaw = metadata.capabilityState;
  if (!isCapabilityRuntimeState(stateRaw)) return { ...NEUTRAL_VIEW };

  const cloudAllowed = metadata.cloudAllowed === true;
  const localAttemptAllowed = metadata.localAttemptAllowed === true;
  const honestMessage =
    typeof metadata.honestMessage === "string" ? metadata.honestMessage : undefined;

  return {
    label: STATE_LABELS[stateRaw],
    tone: STATE_TONES[stateRaw],
    shortDescription: STATE_SHORT_DESCRIPTIONS[stateRaw],
    detail: detailFor(stateRaw, cloudAllowed, honestMessage),
    cloudUsed: false,
    localAttemptAllowed,
    cloudAllowed,
  };
}

/**
 * Tailwind class for the badge pill. Mirrors the tone palette already used
 * in `AssessmentCapabilityNote` (emerald for ready, amber for limited, iris for
 * cloud states, rose for blocked, slate for neutral).
 */
export function capabilityBadgeToneClass(tone: CapabilityBadgeTone): string {
  const base =
    "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]";
  switch (tone) {
    case "local":
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100`;
    case "limited":
      return `${base} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100`;
    case "cloud-optional":
    case "cloud-required":
      return `${base} border-iris-200 bg-iris-50 text-iris-800 dark:border-iris-700/60 dark:bg-iris-900/20 dark:text-iris-100`;
    case "blocked":
      return `${base} border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-100`;
    case "neutral":
      return `${base} border-ink-200 bg-ink-50 text-ink-700 dark:border-ink-700/60 dark:bg-ink-800/40 dark:text-ink-200`;
  }
}

/**
 * Detect whether a ActivityLog receipt (or receipt-like object) represents a
 * capability decision. Checks `action` and/or metadata fields.
 */
export function isCapabilityDecisionReceipt(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): boolean {
  if (!receipt) return false;
  if (receipt.action === "capability.decision") return true;
  const meta = receipt.metadata;
  if (!meta || typeof meta !== "object") return false;
  return (
    typeof meta.capabilityId === "string" &&
    isCapabilityRuntimeState(meta.capabilityState)
  );
}

/**
 * Convert a ActivityLog receipt (or receipt-like object) into a badge view.
 * Returns `null` when the receipt is not a capability decision.
 */
export function receiptToCapabilityBadgeView(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): CapabilityBadgeView | null {
  if (!isCapabilityDecisionReceipt(receipt)) return null;
  return capabilityReceiptMetadataToBadgeView(receipt!.metadata);
}

// ---------------------------------------------------------------------------
// Cloud escalation offer badge helpers
// ---------------------------------------------------------------------------

type ConsentStateString = "not-required" | "required" | "granted" | "denied" | "blocked";

function isConsentState(value: unknown): value is ConsentStateString {
  return (
    value === "not-required" ||
    value === "required" ||
    value === "granted" ||
    value === "denied" ||
    value === "blocked"
  );
}

const CONSENT_LABELS: Record<ConsentStateString, string> = {
  "not-required": "Cloud not required",
  required: "Cloud consent needed",
  granted: "Cloud allowed",
  denied: "Cloud denied",
  blocked: "Cloud blocked",
};

const CONSENT_TONES: Record<ConsentStateString, CapabilityBadgeTone> = {
  "not-required": "neutral",
  required: "cloud-required",
  granted: "cloud-optional",
  denied: "blocked",
  blocked: "blocked",
};

const CONSENT_SHORT: Record<ConsentStateString, string> = {
  "not-required": "Cloud is not required for this action.",
  required: "Cloud consent is required before anything is sent.",
  granted: "Cloud is allowed but nothing has been sent from this offer.",
  denied: "Cloud was offered but consent was denied.",
  blocked: "Cloud escalation is currently blocked.",
};

function escalationDetail(
  consentState: ConsentStateString,
  nothingSentYet: boolean,
  requiresVelumReview: boolean,
  velumReviewPassed: boolean,
): string {
  const parts: string[] = [];

  if (nothingSentYet) {
    parts.push("Nothing has been sent to any cloud provider.");
  }

  switch (consentState) {
    case "required":
      parts.push("Peh needs your explicit consent before sending anything to the cloud.");
      break;
    case "granted":
      parts.push("Cloud is allowed, but this receipt alone does not prove a cloud call happened.");
      break;
    case "denied":
      parts.push("You denied cloud access for this offer.");
      break;
    case "blocked":
      parts.push("Cloud escalation is blocked for this capability.");
      break;
    case "not-required":
      parts.push("No cloud provider is needed.");
      break;
  }

  if (requiresVelumReview && !velumReviewPassed) {
    parts.push("Velum review is required before any data can be sent to the cloud.");
  } else if (requiresVelumReview && velumReviewPassed) {
    parts.push("Velum review has been completed.");
  }

  return parts.join(" ");
}

/**
 * Detect whether a ActivityLog receipt represents a cloud escalation offer.
 */
export function isCloudEscalationOfferReceipt(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): boolean {
  if (!receipt) return false;
  if (receipt.action === "cloud-escalation.offer") return true;
  const meta = receipt.metadata;
  if (!meta || typeof meta !== "object") return false;
  return (
    typeof meta.escalationPacketId === "string" &&
    isConsentState(meta.consentState)
  );
}

/**
 * Build a badge view from a cloud-escalation.offer receipt's metadata.
 * Returns null when the receipt is not a cloud escalation offer.
 */
export function cloudEscalationReceiptToBadgeView(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): CapabilityBadgeView | null {
  if (!isCloudEscalationOfferReceipt(receipt)) return null;
  const meta = receipt!.metadata!;

  const consentState = isConsentState(meta.consentState)
    ? meta.consentState
    : "required";
  const nothingSentYet = meta.nothingSentYet === true;
  const requiresVelumReview = meta.requiresVelumReview === true;
  const velumReviewPassed = meta.velumReviewPassed === true;
  const cloudAllowed = consentState === "granted";

  return {
    label: CONSENT_LABELS[consentState],
    tone: CONSENT_TONES[consentState],
    shortDescription: CONSENT_SHORT[consentState],
    detail: escalationDetail(consentState, nothingSentYet, requiresVelumReview, velumReviewPassed),
    cloudUsed: false,
    localAttemptAllowed: false,
    cloudAllowed,
  };
}

/**
 * Unified transparency badge builder. Handles all receipt types with
 * transparency badges. Returns null for unrecognized receipt types.
 */
export function receiptToTransparencyBadgeView(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): CapabilityBadgeView | null {
  if (isGatewayPolicyDecisionReceipt(receipt)) {
    return gatewayPolicyReceiptToBadgeView(receipt);
  }
  if (isPromptInjectionAssessmentReceipt(receipt)) {
    return promptInjectionReceiptToBadgeView(receipt);
  }
  if (isCloudConsentDecisionReceipt(receipt)) {
    return cloudConsentReceiptToBadgeView(receipt);
  }
  if (isCloudEscalationOfferReceipt(receipt)) {
    return cloudEscalationReceiptToBadgeView(receipt);
  }
  if (isVelumHandoffOrReviewReceipt(receipt)) {
    return velumHandoffReceiptToBadgeView(receipt);
  }
  if (isCapabilityDecisionReceipt(receipt)) {
    return capabilityReceiptMetadataToBadgeView(receipt!.metadata);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Velum handoff / review badge helpers
// ---------------------------------------------------------------------------

export function isVelumHandoffOrReviewReceipt(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): boolean {
  if (!receipt) return false;
  return (
    receipt.action === "velum-handoff.preparation" ||
    receipt.action === "velum-review.completed"
  );
}

export function velumHandoffReceiptToBadgeView(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): CapabilityBadgeView | null {
  if (!isVelumHandoffOrReviewReceipt(receipt)) return null;

  const isReviewCompleted = receipt!.action === "velum-review.completed";
  const meta = receipt!.metadata;
  const velumReviewPassed = meta?.velumReviewPassed === true;

  if (isReviewCompleted) {
    return {
      label: "Velum review complete",
      tone: "local",
      shortDescription: "Velum review was marked complete locally.",
      detail: velumReviewPassed
        ? "Velum review has been completed. Cloud consent may be offered next, but nothing has been sent."
        : "Velum review completion was recorded. Nothing has been sent.",
      cloudUsed: false,
      localAttemptAllowed: true,
      cloudAllowed: false,
    };
  }

  return {
    label: "Velum prep recorded",
    tone: "limited",
    shortDescription: "Velum review preparation was recorded locally.",
    detail: "Velum review is required before cloud consent can be offered. Nothing has been sent.",
    cloudUsed: false,
    localAttemptAllowed: true,
    cloudAllowed: false,
  };
}

// ---------------------------------------------------------------------------
// Gateway policy decision badge helpers
// ---------------------------------------------------------------------------

type BoundaryString = "chat" | "tool-use" | "cloud-escalation" | "provider-switch" | "receipt-write" | "velum-handoff";
type BlockedByString = "prompt-injection" | "velum-required" | "consent-required" | "policy" | "none";

function isBoundary(value: unknown): value is BoundaryString {
  return (
    value === "chat" ||
    value === "tool-use" ||
    value === "cloud-escalation" ||
    value === "provider-switch" ||
    value === "receipt-write" ||
    value === "velum-handoff"
  );
}

function policyLabel(boundary: BoundaryString, allowed: boolean, blockedBy: BlockedByString): string {
  if (boundary === "receipt-write") return "Receipts preserved";
  if (boundary === "velum-handoff") return "Velum handoff allowed";

  const names: Record<BoundaryString, string> = {
    chat: "Chat",
    "tool-use": "Tool boundary",
    "cloud-escalation": "Cloud boundary",
    "provider-switch": "Provider switch",
    "receipt-write": "Receipts",
    "velum-handoff": "Velum handoff",
  };
  const name = names[boundary];

  if (!allowed && blockedBy === "velum-required") return "Velum required";
  return `${name} ${allowed ? "allowed" : "blocked"}`;
}

function policyTone(allowed: boolean, blockedBy: BlockedByString, requireVelum: boolean): CapabilityBadgeTone {
  if (!allowed && (blockedBy === "prompt-injection" || blockedBy === "policy")) return "blocked";
  if (!allowed && blockedBy === "velum-required") return "limited";
  if (requireVelum) return "limited";
  return allowed ? "neutral" : "blocked";
}

function policyShort(boundary: BoundaryString, allowed: boolean, blockedBy: BlockedByString): string {
  if (boundary === "receipt-write") return "Receipt writing was preserved by gateway policy.";
  if (boundary === "velum-handoff") return "Velum review/handoff was allowed by gateway policy.";
  if (allowed) return `Gateway policy allowed the ${boundary} boundary to proceed.`;
  if (blockedBy === "velum-required") return `Gateway policy requires Velum review before ${boundary}.`;
  return `Gateway policy blocked the ${boundary} boundary.`;
}

function policyDetail(boundary: BoundaryString, allowed: boolean, blockedBy: BlockedByString): string {
  if (boundary === "receipt-write") return "Gateway policy preserved receipt writing.";
  if (boundary === "velum-handoff") return "Gateway policy allowed review and handoff to Velum.";

  if (allowed) {
    if (boundary === "cloud-escalation") {
      return "Gateway policy allowed the cloud escalation boundary to proceed to consent and review. This does not mean cloud was used.";
    }
    return `Gateway policy allowed the ${boundary} boundary to proceed. This does not mean the action was executed.`;
  }
  if (blockedBy === "velum-required") {
    return `Gateway policy requires Velum review before the ${boundary} boundary can proceed.`;
  }
  if (blockedBy === "prompt-injection") {
    return `Gateway policy blocked the ${boundary} boundary because of prompt-injection risk.`;
  }
  return `Gateway policy blocked the ${boundary} boundary.`;
}

/**
 * Detect whether a ActivityLog receipt represents a gateway policy decision.
 */
export function isGatewayPolicyDecisionReceipt(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): boolean {
  if (!receipt) return false;
  if (receipt.action === "security.gateway-policy.decision") return true;
  const meta = receipt.metadata;
  if (!meta || typeof meta !== "object") return false;
  return isBoundary(meta.boundary) && typeof meta.allowed === "boolean";
}

/**
 * Build a badge view from a gateway policy decision receipt's metadata.
 * Returns null when the receipt is not a gateway policy decision.
 */
export function gatewayPolicyReceiptToBadgeView(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): CapabilityBadgeView | null {
  if (!isGatewayPolicyDecisionReceipt(receipt)) return null;
  const meta = receipt!.metadata!;

  const boundary = isBoundary(meta.boundary) ? meta.boundary : "chat";
  const allowed = meta.allowed === true;
  const blockedBy = (typeof meta.blockedBy === "string" ? meta.blockedBy : "none") as BlockedByString;
  const requireVelum = meta.shouldRequireVelumReview === true;

  return {
    label: policyLabel(boundary, allowed, blockedBy),
    tone: policyTone(allowed, blockedBy, requireVelum),
    shortDescription: policyShort(boundary, allowed, blockedBy),
    detail: policyDetail(boundary, allowed, blockedBy),
    cloudUsed: false,
    localAttemptAllowed: true,
    cloudAllowed: false,
  };
}

// ---------------------------------------------------------------------------
// Prompt-injection assessment badge helpers
// ---------------------------------------------------------------------------

type InjectionRiskString = "none" | "low" | "medium" | "high" | "critical";

function isInjectionRisk(value: unknown): value is InjectionRiskString {
  return (
    value === "none" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  );
}

const INJECTION_LABELS: Record<InjectionRiskString, string> = {
  none: "Gateway check passed",
  low: "Gateway low risk",
  medium: "Gateway review advised",
  high: "Gateway restricted",
  critical: "Gateway blocked",
};

const INJECTION_TONES: Record<InjectionRiskString, CapabilityBadgeTone> = {
  none: "local",
  low: "neutral",
  medium: "limited",
  high: "blocked",
  critical: "blocked",
};

const INJECTION_SHORT: Record<InjectionRiskString, string> = {
  none: "No prompt-injection issues found.",
  low: "Minor prompt-injection signals; no action needed.",
  medium: "Suspicious instructions detected; Velum review may be required.",
  high: "High-risk injected instructions may restrict tool or cloud actions.",
  critical: "High-risk injected instructions blocked before tool or cloud use.",
};

function injectionDetail(
  riskLevel: InjectionRiskString,
  blockTool: boolean,
  blockCloud: boolean,
  requireVelum: boolean,
  warnUser: boolean,
): string {
  const parts: string[] = [];

  if (riskLevel === "none" || riskLevel === "low") {
    parts.push("Gateway found no blocking prompt-injection issue.");
    return parts.join(" ");
  }

  parts.push(INJECTION_SHORT[riskLevel]);

  if (blockCloud) {
    parts.push("Cloud escalation is restricted for this input.");
  }
  if (blockTool) {
    parts.push("Tool use is restricted for this input.");
  }
  if (requireVelum) {
    parts.push("Velum review is required before tool or cloud actions.");
  }
  if (warnUser && !blockCloud && !blockTool) {
    parts.push("A warning was shown to the user.");
  }

  return parts.join(" ");
}

/**
 * Detect whether a ActivityLog receipt represents a prompt-injection assessment.
 */
export function isPromptInjectionAssessmentReceipt(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): boolean {
  if (!receipt) return false;
  if (receipt.action === "security.prompt-injection.assessment") return true;
  const meta = receipt.metadata;
  if (!meta || typeof meta !== "object") return false;
  return isInjectionRisk(meta.riskLevel) && typeof meta.findingCount === "number";
}

/**
 * Build a badge view from a prompt-injection assessment receipt's metadata.
 * Returns null when the receipt is not a prompt-injection assessment.
 */
export function promptInjectionReceiptToBadgeView(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): CapabilityBadgeView | null {
  if (!isPromptInjectionAssessmentReceipt(receipt)) return null;
  const meta = receipt!.metadata!;

  const riskLevel = isInjectionRisk(meta.riskLevel) ? meta.riskLevel : "none";
  const blockTool = meta.shouldBlockToolUse === true;
  const blockCloud = meta.shouldBlockCloudEscalation === true;
  const requireVelum = meta.shouldRequireVelumReview === true;
  const warnUser = meta.shouldWarnUser === true;

  return {
    label: INJECTION_LABELS[riskLevel],
    tone: INJECTION_TONES[riskLevel],
    shortDescription: INJECTION_SHORT[riskLevel],
    detail: injectionDetail(riskLevel, blockTool, blockCloud, requireVelum, warnUser),
    cloudUsed: false,
    localAttemptAllowed: true,
    cloudAllowed: false,
  };
}

// ---------------------------------------------------------------------------
// Cloud consent decision badge helpers
// ---------------------------------------------------------------------------

type ConsentDecisionString = "granted" | "denied" | "cancelled" | "blocked";

function isConsentDecision(value: unknown): value is ConsentDecisionString {
  return (
    value === "granted" ||
    value === "denied" ||
    value === "cancelled" ||
    value === "blocked"
  );
}

const CONSENT_DECISION_LABELS: Record<ConsentDecisionString, string> = {
  granted: "Cloud consent granted",
  denied: "Cloud consent denied",
  cancelled: "Cloud consent cancelled",
  blocked: "Cloud consent blocked",
};

const CONSENT_DECISION_TONES: Record<ConsentDecisionString, CapabilityBadgeTone> = {
  granted: "cloud-optional",
  denied: "blocked",
  cancelled: "neutral",
  blocked: "blocked",
};

const CONSENT_DECISION_SHORT: Record<ConsentDecisionString, string> = {
  granted: "Permission granted. Nothing has been sent by this receipt.",
  denied: "Cloud use was denied. Peh will keep this local.",
  cancelled: "No cloud decision was made. Nothing has been sent.",
  blocked: "Cloud use is blocked. Nothing has been sent.",
};

function consentDecisionDetail(
  decision: ConsentDecisionString,
  nothingSentYet: boolean,
  requiresVelumReview: boolean,
  velumReviewPassed: boolean,
): string {
  const parts: string[] = [];

  if (nothingSentYet) {
    parts.push("Nothing has been sent to any cloud provider.");
  }

  switch (decision) {
    case "granted":
      parts.push(
        "Cloud permission was granted for this capability. This receipt records the permission decision only — it does not mean a cloud call was made.",
      );
      break;
    case "denied":
      parts.push(
        "You denied cloud access. Peh will keep this local or stop this action.",
      );
      break;
    case "cancelled":
      parts.push(
        "The cloud consent dialog was closed without a decision. Nothing was sent.",
      );
      break;
    case "blocked":
      parts.push(
        "Cloud use is blocked for this capability. Nothing was sent.",
      );
      break;
  }

  if (requiresVelumReview && !velumReviewPassed) {
    parts.push("Velum review is required before any data can be sent to the cloud.");
  } else if (requiresVelumReview && velumReviewPassed) {
    parts.push("Velum review has been completed.");
  }

  return parts.join(" ");
}

/**
 * Detect whether a ActivityLog receipt represents a cloud consent decision.
 */
export function isCloudConsentDecisionReceipt(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): boolean {
  if (!receipt) return false;
  const action = receipt.action ?? "";
  if (
    action === "cloud-consent.granted" ||
    action === "cloud-consent.denied" ||
    action === "cloud-consent.cancelled" ||
    action === "cloud-consent.blocked"
  ) {
    return true;
  }
  const meta = receipt.metadata;
  if (!meta || typeof meta !== "object") return false;
  return (
    typeof meta.escalationPacketId === "string" &&
    isConsentDecision(meta.decision)
  );
}

/**
 * Build a badge view from a cloud consent decision receipt's metadata.
 * Returns null when the receipt is not a cloud consent decision.
 */
export function cloudConsentReceiptToBadgeView(
  receipt: Readonly<{
    action?: string;
    metadata?: Readonly<Record<string, string | number | boolean>> | null;
  }> | null | undefined,
): CapabilityBadgeView | null {
  if (!isCloudConsentDecisionReceipt(receipt)) return null;
  const meta = receipt!.metadata!;

  const decision = isConsentDecision(meta.decision)
    ? meta.decision
    : actionToDecision(receipt!.action ?? "");
  if (!decision) return null;

  const nothingSentYet = meta.nothingSentYet === true;
  const requiresVelumReview = meta.requiresVelumReview === true;
  const velumReviewPassed = meta.velumReviewPassed === true;

  return {
    label: CONSENT_DECISION_LABELS[decision],
    tone: CONSENT_DECISION_TONES[decision],
    shortDescription: CONSENT_DECISION_SHORT[decision],
    detail: consentDecisionDetail(decision, nothingSentYet, requiresVelumReview, velumReviewPassed),
    cloudUsed: false,
    localAttemptAllowed: false,
    cloudAllowed: decision === "granted",
  };
}

function actionToDecision(action: string): ConsentDecisionString | null {
  if (action === "cloud-consent.granted") return "granted";
  if (action === "cloud-consent.denied") return "denied";
  if (action === "cloud-consent.cancelled") return "cancelled";
  if (action === "cloud-consent.blocked") return "blocked";
  return null;
}

/** Re-exported types so consumers can pick up the badge tone enum easily. */
export type { CapabilityProviderMode, CapabilityRuntimeState, CapabilityTier };
