/**
 * Guarded cloud escalation preflight helper.
 *
 * Combines capability runtime decision, prompt-injection assessment,
 * gateway policy decision, cloud escalation packet creation, and safe
 * receipts into one preflight result for future cloud-capable flows.
 *
 * Hard constraints:
 *   - No cloud execution. No provider switching. No routing changes.
 *   - No global consent persistence.
 *   - nothingSentYet is always true.
 *   - cloudUsed is always false.
 *   - userTextForAssessment is used only for deterministic gateway
 *     assessment and is never written raw into receipts or returned.
 *   - No fetch. No provider calls. No model calls.
 *   - Storage writes only through supplied storage + existing receipt
 *     helpers, and only when recordReceipts=true.
 */

import type { CapabilityRuntimeDecision } from "./runtime";
import { resolveCapabilityRuntime, type AvailableProfile, type LocalModelInfo } from "./runtime";
import type { PromptInjectionAssessment } from "@/lib/security/promptInjection";
import { assessPromptInjectionRisk } from "@/lib/security/promptInjection";
import type { GatewayPolicyDecision } from "@/lib/security/gatewayPolicy";
import { evaluateGatewayPolicyForCloudEscalation } from "@/lib/security/gatewayPolicy";
import type { CloudEscalationPacket, CloudEscalationDataCategory } from "./cloudEscalation";
import { createCloudEscalationPacket, canOfferCloudEscalation } from "./cloudEscalation";
import { createCapabilityDecisionReceipt } from "./receipts";
import { createCapabilityDecisionActivityReceipt } from "./activity-log-adapter";
import { recordPromptInjectionAssessmentReceipt } from "@/lib/security/promptInjectionReceipts";
import { recordGatewayPolicyDecisionReceipt } from "@/lib/security/gatewayPolicyReceipts";
import { recordCloudEscalationOfferReceipt } from "./cloudEscalationReceipts";
import type { ActivityReceipt } from "@/lib/activity-log/receipts";
import { logActivityReceipt } from "@/lib/activity-log/receipts";
import { capabilityDecisionToActivityReceiptInput } from "./activity-log-adapter";

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export type GuardedCloudPreflightBlockedBy =
  | "none"
  | "capability"
  | "gateway-policy"
  | "velum-required"
  | "cloud-not-applicable";

export interface GuardedCloudPreflightInput {
  capabilityId: string;
  /** Only used for deterministic gateway assessment. Never written raw into receipts or results. */
  userTextForAssessment?: string;
  dataCategories: readonly CloudEscalationDataCategory[];
  availableLocalProfiles?: readonly AvailableProfile[];
  availableCloudProfiles?: readonly AvailableProfile[];
  localModels?: readonly LocalModelInfo[];
  cloudUnlocked: boolean;
  cloudConsentGranted: boolean;
  velumReviewPassed: boolean;
  providerId?: string;
  modelId?: string;
  createdAt?: number;
  recordReceipts?: boolean;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export interface GuardedCloudPreflightReceipts {
  capabilityReceipt: ActivityReceipt | null;
  assessmentReceipt: ActivityReceipt | null;
  policyReceipt: ActivityReceipt | null;
  offerReceipt: ActivityReceipt | null;
}

export interface GuardedCloudPreflightResult {
  capabilityDecision: CapabilityRuntimeDecision;
  promptInjectionAssessment: PromptInjectionAssessment;
  gatewayPolicyDecision: GatewayPolicyDecision;
  escalationPacket: CloudEscalationPacket | null;
  allowedToOfferCloud: boolean;
  requiresVelumReview: boolean;
  blockedBy: GuardedCloudPreflightBlockedBy;
  reason: string;
  receipts: GuardedCloudPreflightReceipts;
  nothingSentYet: true;
  cloudUsed: false;
}

// ---------------------------------------------------------------------------
// Core preflight
// ---------------------------------------------------------------------------

export function runGuardedCloudEscalationPreflight(
  input: GuardedCloudPreflightInput,
): GuardedCloudPreflightResult {
  const now = input.createdAt ?? Date.now();

  // Step 1: Resolve capability runtime decision
  const capabilityDecision = resolveCapabilityRuntime({
    capabilityId: input.capabilityId,
    availableLocalProfiles: input.availableLocalProfiles ?? [],
    availableCloudProfiles: input.availableCloudProfiles ?? [],
    localModels: input.localModels,
    cloudUnlocked: input.cloudUnlocked,
    cloudConsentGranted: input.cloudConsentGranted,
    velumReviewPassed: input.velumReviewPassed,
  });

  // Step 2: Assess prompt-injection risk
  const assessment = input.userTextForAssessment !== undefined
    ? assessPromptInjectionRisk(input.userTextForAssessment)
    : benignAssessment();

  // Step 3: Evaluate gateway policy for cloud-escalation boundary
  const gatewayPolicy = evaluateGatewayPolicyForCloudEscalation(assessment, {
    velumReviewPassed: input.velumReviewPassed,
  });

  // Step 4: Determine if cloud escalation is applicable
  const cloudApplicable = canOfferCloudEscalation(capabilityDecision);

  // Step 5: Create escalation packet if applicable
  let escalationPacket: CloudEscalationPacket | null = null;
  if (cloudApplicable) {
    escalationPacket = createCloudEscalationPacket(capabilityDecision, {
      createdAt: now,
      dataCategories: input.dataCategories,
      velumReviewPassed: input.velumReviewPassed,
    });
  }

  // Step 6: Determine blocking reason and allowedToOfferCloud
  let blockedBy: GuardedCloudPreflightBlockedBy = "none";
  let allowedToOfferCloud = false;
  let reason = "";
  const requiresVelumReview =
    gatewayPolicy.shouldRequireVelumReview ||
    capabilityDecision.requiresVelumReview;

  if (!cloudApplicable) {
    if (capabilityDecision.state === "BLOCKED") {
      blockedBy = "capability";
      reason = "Capability is blocked. Cloud escalation is not available.";
    } else if (
      capabilityDecision.state === "LOCAL_READY" ||
      capabilityDecision.state === "LOCAL_LIMITED"
    ) {
      blockedBy = "cloud-not-applicable";
      reason = "This capability runs locally. Cloud escalation is not applicable.";
    } else {
      blockedBy = "cloud-not-applicable";
      reason = "Cloud escalation is not applicable for this capability state.";
    }
  } else if (!gatewayPolicy.allowed) {
    if (gatewayPolicy.blockedBy === "velum-required") {
      blockedBy = "velum-required";
      reason = "Gateway policy requires Velum review before cloud escalation can proceed.";
    } else {
      blockedBy = "gateway-policy";
      reason = `Gateway policy blocked cloud escalation: ${gatewayPolicy.reason}`;
    }
  } else if (requiresVelumReview && !input.velumReviewPassed) {
    blockedBy = "velum-required";
    reason = "Velum review is required before cloud escalation can proceed.";
  } else if (escalationPacket) {
    allowedToOfferCloud = true;
    reason = "Cloud escalation preflight passed. An offer can be presented to the user.";
  }

  // Step 7: Record receipts if requested
  const receipts = recordPreflightReceipts(
    input,
    capabilityDecision,
    assessment,
    gatewayPolicy,
    escalationPacket,
    allowedToOfferCloud,
    now,
  );

  return {
    capabilityDecision,
    promptInjectionAssessment: assessment,
    gatewayPolicyDecision: gatewayPolicy,
    escalationPacket,
    allowedToOfferCloud,
    requiresVelumReview,
    blockedBy,
    reason,
    receipts,
    nothingSentYet: true,
    cloudUsed: false,
  };
}

// ---------------------------------------------------------------------------
// Benign assessment path (no user text provided)
// ---------------------------------------------------------------------------

function benignAssessment(): PromptInjectionAssessment {
  return {
    riskLevel: "none",
    categories: [],
    findings: [],
    recommendedAction: "allow",
    shouldBlockToolUse: false,
    shouldBlockCloudEscalation: false,
    shouldRequireVelumReview: false,
    shouldWarnUser: false,
    safeSummary: "No prompt-injection signals detected.",
    receiptHint: {
      riskLevel: "none",
      findingCount: 0,
      categories: "none",
      recommendedAction: "allow",
    },
  };
}

// ---------------------------------------------------------------------------
// Receipt recording
// ---------------------------------------------------------------------------

function recordPreflightReceipts(
  input: GuardedCloudPreflightInput,
  capabilityDecision: CapabilityRuntimeDecision,
  assessment: PromptInjectionAssessment,
  gatewayPolicy: GatewayPolicyDecision,
  escalationPacket: CloudEscalationPacket | null,
  allowedToOfferCloud: boolean,
  now: number,
): GuardedCloudPreflightReceipts {
  const empty: GuardedCloudPreflightReceipts = {
    capabilityReceipt: null,
    assessmentReceipt: null,
    policyReceipt: null,
    offerReceipt: null,
  };

  if (!input.recordReceipts || !input.storage) return empty;

  const storage = input.storage;
  const result = { ...empty };

  // Capability decision receipt
  try {
    const event = createCapabilityDecisionReceipt(capabilityDecision, {
      providerId: input.providerId,
      modelId: input.modelId,
      createdAt: now,
    });
    const receiptInput = capabilityDecisionToActivityReceiptInput(event);
    result.capabilityReceipt = logActivityReceipt(storage, receiptInput);
  } catch {
    // Receipt write failure must not break preflight.
  }

  // Prompt-injection assessment receipt
  try {
    result.assessmentReceipt = recordPromptInjectionAssessmentReceipt(
      storage,
      assessment,
      { createdAt: now },
    );
  } catch {
    // Receipt write failure must not break preflight.
  }

  // Gateway policy decision receipt
  try {
    result.policyReceipt = recordGatewayPolicyDecisionReceipt(
      storage,
      gatewayPolicy,
      { createdAt: now },
    );
  } catch {
    // Receipt write failure must not break preflight.
  }

  // Cloud escalation offer receipt — only when packet exists and policy
  // allows the offer (or when recording a blocked offer is consistent
  // with existing behavior: the offer receipt records what was offered,
  // not what was executed).
  if (escalationPacket) {
    try {
      result.offerReceipt = recordCloudEscalationOfferReceipt(
        storage,
        escalationPacket,
        { createdAt: now },
      );
    } catch {
      // Receipt write failure must not break preflight.
    }
  }

  return result;
}
