/**
 * Gateway policy decision receipt helpers and Tabularium adapter.
 *
 * Records what boundary decision the gateway policy made (allowed, blocked,
 * Velum-required) so it can be audited separately from detection.
 *
 * Hard constraints:
 *   - Pure except recordGatewayPolicyDecisionReceipt (which writes via
 *     supplied storage only).
 *   - No fetch. No provider calls. No cloud calls. No model calls.
 *   - No raw user/prompt/injected text in any receipt field.
 */

import type {
  GatewayBoundary,
  GatewayBlockedBy,
  GatewayPolicyDecision,
} from "./gatewayPolicy";
import type {
  PromptInjectionRecommendedAction,
  PromptInjectionRiskLevel,
} from "./promptInjection";
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

export const GATEWAY_POLICY_DECISION_TYPE =
  "security.gateway-policy.decision" as const;
export const GATEWAY_POLICY_DECISION_ACTION =
  "security.gateway-policy.decision" as const;

// ---------------------------------------------------------------------------
// Receipt event
// ---------------------------------------------------------------------------

export interface GatewayPolicyDecisionReceiptEvent {
  type: typeof GATEWAY_POLICY_DECISION_TYPE;
  boundary: GatewayBoundary;
  allowed: boolean;
  shouldWarnUser: boolean;
  shouldRequireVelumReview: boolean;
  shouldRecordReceipt: boolean;
  reason: string;
  riskLevel: PromptInjectionRiskLevel;
  categories: readonly string[];
  recommendedAction: PromptInjectionRecommendedAction;
  blockedBy: GatewayBlockedBy;
  createdAt: number;
}

export interface GatewayPolicyReceiptOptions {
  createdAt?: number;
  receiptId?: string;
  status?: TabulariumStatus;
}

// ---------------------------------------------------------------------------
// Event creation
// ---------------------------------------------------------------------------

export function createGatewayPolicyDecisionReceiptEvent(
  decision: GatewayPolicyDecision,
  options: Pick<GatewayPolicyReceiptOptions, "createdAt"> = {},
): GatewayPolicyDecisionReceiptEvent {
  return {
    type: GATEWAY_POLICY_DECISION_TYPE,
    boundary: decision.boundary,
    allowed: decision.allowed,
    shouldWarnUser: decision.shouldWarnUser,
    shouldRequireVelumReview: decision.shouldRequireVelumReview,
    shouldRecordReceipt: decision.shouldRecordReceipt,
    reason: decision.reason,
    riskLevel: decision.riskLevel,
    categories: [...decision.categories],
    recommendedAction: decision.recommendedAction,
    blockedBy: decision.blockedBy,
    createdAt: options.createdAt ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Tabularium adapter
// ---------------------------------------------------------------------------

const BOUNDARY_LABELS: Record<GatewayBoundary, string> = {
  chat: "chat",
  "tool-use": "tool use",
  "cloud-escalation": "cloud escalation",
  "provider-switch": "provider switching",
  "receipt-write": "receipt writing",
  "velum-handoff": "Velum handoff",
};

function buildSummary(event: GatewayPolicyDecisionReceiptEvent): string {
  const label = BOUNDARY_LABELS[event.boundary];
  if (event.boundary === "receipt-write") {
    return "Gateway policy preserved receipt writing.";
  }
  if (event.allowed) {
    if (event.shouldRequireVelumReview) {
      return `Gateway policy allowed ${label} with Velum review required.`;
    }
    return `Gateway policy allowed ${label} to continue.`;
  }
  if (event.blockedBy === "velum-required") {
    return `Gateway policy requires Velum review before ${label} can proceed.`;
  }
  return `Gateway policy blocked ${label} for this request.`;
}

function resolveStatus(
  event: GatewayPolicyDecisionReceiptEvent,
  override?: TabulariumStatus,
): TabulariumStatus {
  if (override) return override;
  if (!event.allowed) return "failed";
  return "info";
}

function buildMetadata(
  event: GatewayPolicyDecisionReceiptEvent,
): Record<string, string | number | boolean> {
  return {
    boundary: event.boundary,
    allowed: event.allowed,
    blockedBy: event.blockedBy,
    riskLevel: event.riskLevel,
    categories: event.categories.join(", ") || "none",
    recommendedAction: event.recommendedAction,
    shouldWarnUser: event.shouldWarnUser,
    shouldRequireVelumReview: event.shouldRequireVelumReview,
    shouldRecordReceipt: event.shouldRecordReceipt,
    reason: event.reason,
  };
}

export function gatewayPolicyDecisionToTabulariumReceiptInput(
  event: GatewayPolicyDecisionReceiptEvent,
  options: GatewayPolicyReceiptOptions = {},
): TabulariumReceiptInput {
  return {
    ...(options.receiptId !== undefined ? { id: options.receiptId } : {}),
    createdAt: event.createdAt,
    module: "system",
    action: GATEWAY_POLICY_DECISION_ACTION,
    status: resolveStatus(event, options.status),
    title: `Gateway policy: ${event.boundary} ${event.allowed ? "allowed" : "blocked"}`,
    summary: buildSummary(event),
    modelUsed: false,
    metadata: buildMetadata(event),
  };
}

export function createGatewayPolicyDecisionTabulariumReceipt(
  event: GatewayPolicyDecisionReceiptEvent,
  options: GatewayPolicyReceiptOptions = {},
): TabulariumReceipt {
  return createTabulariumReceipt(
    gatewayPolicyDecisionToTabulariumReceiptInput(event, options),
  );
}

/**
 * Record a gateway policy decision through the existing local Tabularium
 * pipeline. Returns the persisted receipt on success or null when storage
 * is unavailable. Never throws on storage failure.
 */
export function recordGatewayPolicyDecisionReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  decision: GatewayPolicyDecision,
  options: GatewayPolicyReceiptOptions = {},
): TabulariumReceipt | null {
  const event = createGatewayPolicyDecisionReceiptEvent(decision, options);
  return logTabulariumReceipt(
    storage,
    gatewayPolicyDecisionToTabulariumReceiptInput(event, options),
  );
}
