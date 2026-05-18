/**
 * Structured Planning + Provenance Layer — public entry.
 */

export {
  makeEvidenceId,
  makePlanId,
  makeStepId,
} from "./types";
export type {
  EvidenceRef,
  EvidenceType,
  ExecutionPlan,
  PlanConfidence,
  PlanConfidenceLevel,
  PlanProvenanceReport,
  PlanRiskLevel,
  PlanStep,
  PlanStepStatus,
  PlanningReceiptAction,
} from "./types";

export { buildPlan } from "./planner";
export type { BuildPlanInput, InspectedFileEvidence } from "./planner";

export { detectPlanningIntent } from "./intent";
export type { PlanningIntentMatch } from "./intent";

export { buildProvenanceReport, renderPlanAsText } from "./provenance";
