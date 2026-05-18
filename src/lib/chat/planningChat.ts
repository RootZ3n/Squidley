/**
 * Chat adapter for the Structured Planning + Provenance Layer.
 *
 * Pure: no IO, no model calls. Tests pass inspectedFiles directly; the
 * route extracts them from the chat request body.
 *
 * Hard rules:
 *   - The reply is the rendered plan text — never a fabricated
 *     pretend-the-model-answered string.
 *   - cloudUsed = false on every receipt and on the summary.
 *   - The plan never claims a file was inspected unless it was supplied
 *     in `inspectedFiles`. This is enforced by buildPlan() upstream.
 */

import type { TabulariumReceipt } from "@/lib/tabularium/receipts";
import {
  buildPlan,
  buildProvenanceReport,
  renderPlanAsText,
  type ExecutionPlan,
  type InspectedFileEvidence,
  type PlanProvenanceReport,
  type PlanConfidenceLevel,
  type PlanRiskLevel,
} from "@/lib/planning";

export interface PlanningChatRequest {
  readonly message: string;
  readonly inspectedFiles?: readonly InspectedFileEvidence[];
  readonly priorReceipts?: readonly TabulariumReceipt[];
  readonly now?: () => number;
}

export interface PlanningChatSummary {
  readonly id: string;
  readonly userGoal: string;
  readonly confidence: PlanConfidenceLevel;
  readonly confidenceReasoning: string;
  readonly riskLevel: PlanRiskLevel;
  readonly stepCount: number;
  readonly requiresApproval: boolean;
  readonly suggestedNextInspections: readonly string[];
  /** Receipt action ids for audit. */
  readonly receiptActions: readonly string[];
  readonly cloudUsed: false;
  readonly localOnly: true;
}

export interface PlanningChatResult {
  readonly reply: string;
  readonly plan: ExecutionPlan;
  readonly provenance: PlanProvenanceReport;
  readonly summary: PlanningChatSummary;
  readonly ok: boolean;
}

export function runPlanningForChat(
  args: PlanningChatRequest,
): PlanningChatResult {
  const plan = buildPlan({
    userGoal: args.message,
    inspectedFiles: args.inspectedFiles,
    priorReceipts: args.priorReceipts,
    now: args.now,
  });
  const provenance = buildProvenanceReport(plan);
  const reply = renderPlanAsText(plan);
  const summary: PlanningChatSummary = {
    id: plan.id,
    userGoal: plan.userGoal,
    confidence: plan.confidence.overall,
    confidenceReasoning: plan.confidence.reasoning,
    riskLevel: plan.riskLevel,
    stepCount: plan.steps.length,
    requiresApproval: plan.requiresApproval,
    suggestedNextInspections: plan.suggestedNextInspections,
    receiptActions: plan.receipts.map((r) => r.action),
    cloudUsed: false,
    localOnly: true,
  };
  return {
    reply,
    plan,
    provenance,
    summary,
    ok: plan.riskLevel !== "blocked",
  };
}
