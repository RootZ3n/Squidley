import { isLikelyVisionModel } from "@/lib/oculus/helpers";
import type { ProviderId, ProviderType } from "@/lib/providers/registry";
import type {
  RatioConfidence,
  RatioModelCapabilityProfile,
} from "./types";

type PartialProfile = Omit<RatioModelCapabilityProfile, "providerId" | "providerType" | "modelIdPattern"> & {
  pattern: RegExp;
  modelIdPattern: string;
};

const LOCAL_PROFILES: readonly PartialProfile[] = [
  {
    pattern: /(?:llama3\.2|qwen3\.5:0\.8b|qwen2\.5:7b|ministral|nemotron-3-nano)/i,
    modelIdPattern: "small-local-chat",
    intelligenceTier: "basic",
    contextTier: "medium",
    toolUseReliability: "none",
    codingAbility: "basic",
    visionAbility: "none",
    planningAbility: "basic",
    safetyReliability: "basic",
    autonomyRecommendation: "suggest",
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalling: false,
    supportsJsonMode: false,
    supportsLongContext: false,
    confidence: "medium",
    modelSummary:
      "This local model is suitable for conversation, simple explanations, and light drafting. Squidley will not use it for autonomous agent work.",
    notRecommendedFor: ["agent workflows", "multi-file builds", "high-risk planning"],
  },
  {
    pattern: /(?:coder|deepseek-coder|qwen3-coder|qwen2\.5-coder)/i,
    modelIdPattern: "local-coding",
    intelligenceTier: "standard",
    contextTier: "large",
    toolUseReliability: "weak",
    codingAbility: "single-file",
    visionAbility: "none",
    planningAbility: "multi-step",
    safetyReliability: "basic",
    autonomyRecommendation: "single-step",
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalling: false,
    supportsJsonMode: false,
    supportsLongContext: true,
    confidence: "medium",
    modelSummary:
      "This local model appears better suited for code suggestions and structured drafting, but Public Squidley still limits it to reviewed single-step work.",
    notRecommendedFor: ["autonomous repo edits", "shell execution", "agent workflows"],
  },
];

const CLOUD_PREPARED: Record<Exclude<ProviderId, "ollama" | "llama-cpp">, RatioModelCapabilityProfile> = {
  openrouter: preparedCloud("openrouter", "aggregator", "OpenRouter is prepared as a future aggregator. Capability depends on the selected cloud model and remains locked now."),
  openai: preparedCloud("openai", "cloud", "OpenAI is prepared as a future cloud provider. Strong models may unlock advanced planning later, after explicit setup."),
  anthropic: preparedCloud("anthropic", "cloud", "Anthropic is prepared as a future cloud provider. Strong models may unlock advanced planning later, after explicit setup."),
  "google-gemini": preparedCloud("google-gemini", "cloud", "Google Gemini is prepared as a future cloud provider. Vision and long-context behavior may be available later, after explicit setup."),
};

export function resolveRatioModelCapability(args: {
  providerId: ProviderId;
  modelId?: string;
  providerType: ProviderType;
  moduleId?: string;
}): RatioModelCapabilityProfile {
  const modelId = args.modelId?.trim() || "unknown";
  if (args.providerId !== "ollama" && args.providerId !== "llama-cpp") return CLOUD_PREPARED[args.providerId];

  if (isLikelyVisionModel(modelId)) {
    return {
      providerId: "ollama",
      providerType: "local",
      modelIdPattern: "local-vision",
      intelligenceTier: "standard",
      contextTier: "medium",
      toolUseReliability: "none",
      codingAbility: "basic",
      visionAbility: "basic",
      planningAbility: "basic",
      safetyReliability: "basic",
      autonomyRecommendation: "suggest",
      supportsStreaming: true,
      supportsVision: true,
      supportsToolCalling: false,
      supportsJsonMode: false,
      supportsLongContext: false,
      confidence: "medium",
      modelSummary:
        `${modelId} looks like a local vision-capable model. Squidley can use it for manual image analysis, but not for tools or autonomous workflows.`,
      notRecommendedFor: ["agent workflows", "tool use", "private screen watching"],
    };
  }

  const matched = LOCAL_PROFILES.find((profile) => profile.pattern.test(modelId));
  if (matched) return completeProfile("ollama", "local", matched, matched.confidence);

  return {
    providerId: "ollama",
    providerType: "local",
    modelIdPattern: "unknown-local",
    intelligenceTier: "basic",
    contextTier: "small",
    toolUseReliability: "none",
    codingAbility: "basic",
    visionAbility: "none",
    planningAbility: "basic",
    safetyReliability: "unknown",
    autonomyRecommendation: "explain-only",
    supportsStreaming: true,
    supportsVision: false,
    supportsToolCalling: false,
    supportsJsonMode: false,
    supportsLongContext: false,
    confidence: "low",
    modelSummary:
      "This local model is unknown to Ratio, so Squidley treats it conservatively. It may be useful for simple chat, but not for agent work.",
    notRecommendedFor: ["agent workflows", "multi-file builds", "tool use", "high-risk decisions"],
  };
}

function completeProfile(
  providerId: ProviderId,
  providerType: ProviderType,
  profile: PartialProfile,
  confidence: RatioConfidence,
): RatioModelCapabilityProfile {
  const { pattern: _pattern, ...rest } = profile;
  return { providerId, providerType, ...rest, confidence };
}

function preparedCloud(
  providerId: Exclude<ProviderId, "ollama" | "llama-cpp">,
  providerType: ProviderType,
  modelSummary: string,
): RatioModelCapabilityProfile {
  return {
    providerId,
    providerType,
    modelIdPattern: "prepared-cloud",
    intelligenceTier: "frontier",
    contextTier: "huge",
    toolUseReliability: "strong",
    codingAbility: "agentic",
    visionAbility: "strong",
    planningAbility: "agentic",
    safetyReliability: "strong",
    autonomyRecommendation: "agent",
    supportsStreaming: true,
    supportsVision: true,
    supportsToolCalling: true,
    supportsJsonMode: true,
    supportsLongContext: true,
    confidence: "low",
    modelSummary,
    notRecommendedFor: ["public-local mode without explicit cloud unlock"],
  };
}
