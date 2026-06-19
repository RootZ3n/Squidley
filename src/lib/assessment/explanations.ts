import type { AssessmentDecision, AssessmentDecisionStatus, AssessmentModelCapabilityProfile } from "./types";

export function explainAssessmentModel(profile: AssessmentModelCapabilityProfile): string {
  return profile.modelSummary;
}

export function beginnerMessageForStatus(status: AssessmentDecisionStatus): string {
  switch (status) {
    case "available":
      return "Peh can do this with the current local setup.";
    case "limited":
      return "Peh can help, but will stay in a safer limited mode.";
    case "needs-stronger-model":
      return "This action needs a stronger reasoning model.";
    case "needs-cloud-unlock":
      return "This is locked until a future cloud unlock is explicitly enabled.";
    case "needs-tool-permission":
      return "This action needs explicit tool permission before it can run.";
    case "needs-workspace":
      return "This action needs explicit workspace permission before it can run.";
    case "requires-approval":
      return "Peh can do this only after asking for approval.";
    case "blocked":
      return "Peh paused this because the safety posture is too risky for this action.";
    case "future":
      return "This is prepared for a future version and is not wired yet.";
  }
}

export function summarizeAssessmentDecision(decision: AssessmentDecision): string {
  return `${decision.beginnerMessage} Mode: ${decision.effectiveMode}. ${decision.modelSummary}`;
}
