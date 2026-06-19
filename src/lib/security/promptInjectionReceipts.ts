/**
 * Prompt-injection assessment receipt helpers and ActivityLog adapter.
 *
 * Turns a PromptInjectionAssessment into an auditable receipt event and
 * ActivityLog receipt input. The record helper may write through the
 * existing logActivityReceipt path but does nothing else.
 *
 * Hard constraints:
 *   - Pure except recordPromptInjectionAssessmentReceipt (which writes
 *     via supplied storage only).
 *   - No fetch. No provider calls. No cloud calls. No model calls.
 *   - Receipt metadata must not include raw user/prompt/document/code/
 *     image/secret contents.
 *   - safeExcerpt values are already sanitized and length-limited by the
 *     gateway; we copy them as-is.
 *   - These receipts are audit metadata, not moral judgment of the user.
 */

import type {
  PromptInjectionAssessment,
  PromptInjectionRiskLevel,
  PromptInjectionRecommendedAction,
  PromptInjectionCategory,
} from "./promptInjection";
import {
  createActivityReceipt,
  logActivityReceipt,
  type ActivityReceipt,
  type ActivityReceiptInput,
  type ActivityStatus,
} from "@/lib/activity-log/receipts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PROMPT_INJECTION_ASSESSMENT_TYPE =
  "security.prompt-injection.assessment" as const;
export const PROMPT_INJECTION_ASSESSMENT_ACTION =
  "security.prompt-injection.assessment" as const;

// ---------------------------------------------------------------------------
// Receipt event
// ---------------------------------------------------------------------------

export interface PromptInjectionAssessmentReceiptEvent {
  type: typeof PROMPT_INJECTION_ASSESSMENT_TYPE;
  riskLevel: PromptInjectionRiskLevel;
  categories: readonly PromptInjectionCategory[];
  recommendedAction: PromptInjectionRecommendedAction;
  shouldBlockToolUse: boolean;
  shouldBlockCloudEscalation: boolean;
  shouldRequireVelumReview: boolean;
  shouldWarnUser: boolean;
  findingCount: number;
  matchedPatternIds: readonly string[];
  safeSummary: string;
  safeExcerpts: readonly string[];
  createdAt: number;
}

export interface PromptInjectionReceiptOptions {
  createdAt?: number;
  receiptId?: string;
  status?: ActivityStatus;
}

// ---------------------------------------------------------------------------
// Event creation
// ---------------------------------------------------------------------------

export function createPromptInjectionAssessmentReceiptEvent(
  assessment: PromptInjectionAssessment,
  options: Pick<PromptInjectionReceiptOptions, "createdAt"> = {},
): PromptInjectionAssessmentReceiptEvent {
  const excerpts: string[] = [];
  const patternIds: string[] = [];
  for (const finding of assessment.findings) {
    patternIds.push(finding.matchedPatternId);
    if (finding.safeExcerpt) {
      excerpts.push(finding.safeExcerpt);
    }
  }

  return {
    type: PROMPT_INJECTION_ASSESSMENT_TYPE,
    riskLevel: assessment.riskLevel,
    categories: [...assessment.categories],
    recommendedAction: assessment.recommendedAction,
    shouldBlockToolUse: assessment.shouldBlockToolUse,
    shouldBlockCloudEscalation: assessment.shouldBlockCloudEscalation,
    shouldRequireVelumReview: assessment.shouldRequireVelumReview,
    shouldWarnUser: assessment.shouldWarnUser,
    findingCount: assessment.findings.length,
    matchedPatternIds: patternIds,
    safeSummary: assessment.safeSummary,
    safeExcerpts: excerpts,
    createdAt: options.createdAt ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// ActivityLog adapter
// ---------------------------------------------------------------------------

const RISK_SUMMARIES: Record<PromptInjectionRiskLevel, string> = {
  none: "Gateway prompt-injection check found no blocking issue.",
  low: "Gateway prompt-injection check found no blocking issue.",
  medium:
    "Gateway found suspicious instructions and recommends Velum review.",
  high:
    "Gateway found high-risk injected instructions. Tool or cloud actions may be restricted.",
  critical:
    "Gateway blocked high-risk injected instructions before tool or cloud use.",
};

function resolveStatus(
  riskLevel: PromptInjectionRiskLevel,
  override?: ActivityStatus,
): ActivityStatus {
  if (override) return override;
  if (riskLevel === "none" || riskLevel === "low") return "info";
  // medium/high/critical → "failed" is the closest available status
  // to "warning/blocked" in ActivityLog's status union.
  return "failed";
}

function buildMetadata(
  event: PromptInjectionAssessmentReceiptEvent,
): Record<string, string | number | boolean> {
  // Stay within ActivityLog metadata cap of 16.
  const meta: Record<string, string | number | boolean> = {
    riskLevel: event.riskLevel,
    categories: event.categories.join(", ") || "none",
    recommendedAction: event.recommendedAction,
    shouldBlockToolUse: event.shouldBlockToolUse,
    shouldBlockCloudEscalation: event.shouldBlockCloudEscalation,
    shouldRequireVelumReview: event.shouldRequireVelumReview,
    shouldWarnUser: event.shouldWarnUser,
    findingCount: event.findingCount,
    matchedPatternIds: event.matchedPatternIds.join(", ") || "none",
    safeSummary: event.safeSummary,
  };
  if (event.safeExcerpts.length > 0) {
    meta.safeExcerpts = event.safeExcerpts.join(" | ");
  }
  return meta;
}

export function promptInjectionAssessmentToActivityReceiptInput(
  event: PromptInjectionAssessmentReceiptEvent,
  options: PromptInjectionReceiptOptions = {},
): ActivityReceiptInput {
  return {
    ...(options.receiptId !== undefined ? { id: options.receiptId } : {}),
    createdAt: event.createdAt,
    module: "system",
    action: PROMPT_INJECTION_ASSESSMENT_ACTION,
    status: resolveStatus(event.riskLevel, options.status),
    title: `Prompt injection assessment: ${event.riskLevel}`,
    summary: RISK_SUMMARIES[event.riskLevel],
    modelUsed: false,
    metadata: buildMetadata(event),
  };
}

export function createPromptInjectionAssessmentActivityReceipt(
  event: PromptInjectionAssessmentReceiptEvent,
  options: PromptInjectionReceiptOptions = {},
): ActivityReceipt {
  return createActivityReceipt(
    promptInjectionAssessmentToActivityReceiptInput(event, options),
  );
}

/**
 * Record a prompt-injection assessment through the existing local
 * ActivityLog pipeline. Returns the persisted receipt on success or null
 * when storage is unavailable. Never throws on storage failure.
 */
export function recordPromptInjectionAssessmentReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  assessment: PromptInjectionAssessment,
  options: PromptInjectionReceiptOptions = {},
): ActivityReceipt | null {
  const event = createPromptInjectionAssessmentReceiptEvent(
    assessment,
    options,
  );
  return logActivityReceipt(
    storage,
    promptInjectionAssessmentToActivityReceiptInput(event, options),
  );
}
