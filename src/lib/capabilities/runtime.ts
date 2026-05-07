/**
 * Public Squidley capability runtime resolver.
 *
 * Pure, deterministic decision layer. Given a Capability and a snapshot of the
 * runtime context (available local/cloud provider profiles, consent flags,
 * Velum review state), it returns a CapabilityRuntimeDecision describing what
 * the host *may* do and why.
 *
 * Hard constraints in this phase:
 *   - Does NOT call any cloud or network resource.
 *   - Does NOT change provider behavior.
 *   - Does NOT escalate, switch providers, or infer past Capability.tier.
 *   - Honest messages prefer the registry's authored copy; falls back to
 *     deterministic, non-misleading defaults.
 */

import { getCapabilityById } from "./registry";
import type {
  Capability,
  CapabilityRuntimeState,
  CapabilityTier,
  ProviderCapabilityProfile,
  ProviderRequirement,
} from "./contracts";

export interface AvailableProfile {
  providerId: string;
  capabilityProfile: ProviderCapabilityProfile;
  paramsB?: number;
}

export interface LocalModelInfo {
  providerId: string;
  modelId: string;
  paramsB?: number;
  capabilityProfile?: ProviderCapabilityProfile;
}

export interface CapabilityRuntimeInput {
  capabilityId: string;
  availableLocalProfiles: readonly AvailableProfile[];
  availableCloudProfiles: readonly AvailableProfile[];
  localModels?: readonly LocalModelInfo[];
  cloudUnlocked: boolean;
  cloudConsentGranted: boolean;
  velumReviewPassed: boolean;
  blockedReason?: string;
}

export interface CapabilityReceiptHint {
  capabilityId: string;
  moduleId: string;
  tier: CapabilityTier;
  state: CapabilityRuntimeState;
  localAttemptAllowed: boolean;
  cloudAllowed: boolean;
  escalationReason?: string;
}

export interface CapabilityRuntimeDecision {
  capabilityId: string;
  moduleId: string;
  tier: CapabilityTier;
  state: CapabilityRuntimeState;
  canAttemptLocally: boolean;
  canUseCloud: boolean;
  requiresCloudConsent: boolean;
  requiresVelumReview: boolean;
  honestMessage: string;
  reasons: string[];
  receiptHint: CapabilityReceiptHint;
}

function profileMatches(
  req: ProviderRequirement,
  available: readonly AvailableProfile[],
): boolean {
  for (const p of available) {
    if (p.providerId !== req.providerId) continue;
    if (p.capabilityProfile !== req.capabilityProfile) continue;
    if (req.minParamsB !== undefined) {
      if (p.paramsB === undefined || p.paramsB < req.minParamsB) continue;
    }
    return true;
  }
  return false;
}

function allRequirementsMet(
  reqs: readonly ProviderRequirement[],
  available: readonly AvailableProfile[],
): boolean {
  for (const r of reqs) {
    if (!profileMatches(r, available)) return false;
  }
  return true;
}

function describeMissing(
  reqs: readonly ProviderRequirement[],
  available: readonly AvailableProfile[],
  where: "local" | "cloud",
): string[] {
  const missing: string[] = [];
  for (const r of reqs) {
    if (!profileMatches(r, available)) {
      const min = r.minParamsB ? ` (>=${r.minParamsB}B)` : "";
      missing.push(
        `${where} provider "${r.providerId}" with profile "${r.capabilityProfile}"${min} is not available.`,
      );
    }
  }
  return missing;
}

interface FinalizeArgs {
  capability: Capability;
  state: CapabilityRuntimeState;
  canAttemptLocally: boolean;
  canUseCloud: boolean;
  requiresCloudConsent: boolean;
  requiresVelumReview: boolean;
  honestMessage: string;
  reasons: string[];
  escalationReason?: string;
}

function finalize(args: FinalizeArgs): CapabilityRuntimeDecision {
  return {
    capabilityId: args.capability.id,
    moduleId: args.capability.moduleId,
    tier: args.capability.tier,
    state: args.state,
    canAttemptLocally: args.canAttemptLocally,
    canUseCloud: args.canUseCloud,
    requiresCloudConsent: args.requiresCloudConsent,
    requiresVelumReview: args.requiresVelumReview,
    honestMessage: args.honestMessage,
    reasons: args.reasons,
    receiptHint: {
      capabilityId: args.capability.id,
      moduleId: args.capability.moduleId,
      tier: args.capability.tier,
      state: args.state,
      localAttemptAllowed: args.canAttemptLocally,
      cloudAllowed: args.canUseCloud,
      escalationReason: args.escalationReason,
    },
  };
}

export function decideCapabilityRuntime(
  capability: Capability,
  input: CapabilityRuntimeInput,
): CapabilityRuntimeDecision {
  if (input.blockedReason) {
    return finalize({
      capability,
      state: "BLOCKED",
      canAttemptLocally: false,
      canUseCloud: false,
      requiresCloudConsent: false,
      requiresVelumReview: false,
      honestMessage:
        capability.honestMessages.blocked ??
        `This capability is currently blocked: ${input.blockedReason}.`,
      reasons: [`Blocked by host: ${input.blockedReason}`],
      escalationReason: input.blockedReason,
    });
  }

  const tier = capability.tier;

  if (tier === "blocked") {
    return finalize({
      capability,
      state: "BLOCKED",
      canAttemptLocally: false,
      canUseCloud: false,
      requiresCloudConsent: false,
      requiresVelumReview: false,
      honestMessage:
        capability.honestMessages.blocked ??
        "This capability is not active in public Squidley.",
      reasons: ["Capability is registered with tier=blocked."],
    });
  }

  const localOk =
    capability.localRequirements.length === 0 ||
    allRequirementsMet(capability.localRequirements, input.availableLocalProfiles);
  const cloudOk =
    capability.cloudRequirements.length > 0 &&
    allRequirementsMet(capability.cloudRequirements, input.availableCloudProfiles);

  const missingLocal = describeMissing(
    capability.localRequirements,
    input.availableLocalProfiles,
    "local",
  );
  const missingCloud = describeMissing(
    capability.cloudRequirements,
    input.availableCloudProfiles,
    "cloud",
  );

  const consentSatisfied = input.cloudUnlocked && input.cloudConsentGranted;
  const velumSatisfied = !capability.velumGated || input.velumReviewPassed;

  if (tier === "local-core") {
    if (localOk) {
      return finalize({
        capability,
        state: "LOCAL_READY",
        canAttemptLocally: true,
        canUseCloud: false,
        requiresCloudConsent: false,
        requiresVelumReview: capability.velumGated,
        honestMessage:
          capability.honestMessages.localReady ??
          "Ready to run locally. Nothing leaves the device.",
        reasons: ["Local requirements satisfied."],
      });
    }
    return finalize({
      capability,
      state: "BLOCKED",
      canAttemptLocally: false,
      canUseCloud: false,
      requiresCloudConsent: false,
      requiresVelumReview: capability.velumGated,
      honestMessage:
        capability.honestMessages.localLimited ??
        capability.honestMessages.localReady ??
        "Local requirements are not satisfied. Install the required local model to enable this capability.",
      reasons: missingLocal,
      escalationReason: missingLocal.join(" ") || undefined,
    });
  }

  if (tier === "local-limited") {
    if (localOk) {
      return finalize({
        capability,
        state: "LOCAL_LIMITED",
        canAttemptLocally: true,
        canUseCloud: false,
        requiresCloudConsent: false,
        requiresVelumReview: capability.velumGated,
        honestMessage:
          capability.honestMessages.localLimited ??
          "Will run locally. Quality depends on the local model and may be limited.",
        reasons: ["Local path available; quality may be limited by the local model."],
      });
    }
    return finalize({
      capability,
      state: "BLOCKED",
      canAttemptLocally: false,
      canUseCloud: false,
      requiresCloudConsent: false,
      requiresVelumReview: capability.velumGated,
      honestMessage:
        capability.honestMessages.localLimited ??
        "Local model required for this capability is not installed.",
      reasons: missingLocal,
      escalationReason: missingLocal.join(" ") || undefined,
    });
  }

  if (tier === "cloud-optional") {
    const canUseCloud = cloudOk && consentSatisfied && velumSatisfied;
    if (localOk) {
      const reasons: string[] = [
        "Local path available; cloud is optional and only used with explicit consent.",
      ];
      if (!cloudOk) reasons.push(...missingCloud);
      return finalize({
        capability,
        state: "LOCAL_LIMITED",
        canAttemptLocally: true,
        canUseCloud,
        requiresCloudConsent: false,
        requiresVelumReview: capability.velumGated,
        honestMessage:
          capability.honestMessages.localLimited ??
          capability.honestMessages.cloudOptional ??
          "Local path will run; cloud could improve quality but is not used unless you opt in. Nothing has been sent.",
        reasons,
      });
    }
    if (cloudOk) {
      const reasons: string[] = [
        "No local path; cloud capability available but not used unless you opt in.",
      ];
      return finalize({
        capability,
        state: "CLOUD_OPTIONAL",
        canAttemptLocally: false,
        canUseCloud,
        requiresCloudConsent: true,
        requiresVelumReview: capability.velumGated,
        honestMessage:
          capability.honestMessages.cloudOptional ??
          "No local path is available. Cloud could run this but requires explicit consent. Nothing has been sent.",
        reasons,
      });
    }
    return finalize({
      capability,
      state: "BLOCKED",
      canAttemptLocally: false,
      canUseCloud: false,
      requiresCloudConsent: false,
      requiresVelumReview: capability.velumGated,
      honestMessage:
        capability.honestMessages.cloudOptional ??
        "No local or cloud path is available for this capability.",
      reasons: [...missingLocal, ...missingCloud],
    });
  }

  if (tier === "cloud-required") {
    const canUseCloud = cloudOk && consentSatisfied && velumSatisfied;
    const reasons: string[] = [];
    if (!input.cloudUnlocked) {
      reasons.push("Cloud unlock has not been enabled in public mode.");
    }
    if (!input.cloudConsentGranted) {
      reasons.push("Cloud consent has not been granted.");
    }
    if (capability.velumGated && !input.velumReviewPassed) {
      reasons.push("Velum review has not been passed.");
    }
    if (!cloudOk) reasons.push(...missingCloud);
    return finalize({
      capability,
      state: "CLOUD_REQUIRED",
      canAttemptLocally: false,
      canUseCloud,
      requiresCloudConsent: true,
      requiresVelumReview: capability.velumGated,
      honestMessage:
        capability.honestMessages.cloudRequired ??
        "This capability requires a cloud provider that is not available locally. Nothing has been sent.",
      reasons,
      escalationReason: reasons.length ? reasons.join(" ") : undefined,
    });
  }

  return finalize({
    capability,
    state: "BLOCKED",
    canAttemptLocally: false,
    canUseCloud: false,
    requiresCloudConsent: false,
    requiresVelumReview: false,
    honestMessage: "Unknown capability tier.",
    reasons: [`Unhandled tier: ${String(tier)}`],
  });
}

export function resolveCapabilityRuntime(
  input: CapabilityRuntimeInput,
): CapabilityRuntimeDecision {
  const cap = getCapabilityById(input.capabilityId);
  if (!cap) {
    throw new Error(`Unknown capability id: ${input.capabilityId}`);
  }
  return decideCapabilityRuntime(cap, input);
}

export function resolveCapabilityRuntimeForId(
  capabilityId: string,
  context: Omit<CapabilityRuntimeInput, "capabilityId">,
): CapabilityRuntimeDecision {
  return resolveCapabilityRuntime({ capabilityId, ...context });
}
