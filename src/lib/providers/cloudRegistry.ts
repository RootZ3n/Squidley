/**
 * Cloud provider registry for Squidley Cloud Mode.
 *
 * Explicit, auditable registry of every cloud provider Squidley may
 * eventually support. Each entry is marked with its implementation status.
 *
 * Critical rule: if a provider adapter does not exist and is not tested,
 * its status MUST be NOT_IMPLEMENTED. No fake provider support.
 */

export type CloudProviderStatus =
  | "IMPLEMENTED"
  | "PARTIAL"
  | "NOT_IMPLEMENTED";

export type ProviderLocality = "local" | "cloud";

export interface CloudProviderEntry {
  readonly id: string;
  readonly displayName: string;
  readonly status: CloudProviderStatus;
  readonly locality: ProviderLocality;
  readonly requiresApiKey: boolean;
  readonly envVarNames: readonly string[];
  readonly supportsChat: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsVision: boolean;
  readonly supportsToolUse: boolean;
  readonly supportsEmbeddings: boolean;
  readonly supportsImageGeneration: boolean;
  readonly costKnown: boolean;
  readonly statusEndpoint?: string;
  readonly implementationFile?: string;
  readonly notes: string;
}

/**
 * The full provider registry. Local backends are included for completeness.
 * Cloud providers are all NOT_IMPLEMENTED until real adapters exist.
 */
export const CLOUD_PROVIDER_REGISTRY: readonly CloudProviderEntry[] = [
  // --- Local backends (existing, validated) ---
  {
    id: "ollama",
    displayName: "Ollama",
    status: "IMPLEMENTED",
    locality: "local",
    requiresApiKey: false,
    envVarNames: ["SQUIDLEY_LOCAL_ENDPOINT"],
    supportsChat: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsToolUse: false,
    supportsEmbeddings: true,
    supportsImageGeneration: false,
    costKnown: true,
    statusEndpoint: "/api/tags",
    implementationFile: "src/lib/providers/ollama.ts",
    notes: "Validated end-to-end with live gauntlet. Default local backend.",
  },
  {
    id: "llama-cpp",
    displayName: "llama.cpp / llama-server",
    status: "PARTIAL",
    locality: "local",
    requiresApiKey: false,
    envVarNames: ["SQUIDLEY_LOCAL_ENDPOINT"],
    supportsChat: true,
    supportsStreaming: true,
    supportsVision: false,
    supportsToolUse: false,
    supportsEmbeddings: false,
    supportsImageGeneration: false,
    costKnown: true,
    statusEndpoint: "/health",
    implementationFile: "src/lib/providers/llamacpp.ts",
    notes: "Text adapter tested via unit tests. Real binary validation pending PROOF.json.",
  },

  // --- Cloud providers (NOT_IMPLEMENTED until adapters exist) ---
  {
    id: "openai",
    displayName: "OpenAI",
    status: "NOT_IMPLEMENTED",
    locality: "cloud",
    requiresApiKey: true,
    envVarNames: ["OPENAI_API_KEY"],
    supportsChat: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsToolUse: true,
    supportsEmbeddings: true,
    supportsImageGeneration: true,
    costKnown: true,
    statusEndpoint: undefined,
    implementationFile: undefined,
    notes: "Planned. No adapter or API call path exists yet.",
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    status: "NOT_IMPLEMENTED",
    locality: "cloud",
    requiresApiKey: true,
    envVarNames: ["OPENROUTER_API_KEY"],
    supportsChat: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsToolUse: true,
    supportsEmbeddings: false,
    supportsImageGeneration: false,
    costKnown: false,
    statusEndpoint: undefined,
    implementationFile: undefined,
    notes: "Planned. Multi-model router. No adapter exists yet.",
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    status: "NOT_IMPLEMENTED",
    locality: "cloud",
    requiresApiKey: true,
    envVarNames: ["ANTHROPIC_API_KEY"],
    supportsChat: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsToolUse: true,
    supportsEmbeddings: false,
    supportsImageGeneration: false,
    costKnown: true,
    statusEndpoint: undefined,
    implementationFile: undefined,
    notes: "Planned. No adapter or API call path exists yet.",
  },
  {
    id: "gemini",
    displayName: "Google Gemini",
    status: "NOT_IMPLEMENTED",
    locality: "cloud",
    requiresApiKey: true,
    envVarNames: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    supportsChat: true,
    supportsStreaming: true,
    supportsVision: true,
    supportsToolUse: true,
    supportsEmbeddings: true,
    supportsImageGeneration: true,
    costKnown: true,
    statusEndpoint: undefined,
    implementationFile: undefined,
    notes: "Planned. No adapter or API call path exists yet.",
  },
  {
    id: "minimax",
    displayName: "Minimax",
    status: "NOT_IMPLEMENTED",
    locality: "cloud",
    requiresApiKey: true,
    envVarNames: ["MINIMAX_API_KEY"],
    supportsChat: true,
    supportsStreaming: true,
    supportsVision: false,
    supportsToolUse: false,
    supportsEmbeddings: false,
    supportsImageGeneration: false,
    costKnown: false,
    statusEndpoint: undefined,
    implementationFile: undefined,
    notes: "Planned. No adapter or API call path exists yet.",
  },
  {
    id: "zai",
    displayName: "Z.ai",
    status: "NOT_IMPLEMENTED",
    locality: "cloud",
    requiresApiKey: true,
    envVarNames: ["ZAI_API_KEY"],
    supportsChat: true,
    supportsStreaming: true,
    supportsVision: false,
    supportsToolUse: false,
    supportsEmbeddings: false,
    supportsImageGeneration: false,
    costKnown: false,
    statusEndpoint: undefined,
    implementationFile: undefined,
    notes: "Planned. No adapter or API call path exists yet.",
  },
] as const;

export function getProviderById(id: string): CloudProviderEntry | undefined {
  return CLOUD_PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function getCloudProviders(): CloudProviderEntry[] {
  return CLOUD_PROVIDER_REGISTRY.filter((p) => p.locality === "cloud");
}

export function getLocalProviders(): CloudProviderEntry[] {
  return CLOUD_PROVIDER_REGISTRY.filter((p) => p.locality === "local");
}

export function getImplementedProviders(): CloudProviderEntry[] {
  return CLOUD_PROVIDER_REGISTRY.filter((p) => p.status !== "NOT_IMPLEMENTED");
}

/**
 * Check which cloud providers have API keys configured.
 * Returns provider entries with keys present but does NOT check mode.
 */
export function getConfiguredCloudProviders(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): CloudProviderEntry[] {
  return getCloudProviders().filter((provider) =>
    provider.envVarNames.some(
      (key) => typeof env[key] === "string" && env[key]!.trim().length > 0,
    ),
  );
}

/**
 * Check if cloud mode can activate: at least one cloud provider must be
 * configured AND have an implemented adapter.
 */
export function isCloudModeViable(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): { viable: boolean; reason: string; configuredProviders: readonly string[] } {
  const configured = getConfiguredCloudProviders(env);
  if (configured.length === 0) {
    return {
      viable: false,
      reason: "No cloud provider API keys are configured.",
      configuredProviders: [],
    };
  }

  const implemented = configured.filter((p) => p.status !== "NOT_IMPLEMENTED");
  if (implemented.length === 0) {
    return {
      viable: false,
      reason: `Cloud provider(s) configured (${configured.map((p) => p.displayName).join(", ")}) but none have implemented adapters yet.`,
      configuredProviders: configured.map((p) => p.id),
    };
  }

  return {
    viable: true,
    reason: `Cloud provider(s) available: ${implemented.map((p) => p.displayName).join(", ")}`,
    configuredProviders: configured.map((p) => p.id),
  };
}
