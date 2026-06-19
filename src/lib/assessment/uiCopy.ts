import type { AssessmentDecision, AssessmentDecisionStatus } from "./types";

export function getAssessmentStatusLabel(status: AssessmentDecisionStatus): string {
  switch (status) {
    case "available":
      return "Available";
    case "limited":
      return "Limited";
    case "needs-stronger-model":
      return "Needs stronger model";
    case "needs-cloud-unlock":
      return "Needs Cloud Unlock";
    case "needs-tool-permission":
    case "needs-workspace":
      return "Needs permission";
    case "requires-approval":
      return "Requires approval";
    case "future":
      return "Future";
    case "blocked":
      return "Blocked";
  }
}

export function getAssessmentUnlockLine(decision: AssessmentDecision): string | null {
  if (decision.status === "future") {
    return "What unlocks this? Future wiring plus explicit permissions when the feature is ready.";
  }
  if (decision.requiredUnlockLevel) {
    return `What unlocks this? ${decision.requiredUnlockLevel} mode, enabled explicitly.`;
  }
  if (decision.status === "needs-stronger-model") {
    return "What unlocks this? A model with the missing capability shown here.";
  }
  if (decision.status === "needs-workspace") {
    return "What unlocks this? Explicit workspace permission.";
  }
  if (decision.status === "needs-tool-permission") {
    return "What unlocks this? Explicit tool permission.";
  }
  if (decision.status === "requires-approval") {
    return "What unlocks this? Your explicit approval for this action.";
  }
  if (decision.status === "blocked") {
    return "What unlocks this? Rephrase the request or review it in Velum first.";
  }
  return null;
}
