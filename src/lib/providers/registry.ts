export type ProviderId = "ollama" | "llama-cpp" | "openrouter" | "openai" | "anthropic" | "google-gemini";
export type ProviderType = "local" | "cloud" | "aggregator";
export type ProviderAuthType = "none" | "api-key";
export type ProviderApiStyle =
  | "ollama-chat"
  | "openai-chat-compatible"
  | "openai-responses"
  | "anthropic-messages"
  | "gemini-generate-content";
export type ProviderStatus = "active" | "prepared" | "locked";

export interface ProviderRegistryEntry {
  id: ProviderId;
  displayName: string;
  type: ProviderType;
  enabledByDefault: boolean;
  cloudUnlockRequired: boolean;
  baseUrlDefault: string;
  authType: ProviderAuthType;
  supportedApiStyle: ProviderApiStyle;
  supportsStreaming: boolean;
  supportsVision: boolean;
  beginnerDescription: string;
  status: ProviderStatus;
}

export const PROVIDER_REGISTRY: readonly ProviderRegistryEntry[] = [
  {
    id: "ollama",
    displayName: "Ollama-compatible local server",
    type: "local",
    enabledByDefault: true,
    cloudUnlockRequired: false,
    baseUrlDefault: "http://localhost:11434",
    authType: "none",
    supportedApiStyle: "ollama-chat",
    supportsStreaming: true,
    supportsVision: true,
    beginnerDescription:
      "Runs on your computer. Peh uses this for local chat and local image analysis when a matching model is available.",
    status: "active",
  },
  {
    id: "llama-cpp",
    displayName: "llama-server (llama.cpp)",
    type: "local",
    enabledByDefault: true,
    cloudUnlockRequired: false,
    baseUrlDefault: "http://localhost:8080",
    authType: "none",
    supportedApiStyle: "openai-chat-compatible",
    supportsStreaming: true,
    supportsVision: false,
    beginnerDescription:
      "A lightweight local inference server from llama.cpp. Peh has an OpenAI-compatible local text path for it; real llama-server binary validation is still pending, and Oculus vision is not supported.",
    status: "active",
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    type: "aggregator",
    enabledByDefault: false,
    cloudUnlockRequired: true,
    baseUrlDefault: "https://openrouter.ai/api/v1",
    authType: "api-key",
    supportedApiStyle: "openai-chat-compatible",
    supportsStreaming: true,
    supportsVision: true,
    beginnerDescription:
      "Prepared as future cloud-provider metadata. Peh will not call it until cloud access is explicitly unlocked later.",
    status: "locked",
  },
  {
    id: "openai",
    displayName: "OpenAI",
    type: "cloud",
    enabledByDefault: false,
    cloudUnlockRequired: true,
    baseUrlDefault: "https://api.openai.com/v1",
    authType: "api-key",
    supportedApiStyle: "openai-responses",
    supportsStreaming: true,
    supportsVision: true,
    beginnerDescription:
      "Prepared for a future cloud unlock. New OpenAI integration should prefer the Responses API, while compatibility adapters may still matter.",
    status: "locked",
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    type: "cloud",
    enabledByDefault: false,
    cloudUnlockRequired: true,
    baseUrlDefault: "https://api.anthropic.com",
    authType: "api-key",
    supportedApiStyle: "anthropic-messages",
    supportsStreaming: true,
    supportsVision: true,
    beginnerDescription:
      "Prepared for future cloud unlock using the Messages API. It is locked and unused in this public local pass.",
    status: "locked",
  },
  {
    id: "google-gemini",
    displayName: "Google Gemini",
    type: "cloud",
    enabledByDefault: false,
    cloudUnlockRequired: true,
    baseUrlDefault: "https://generativelanguage.googleapis.com",
    authType: "api-key",
    supportedApiStyle: "gemini-generate-content",
    supportsStreaming: true,
    supportsVision: true,
    beginnerDescription:
      "Prepared for future cloud unlock using generateContent and streamGenerateContent style calls. It is locked and unused now.",
    status: "locked",
  },
] as const;

export function getProviderById(id: ProviderId): ProviderRegistryEntry | undefined {
  return PROVIDER_REGISTRY.find((provider) => provider.id === id);
}

export function getActiveProviders(): ProviderRegistryEntry[] {
  return PROVIDER_REGISTRY.filter((provider) => provider.status === "active" && provider.enabledByDefault);
}

export function getLockedCloudProviders(): ProviderRegistryEntry[] {
  return PROVIDER_REGISTRY.filter((provider) => provider.cloudUnlockRequired);
}

export function cloudProvidersAreLockedByDefault(): boolean {
  return PROVIDER_REGISTRY
    .filter((provider) => provider.type !== "local")
    .every((provider) => !provider.enabledByDefault && provider.cloudUnlockRequired && provider.status === "locked");
}
