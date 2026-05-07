import type { RatioDecision, RatioDecisionStatus, RatioModelCapabilityProfile } from "./types";

export function explainRatioModel(profile: RatioModelCapabilityProfile): string {
  return profile.modelSummary;
}

export function beginnerMessageForStatus(status: RatioDecisionStatus): string {
  switch (status) {
    case "available":
      return "Squidley can do this with the current local setup.";
    case "limited":
      return "Squidley can help, but will stay in a safer limited mode.";
    case "needs-stronger-model":
      return "This action needs a stronger reasoning model.";
    case "needs-cloud-unlock":
      return "This is locked until a future cloud unlock is explicitly enabled.";
    case "needs-tool-permission":
      return "This action needs explicit tool permission before it can run.";
    case "needs-workspace":
      return "This action needs explicit workspace permission before it can run.";
    case "requires-approval":
      return "Squidley can do this only after asking for approval.";
    case "blocked":
      return "Squidley paused this because the safety posture is too risky for this action.";
    case "future":
      return "This is prepared for a future version and is not wired yet.";
  }
}

export function summarizeRatioDecision(decision: RatioDecision): string {
  return `${decision.beginnerMessage} Mode: ${decision.effectiveMode}. ${decision.modelSummary}`;
}
