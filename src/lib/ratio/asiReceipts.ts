import type { RatioDecision } from "./types";

export function buildRatioReceiptMetadata(decision: RatioDecision): Record<string, string | number | boolean> {
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

export function buildRatioReceiptSummary(decision: RatioDecision): string {
  return `Ratio made an Adaptive System Intelligence decision: ${decision.status}. ${decision.receiptSummary}`;
}
