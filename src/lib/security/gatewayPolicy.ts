/**
 * Gateway policy boundary decisions.
 *
 * Translates a PromptInjectionAssessment into deterministic enforcement
 * decisions for each system boundary (chat, tool-use, cloud escalation,
 * provider switching, receipt writing, Velum handoff).
 *
 * Hard constraints:
 *   - Pure. No fetch. No provider calls. No cloud calls. No model calls.
 *   - No localStorage writes.
 *   - Does not execute tools, grant consent, or call cloud.
 *   - Does not block normal chat by default.
 *   - Policy decisions contain no raw prompt/user text.
 */

import type {
  PromptInjectionAssessment,
  PromptInjectionCategory,
  PromptInjectionRecommendedAction,
  PromptInjectionRiskLevel,
} from "./promptInjection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GatewayBoundary =
  | "chat"
  | "tool-use"
  | "cloud-escalation"
  | "provider-switch"
  | "receipt-write"
  | "velum-handoff";

export type GatewayBlockedBy =
  | "prompt-injection"
  | "velum-required"
  | "consent-required"
  | "policy"
  | "none";

export interface GatewayPolicyDecision {
  boundary: GatewayBoundary;
  allowed: boolean;
  shouldWarnUser: boolean;
  shouldRequireVelumReview: boolean;
  shouldRecordReceipt: boolean;
  reason: string;
  riskLevel: PromptInjectionRiskLevel;
  categories: readonly PromptInjectionCategory[];
  recommendedAction: PromptInjectionRecommendedAction;
  blockedBy: GatewayBlockedBy;
}

export interface GatewayPolicyOptions {
  velumReviewPassed?: boolean;
  blockChatOnCritical?: boolean;
}

// ---------------------------------------------------------------------------
// Risk helpers
// ---------------------------------------------------------------------------

const RISK_ORDER: Record<PromptInjectionRiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function riskAtLeast(
  level: PromptInjectionRiskLevel,
  threshold: PromptInjectionRiskLevel,
): boolean {
  return RISK_ORDER[level] >= RISK_ORDER[threshold];
}

function hasCategory(
  assessment: PromptInjectionAssessment,
  category: PromptInjectionCategory,
): boolean {
  return assessment.categories.includes(category);
}

// ---------------------------------------------------------------------------
// Base builder
// ---------------------------------------------------------------------------

function allow(
  boundary: GatewayBoundary,
  assessment: PromptInjectionAssessment,
  reason: string,
): GatewayPolicyDecision {
  return {
    boundary,
    allowed: true,
    shouldWarnUser: assessment.shouldWarnUser,
    shouldRequireVelumReview: assessment.shouldRequireVelumReview,
    shouldRecordReceipt: true,
    reason,
    riskLevel: assessment.riskLevel,
    categories: [...assessment.categories],
    recommendedAction: assessment.recommendedAction,
    blockedBy: "none",
  };
}

function block(
  boundary: GatewayBoundary,
  assessment: PromptInjectionAssessment,
  reason: string,
  blockedBy: GatewayBlockedBy,
): GatewayPolicyDecision {
  return {
    boundary,
    allowed: false,
    shouldWarnUser: true,
    shouldRequireVelumReview: true,
    shouldRecordReceipt: true,
    reason,
    riskLevel: assessment.riskLevel,
    categories: [...assessment.categories],
    recommendedAction: assessment.recommendedAction,
    blockedBy,
  };
}

// ---------------------------------------------------------------------------
// Boundary evaluators
// ---------------------------------------------------------------------------

export function evaluateGatewayPolicyForChat(
  assessment: PromptInjectionAssessment,
  options: GatewayPolicyOptions = {},
): GatewayPolicyDecision {
  if (
    options.blockChatOnCritical &&
    riskAtLeast(assessment.riskLevel, "critical")
  ) {
    return block(
      "chat",
      assessment,
      "Chat blocked due to critical prompt-injection risk.",
      "prompt-injection",
    );
  }
  if (riskAtLeast(assessment.riskLevel, "medium")) {
    return {
      ...allow("chat", assessment, "Chat allowed with warning."),
      shouldWarnUser: true,
    };
  }
  return allow("chat", assessment, "No prompt-injection concern for chat.");
}

export function evaluateGatewayPolicyForCloudEscalation(
  assessment: PromptInjectionAssessment,
  options: GatewayPolicyOptions = {},
): GatewayPolicyDecision {
  if (assessment.shouldBlockCloudEscalation) {
    return block(
      "cloud-escalation",
      assessment,
      "Cloud escalation blocked: prompt injection attempts to hijack cloud controls.",
      "prompt-injection",
    );
  }
  if (riskAtLeast(assessment.riskLevel, "high")) {
    return block(
      "cloud-escalation",
      assessment,
      "Cloud escalation blocked: high-risk prompt-injection signals detected.",
      "prompt-injection",
    );
  }
  if (riskAtLeast(assessment.riskLevel, "medium")) {
    if (options.velumReviewPassed) {
      return allow(
        "cloud-escalation",
        assessment,
        "Cloud escalation allowed after Velum review for medium-risk input.",
      );
    }
    return block(
      "cloud-escalation",
      assessment,
      "Cloud escalation requires Velum review for medium-risk input.",
      "velum-required",
    );
  }
  return allow(
    "cloud-escalation",
    assessment,
    "No prompt-injection concern for cloud escalation.",
  );
}

export function evaluateGatewayPolicyForToolUse(
  assessment: PromptInjectionAssessment,
  options: GatewayPolicyOptions = {},
): GatewayPolicyDecision {
  if (assessment.shouldBlockToolUse) {
    return block(
      "tool-use",
      assessment,
      "Tool use blocked: prompt injection attempts to hijack tool execution.",
      "prompt-injection",
    );
  }
  if (hasCategory(assessment, "tool-hijack")) {
    return block(
      "tool-use",
      assessment,
      "Tool use blocked: tool-hijack pattern detected.",
      "prompt-injection",
    );
  }
  if (riskAtLeast(assessment.riskLevel, "high")) {
    return block(
      "tool-use",
      assessment,
      "Tool use blocked: high-risk prompt-injection signals detected.",
      "prompt-injection",
    );
  }
  if (riskAtLeast(assessment.riskLevel, "medium")) {
    if (options.velumReviewPassed) {
      return allow(
        "tool-use",
        assessment,
        "Tool use allowed after Velum review for medium-risk input.",
      );
    }
    return block(
      "tool-use",
      assessment,
      "Tool use requires Velum review for medium-risk input.",
      "velum-required",
    );
  }
  return allow(
    "tool-use",
    assessment,
    "No prompt-injection concern for tool use.",
  );
}

function evaluateGatewayPolicyForProviderSwitch(
  assessment: PromptInjectionAssessment,
  options: GatewayPolicyOptions = {},
): GatewayPolicyDecision {
  if (riskAtLeast(assessment.riskLevel, "medium")) {
    if (options.velumReviewPassed) {
      return allow(
        "provider-switch",
        assessment,
        "Provider switch allowed after Velum review.",
      );
    }
    return block(
      "provider-switch",
      assessment,
      "Provider switch blocked: Velum review required for medium+ risk input.",
      "velum-required",
    );
  }
  return allow(
    "provider-switch",
    assessment,
    "No prompt-injection concern for provider switch.",
  );
}

function evaluateGatewayPolicyForReceiptWrite(
  assessment: PromptInjectionAssessment,
): GatewayPolicyDecision {
  const reason = hasCategory(assessment, "receipt-suppression")
    ? "Receipt writing is explicitly preserved despite receipt-suppression attempt."
    : "Receipt writing is always allowed.";
  return allow("receipt-write", assessment, reason);
}

function evaluateGatewayPolicyForVelumHandoff(
  assessment: PromptInjectionAssessment,
): GatewayPolicyDecision {
  const decision = allow(
    "velum-handoff",
    assessment,
    riskAtLeast(assessment.riskLevel, "medium")
      ? "Velum handoff allowed; Velum review is recommended for this input."
      : "No prompt-injection concern for Velum handoff.",
  );
  if (riskAtLeast(assessment.riskLevel, "medium")) {
    decision.shouldRequireVelumReview = true;
  }
  return decision;
}

// ---------------------------------------------------------------------------
// Generic dispatcher
// ---------------------------------------------------------------------------

export function evaluateGatewayPolicyForBoundary(
  assessment: PromptInjectionAssessment,
  boundary: GatewayBoundary,
  options: GatewayPolicyOptions = {},
): GatewayPolicyDecision {
  switch (boundary) {
    case "chat":
      return evaluateGatewayPolicyForChat(assessment, options);
    case "tool-use":
      return evaluateGatewayPolicyForToolUse(assessment, options);
    case "cloud-escalation":
      return evaluateGatewayPolicyForCloudEscalation(assessment, options);
    case "provider-switch":
      return evaluateGatewayPolicyForProviderSwitch(assessment, options);
    case "receipt-write":
      return evaluateGatewayPolicyForReceiptWrite(assessment);
    case "velum-handoff":
      return evaluateGatewayPolicyForVelumHandoff(assessment);
  }
}
