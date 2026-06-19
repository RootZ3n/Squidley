import { getProviderById, type ProviderId } from "@/lib/providers/registry";
import { getAssessmentModulePolicy } from "./modulePolicies";
import { resolveAssessmentModelCapability } from "./modelCapabilities";
import { unlockMeets } from "./unlockLevels";
import { beginnerMessageForStatus } from "./explanations";
import type {
  AssessmentCapabilityLevel,
  AssessmentDecision,
  AssessmentDecisionInput,
  AssessmentDecisionStatus,
  AssessmentEffectiveMode,
  AssessmentModelCapabilityProfile,
} from "./types";

export function decideAssessmentAction(input: AssessmentDecisionInput): AssessmentDecision {
  const provider = getProviderById(input.providerId);
  const providerType = provider?.type ?? "cloud";
  const profile = resolveAssessmentModelCapability({
    providerId: input.providerId,
    providerType,
    modelId: input.modelId,
    moduleId: input.moduleId,
  });
  const policy = getAssessmentModulePolicy(input.moduleId, input.actionId);
  if (!policy) {
    return decision(input, profile, "future", false, "No Assessment policy is wired for this action.", ["Action policy is not defined yet."]);
  }
  if (policy.currentStatus === "future") {
    return decision(input, profile, "future", false, policy.publicMessage, ["This action is prepared for a future version."]);
  }
  if (policy.currentStatus === "locked" && !unlockMeets(input.unlockLevel, policy.minimumUnlockLevel)) {
    return decision(input, profile, "needs-cloud-unlock", false, policy.publicMessage, [`Requires ${policy.minimumUnlockLevel}.`], policy.minimumUnlockLevel);
  }
  if (!unlockMeets(input.unlockLevel, policy.minimumUnlockLevel)) {
    return decision(input, profile, "needs-cloud-unlock", false, policy.publicMessage, [`Requires ${policy.minimumUnlockLevel}.`], policy.minimumUnlockLevel);
  }
  if (input.promptGatewayRisk === "blocked") {
    return decision(input, profile, "blocked", false, "Prompt Gateway paused this request before model use.", ["Prompt Gateway risk is blocked."]);
  }
  if (input.promptGatewayRisk === "high" && input.taskRisk !== "low") {
    return decision(input, profile, "requires-approval", false, "High prompt risk requires approval or Velum review before this action.", ["High prompt risk changes the safety posture."]);
  }
  if (policy.requiresWorkspace && !input.workspacePermission) {
    return decision(input, profile, "needs-workspace", false, policy.publicMessage, ["Workspace permission is required."]);
  }
  if (policy.requiresTools && !input.toolPermission) {
    return decision(input, profile, "needs-tool-permission", false, policy.publicMessage, ["Tool permission is required."]);
  }
  if (policy.requiresApproval && input.approvalPolicy === "none") {
    return decision(input, profile, "requires-approval", false, policy.publicMessage, ["Approval is required."]);
  }
  if (!isDeterministicAction(input.actionId) && !input.modelId?.trim()) {
    return decision(input, profile, "needs-stronger-model", false, "This action needs a selected local model before Assessment can use it.", ["Requires selected model."]);
  }

  const missing = missingCapabilities(policy, profile);
  if (missing.length > 0) {
    return decision(input, profile, "needs-stronger-model", false, policy.publicMessage, missing);
  }

  const status: AssessmentDecisionStatus = input.promptGatewayRisk === "medium" || input.promptGatewayRisk === "high"
    ? "limited"
    : "available";
  return decision(input, profile, status, true, policy.publicMessage, status === "limited" ? ["Prompt Gateway caution keeps this in a guarded mode."] : []);
}

function decision(
  input: AssessmentDecisionInput,
  profile: AssessmentModelCapabilityProfile,
  status: AssessmentDecisionStatus,
  allowed: boolean,
  reason: string,
  safetyNotes: string[],
  requiredUnlockLevel?: AssessmentDecision["requiredUnlockLevel"],
): AssessmentDecision {
  const localOnly = input.providerId === "ollama" && input.unlockLevel === "public-local";
  const deterministic = isDeterministicAction(input.actionId);
  return {
    allowed,
    status,
    effectiveMode: effectiveMode(input, profile, status),
    capabilityLevel: capabilityLevel(profile),
    reason,
    beginnerMessage: beginnerMessageForStatus(status),
    modelSummary: deterministic
      ? "This module does not need a model. Assessment treats it as deterministic local behavior."
      : profile.modelSummary,
    safetyNotes,
    receiptSummary: `${input.moduleId}.${input.actionId} resolved as ${status}.`,
    ...(requiredUnlockLevel ? { requiredUnlockLevel } : {}),
    requiredCapabilities: safetyNotes.filter((note) => /requires|permission|capability|model/i.test(note)),
    localOnly,
    cloudUsed: false,
  };
}

function effectiveMode(
  input: AssessmentDecisionInput,
  profile: AssessmentModelCapabilityProfile,
  status: AssessmentDecisionStatus,
): AssessmentEffectiveMode {
  if (status === "future" || isDeterministicAction(input.actionId)) return "deterministic";
  if (input.unlockLevel === "lab-power") return "lab-power";
  if (input.unlockLevel === "cloud-agent" && profile.autonomyRecommendation === "agent") return "cloud-agent";
  if (input.unlockLevel === "cloud-assisted" || input.unlockLevel === "cloud-connected") return "cloud-assisted";
  if (profile.supportsVision || profile.intelligenceTier === "standard") return "local-plus";
  return "local-chat";
}

function isDeterministicAction(actionId: string): boolean {
  return actionId.includes("deterministic") ||
    actionId.includes("local-storage") ||
    actionId.includes("local-receipts") ||
    actionId.includes("system-map") ||
    actionId.includes("local-control") ||
    actionId.includes("public-gallery");
}

function capabilityLevel(profile: AssessmentModelCapabilityProfile): AssessmentCapabilityLevel {
  if (profile.autonomyRecommendation === "agent") return "agentic";
  if (profile.autonomyRecommendation === "multi-step") return "multi-step";
  if (profile.autonomyRecommendation === "single-step") return "single-step";
  if (profile.autonomyRecommendation === "suggest") return "suggest";
  return "explain";
}

function missingCapabilities(
  policy: NonNullable<ReturnType<typeof getAssessmentModulePolicy>>,
  profile: AssessmentModelCapabilityProfile,
): string[] {
  const missing: string[] = [];
  if (policy.minimumVisionAbility && abilityRank(profile.visionAbility, ["none", "basic", "strong"]) < abilityRank(policy.minimumVisionAbility, ["none", "basic", "strong"])) {
    missing.push(`Requires ${policy.minimumVisionAbility} vision capability.`);
  }
  if (policy.minimumCodingAbility && abilityRank(profile.codingAbility, ["none", "basic", "single-file", "multi-file", "agentic"]) < abilityRank(policy.minimumCodingAbility, ["none", "basic", "single-file", "multi-file", "agentic"])) {
    missing.push(`Requires ${policy.minimumCodingAbility} coding capability.`);
  }
  if (policy.minimumPlanningAbility && abilityRank(profile.planningAbility, ["none", "basic", "multi-step", "agentic"]) < abilityRank(policy.minimumPlanningAbility, ["none", "basic", "multi-step", "agentic"])) {
    missing.push(`Requires ${policy.minimumPlanningAbility} planning capability.`);
  }
  return missing;
}

function abilityRank<T extends string>(value: T, order: readonly T[]): number {
  return order.indexOf(value);
}
