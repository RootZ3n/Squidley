/**
 * Cloud escalation policy for Peh.
 *
 * Defines when and how local-to-cloud escalation may happen.
 * In Local Mode: no escalation, ever.
 * In Cloud Mode: escalation requires explicit policy, consent, and receipt.
 */

import type { PehMode, ModeState } from "./types";
import type { ModeCapabilityStatus } from "./capabilityMatrix";

export interface EscalationRequest {
  /** The capability being requested. */
  capabilityId: string;
  /** Current operating mode. */
  mode: PehMode;
  /** Mode state at request time. */
  modeState: ModeState;
  /** Local capability status. */
  localStatus: ModeCapabilityStatus;
  /** Cloud capability status. */
  cloudStatus: ModeCapabilityStatus;
  /** Whether a cloud provider is configured. */
  cloudProviderConfigured: boolean;
  /** Whether cloud consent has been granted. */
  cloudConsentGranted: boolean;
  /** Whether Velum review has passed for this content. */
  velumReviewPassed: boolean;
}

export type EscalationDecision =
  | { allowed: false; reason: string; suggestCloudMode: boolean }
  | {
      allowed: true;
      reason: string;
      requiresConsent: boolean;
      requiresVelum: boolean;
      requiresApproval: boolean;
    };

/**
 * Decide whether cloud escalation is allowed for a capability request.
 * Pure function, no I/O.
 */
export function decideEscalation(request: EscalationRequest): EscalationDecision {
  // Local Mode: no cloud escalation, period.
  if (request.mode === "local") {
    const canCloudHelp =
      request.cloudStatus === "READY" ||
      request.cloudStatus === "PARTIAL" ||
      request.cloudStatus === "REQUIRES_PROVIDER";
    return {
      allowed: false,
      reason: "Cloud escalation is not available in Local Mode.",
      suggestCloudMode: canCloudHelp,
    };
  }

  // Cloud Mode checks
  if (!request.modeState.cloudUnlocked) {
    return {
      allowed: false,
      reason: "Cloud is not unlocked in the current mode state.",
      suggestCloudMode: false,
    };
  }

  if (!request.cloudProviderConfigured) {
    return {
      allowed: false,
      reason: "No cloud provider is configured. Configure a provider to enable cloud capabilities.",
      suggestCloudMode: false,
    };
  }

  if (request.cloudStatus === "NOT_IMPLEMENTED") {
    return {
      allowed: false,
      reason: "This capability is not implemented for Cloud Mode yet.",
      suggestCloudMode: false,
    };
  }

  if (request.cloudStatus === "BLOCKED" || request.cloudStatus === "DISABLED") {
    return {
      allowed: false,
      reason: "This capability is blocked or disabled in Cloud Mode.",
      suggestCloudMode: false,
    };
  }

  // Cloud is viable — check consent and review gates
  const requiresConsent = !request.cloudConsentGranted;
  const requiresVelum = !request.velumReviewPassed;
  const requiresApproval =
    request.cloudStatus === "REQUIRES_APPROVAL" ||
    request.cloudStatus === "REQUIRES_CONSENT";

  return {
    allowed: true,
    reason: `Cloud escalation available for ${request.capabilityId}.`,
    requiresConsent,
    requiresVelum,
    requiresApproval,
  };
}

/**
 * Format escalation decision as a user-friendly message.
 */
export function escalationMessage(
  decision: EscalationDecision,
  capabilityName: string,
): string {
  if (!decision.allowed) {
    const suggest = decision.suggestCloudMode
      ? " Cloud Mode may support this when enabled."
      : "";
    return `${capabilityName}: ${decision.reason}${suggest}`;
  }

  const gates: string[] = [];
  if (decision.requiresConsent) gates.push("cloud consent");
  if (decision.requiresVelum) gates.push("content review");
  if (decision.requiresApproval) gates.push("explicit approval");

  if (gates.length === 0) {
    return `${capabilityName}: Cloud escalation available.`;
  }
  return `${capabilityName}: Cloud escalation available, requires ${gates.join(", ")}.`;
}
