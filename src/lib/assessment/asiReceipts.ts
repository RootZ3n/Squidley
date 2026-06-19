import type { AssessmentDecision } from "./types";

export function buildAssessmentReceiptMetadata(decision: AssessmentDecision): Record<string, string | number | boolean> {
  return {
    subsystem: "ratio",
    status: decision.status,
    effectiveMode: decision.effectiveMode,
    capabilityLevel: decision.capabilityLevel,
    allowed: decision.allowed,
    localOnly: decision.localOnly,
    cloudUsed: false,
    requiredUnlockLevel: decision.requiredUnlockLevel ?? "none",
    requiredCapabilities: decision.requiredCapabilities?.join(",") ?? "none",
  };
}

export function buildAssessmentReceiptSummary(decision: AssessmentDecision): string {
  return `Assessment made an Adaptive System Intelligence decision: ${decision.status}. ${decision.receiptSummary}`;
}
