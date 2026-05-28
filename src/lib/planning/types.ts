/**
 * Structured Planning + Provenance Layer — types.
 *
 * Plans are deterministic, evidence-backed descriptions of how Peh
 * *would* approach a local task. They are NOT execution: nothing in this
 * module performs IO, calls a model, or modifies state.
 *
 * Core philosophy enforced by the type shape:
 *   - Plans cite evidence by reference. The only way to mark a fact as
 *     "known" is to attach an EvidenceRef pointing to an inspected file
 *     or an existing receipt. Anything without an evidence ref must be
 *     labelled "inferred" or "assumed".
 *   - Confidence is `"high" | "medium" | "low"` — three honest buckets.
 *     No fake percentages.
 *   - Risk uses the project-wide vocabulary: safe | review | elevated |
 *     blocked. `blocked` plans return zero executable steps and a clear
 *     beginner-readable refusal.
 *   - Receipts are TabulariumReceipt instances so they round-trip with
 *     the rest of Peh's audit log.
 */

import type { TabulariumReceipt } from "@/lib/tabularium/receipts";

export type PlanRiskLevel = "safe" | "review" | "elevated" | "blocked";

export type PlanConfidenceLevel = "high" | "medium" | "low";

export type PlanStepStatus =
  | "proposed"
  | "needs-evidence"
  | "needs-approval"
  | "blocked";

export type EvidenceType =
  | "file"
  | "receipt"
  | "user_input"
  | "model_inference";

export interface EvidenceRef {
  readonly type: EvidenceType;
  /** For files: the path. For receipts: the receipt id. For user_input:
   *  a short label. For model_inference: a freeform tag. */
  readonly source: string;
  readonly confidence: PlanConfidenceLevel;
  readonly summary: string;
}

export interface PlanStep {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly status: PlanStepStatus;
  readonly requiredInputs: readonly string[];
  /** Tool ids the step would *consider*. Peh does not run them. */
  readonly suggestedTools: readonly string[];
  /** Files the step would benefit from but has not yet seen. */
  readonly relatedFiles: readonly string[];
  /** Evidence ids that informed this step (subset of plan.evidence). */
  readonly evidenceRefs: readonly string[];
  readonly blockedReason?: string;
  readonly userConfirmationRequired: boolean;
}

export interface PlanConfidence {
  readonly overall: PlanConfidenceLevel;
  readonly reasoning: string;
  readonly missingInformation: readonly string[];
  readonly assumptions: readonly string[];
}

export interface ExecutionPlan {
  readonly id: string;
  readonly userGoal: string;
  readonly confidence: PlanConfidence;
  readonly riskLevel: PlanRiskLevel;
  readonly requiresApproval: boolean;
  readonly estimatedComplexity: "trivial" | "small" | "medium" | "large";
  readonly createdAt: number;
  readonly steps: readonly PlanStep[];
  /** Map of id → evidence. Steps reference these by id. */
  readonly evidence: Readonly<Record<string, EvidenceRef>>;
  readonly limitations: readonly string[];
  /** Files the plan *suggests* inspecting next, never silently read. */
  readonly suggestedNextInspections: readonly string[];
  readonly receipts: readonly TabulariumReceipt[];
  /** Always false — planner never touches cloud. */
  readonly cloudUsed: false;
  /** Always true — planner is local-only. */
  readonly localOnly: true;
}

/** Receipt action ids emitted by the planner. */
export type PlanningReceiptAction =
  | "planning.started"
  | "planning.evidence-linked"
  | "planning.confidence-lowered"
  | "planning.decomposed"
  | "planning.completed"
  | "planning.blocked";

/**
 * Provenance view derived from a plan — what the UI renders. Pure
 * projection: no receipts, no IDs, no steps. Just "known / inferred /
 * missing" buckets the user can read at a glance.
 */
export interface PlanProvenanceReport {
  readonly userGoal: string;
  readonly confidence: PlanConfidenceLevel;
  readonly confidenceReasoning: string;
  /** Bullet items, each backed by an EvidenceRef of type "file" or "receipt". */
  readonly known: readonly string[];
  /** Inferred items (model_inference evidence). Marked "inferred:" in UI. */
  readonly inferred: readonly string[];
  /** Assumed items (user_input evidence). Marked "assumed:" in UI. */
  readonly assumed: readonly string[];
  /** Missing information — never claims to know. */
  readonly missing: readonly string[];
  /** Files Peh would *like* to see next, never silently read. */
  readonly suggestedNextInspections: readonly string[];
}

/**
 * Cheap stable id generator. Tests can pass a fixed `now` and counter
 * for reproducibility but the default is good enough for receipts.
 */
export function makePlanId(now: number = Date.now()): string {
  return `plan-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeStepId(planId: string, index: number): string {
  return `${planId}-step-${index + 1}`;
}

export function makeEvidenceId(planId: string, index: number): string {
  return `${planId}-evid-${index + 1}`;
}
