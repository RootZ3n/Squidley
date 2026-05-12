/**
 * Local model capability readiness mapping.
 *
 * Pure, deterministic helpers that turn discovered local model information
 * (from Ollama /api/tags or llama-server /v1/models) into AvailableProfile-
 * style capability profiles the capability runtime resolver can use.
 *
 * This is heuristic local-readiness classification, not a benchmark or
 * guarantee. Beginner-facing copy should say "likely supports" or "available
 * locally," not "guaranteed excellent."
 *
 * Provider ID design note:
 *   Both Ollama and llama-server models default to providerId "ollama" in
 *   capability profiles. This is intentional: the capability registry uses
 *   providerId "ollama" to mean "any local model server," and the Ratio
 *   system, module registry, and receipt builders all depend on this value.
 *   The actual backend type (Ollama vs llama-server) is tracked separately
 *   via LocalProviderConfig.backendType and surfaced in health responses
 *   and stream metadata. A future cleanup could introduce a
 *   providerClass: "local" abstraction to make this distinction cleaner.
 *
 * Hard constraints:
 *   - No fetch. No provider calls. No cloud calls. No localStorage writes.
 *   - No UI side effects.
 *   - Conservative: do not overclaim capabilities.
 *   - tool-use is never inferred from model name alone.
 *   - long-context is only inferred from explicit contextLength metadata.
 */

import type { ProviderCapabilityProfile } from "./contracts";
import type { AvailableProfile, CapabilityRuntimeInput } from "./runtime";

/**
 * Minimal model info compatible with the existing Ollama discovery shape.
 * Callers may pass richer objects; only these fields are inspected.
 */
export interface LocalModelSnapshot {
  name: string;
  /** Provider id. Defaults to "ollama" when omitted. Both Ollama and
   *  llama-server models use "ollama" as the capability provider id,
   *  since "ollama" in the capability registry means "any local model server." */
  providerId?: string;
  /** Model parameter count in billions, if known. */
  paramsB?: number;
  /** Raw byte size from Ollama /api/tags, if available. */
  size?: number;
  /** Context window length in tokens, if known from model metadata. */
  contextLength?: number;
  /** Whether vision is explicitly confirmed from model metadata. */
  supportsVision?: boolean;
  /** Whether the model is an embedding-only model. */
  isEmbedding?: boolean;
}

export interface LocalCapabilityProfile extends AvailableProfile {
  modelName: string;
}

// ---------------------------------------------------------------------------
// Name-based heuristic patterns
// ---------------------------------------------------------------------------

const EMBEDDING_PATTERNS = [
  "all-minilm",
  "minilm",
  "nomic-embed",
  "embed",
  "embedding",
  "bge-",
  "e5-",
  "gte-",
  "mxbai-embed",
];

const CODE_PATTERNS = [
  "codellama",
  "code-llama",
  "deepseek-coder",
  "codegemma",
  "starcoder",
  "codestral",
  "qwen3-coder",
  "qwen2.5-coder",
  "qwen-coder",
  "codeqwen",
  "granite-code",
  "yi-coder",
  "stable-code",
];

const VISION_PATTERNS = [
  "llava",
  "minicpm-v",
  "qwen-vl",
  "qwen2-vl",
  "qwen2.5-vl",
  "bakllava",
  "moondream",
  "cogvlm",
  "internvl",
  "llama3.2-vision",
  "gemma3",
];

// Regex to extract parameter size from model name (e.g. "7b", "0.5b", "14b")
const PARAMS_REGEX = /(?:^|[:\-_\s])(\d+(?:\.\d+)?)[bB](?:[:\-_\s]|$)/;

// ---------------------------------------------------------------------------
// Heuristic classifiers
// ---------------------------------------------------------------------------

function nameMatches(name: string, patterns: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

/**
 * Returns true if the model is likely an embedding-only model that should
 * not be offered as a chat/code/vision provider.
 */
export function isLikelyEmbeddingModel(model: LocalModelSnapshot): boolean {
  if (model.isEmbedding === true) return true;
  return nameMatches(model.name, EMBEDDING_PATTERNS);
}

/**
 * Returns true if the model name indicates a code-oriented model.
 */
export function isLikelyCodeModel(model: LocalModelSnapshot): boolean {
  return nameMatches(model.name, CODE_PATTERNS);
}

/**
 * Returns true if the model is likely vision-capable, based on explicit
 * metadata or name heuristics.
 */
export function isLikelyVisionModel(model: LocalModelSnapshot): boolean {
  if (model.supportsVision === true) return true;
  return nameMatches(model.name, VISION_PATTERNS);
}

/**
 * Try to infer parameter count in billions from the model name.
 * Returns undefined if not inferable. Does not fake params.
 */
export function inferParamsB(model: LocalModelSnapshot): number | undefined {
  if (model.paramsB !== undefined && model.paramsB > 0) return model.paramsB;
  const match = model.name.match(PARAMS_REGEX);
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

// ---------------------------------------------------------------------------
// Profile mapping
// ---------------------------------------------------------------------------

/**
 * Infer the capability profiles a single local model likely supports.
 * Conservative: does not claim tool-use or long-context from name alone.
 */
export function inferLocalModelCapabilityProfiles(
  model: LocalModelSnapshot,
): LocalCapabilityProfile[] {
  const providerId = model.providerId ?? "ollama";
  const paramsB = inferParamsB(model);
  const profiles: LocalCapabilityProfile[] = [];

  if (isLikelyEmbeddingModel(model)) {
    profiles.push({
      providerId,
      capabilityProfile: "embeddings",
      modelName: model.name,
      ...(paramsB !== undefined ? { paramsB } : {}),
    });
    // Embedding models do not provide chat/code/vision.
    return profiles;
  }

  // All non-embedding local models are assumed to support basic chat.
  profiles.push({
    providerId,
    capabilityProfile: "chat",
    modelName: model.name,
    ...(paramsB !== undefined ? { paramsB } : {}),
  });

  if (isLikelyCodeModel(model)) {
    profiles.push({
      providerId,
      capabilityProfile: "code",
      modelName: model.name,
      ...(paramsB !== undefined ? { paramsB } : {}),
    });
  }

  if (isLikelyVisionModel(model)) {
    profiles.push({
      providerId,
      capabilityProfile: "vision",
      modelName: model.name,
      ...(paramsB !== undefined ? { paramsB } : {}),
    });
  }

  if (
    model.contextLength !== undefined &&
    model.contextLength >= 32_768
  ) {
    profiles.push({
      providerId,
      capabilityProfile: "long-context",
      modelName: model.name,
      ...(paramsB !== undefined ? { paramsB } : {}),
    });
  }

  // tool-use is never inferred from name alone.

  return profiles;
}

/**
 * Map a list of local models into deduplicated AvailableProfile entries
 * suitable for the capability runtime resolver.
 */
export function localModelsToCapabilityProfiles(
  models: readonly LocalModelSnapshot[],
): AvailableProfile[] {
  const seen = new Set<string>();
  const profiles: AvailableProfile[] = [];

  for (const model of models) {
    for (const profile of inferLocalModelCapabilityProfiles(model)) {
      // Deduplicate by providerId + capabilityProfile. Keep the entry with
      // the largest paramsB when duplicates exist, since the resolver uses
      // minParamsB comparisons.
      const key = `${profile.providerId}:${profile.capabilityProfile}`;
      if (seen.has(key)) {
        const existing = profiles.find(
          (p) =>
            p.providerId === profile.providerId &&
            p.capabilityProfile === profile.capabilityProfile,
        );
        if (
          existing &&
          profile.paramsB !== undefined &&
          (existing.paramsB === undefined || profile.paramsB > existing.paramsB)
        ) {
          existing.paramsB = profile.paramsB;
        }
        continue;
      }
      seen.add(key);
      const { modelName: _, ...availableProfile } = profile;
      profiles.push(availableProfile);
    }
  }

  return profiles;
}

/**
 * Build a complete CapabilityRuntimeInput context from local model snapshots.
 * Cloud is always locked; consent and Velum are always unset.
 */
export function buildLocalCapabilityRuntimeContext(
  models: readonly LocalModelSnapshot[],
  options?: {
    velumReviewPassed?: boolean;
    blockedReason?: string;
  },
): Omit<CapabilityRuntimeInput, "capabilityId"> {
  return {
    availableLocalProfiles: localModelsToCapabilityProfiles(models),
    availableCloudProfiles: [],
    cloudUnlocked: false,
    cloudConsentGranted: false,
    velumReviewPassed: options?.velumReviewPassed ?? false,
    ...(options?.blockedReason !== undefined
      ? { blockedReason: options.blockedReason }
      : {}),
  };
}
