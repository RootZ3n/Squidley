import { describe, expect, it } from "vitest";
import {
  PROVIDER_REGISTRY,
  cloudProvidersAreLockedByDefault,
  getActiveProviders,
  getLockedCloudProviders,
  getProviderById,
} from "./registry";

describe("provider registry", () => {
  it("keeps Ollama active as the only enabled default provider", () => {
    expect(getActiveProviders().map((provider) => provider.id)).toEqual(["ollama"]);
    expect(getProviderById("ollama")).toMatchObject({
      type: "local",
      enabledByDefault: true,
      cloudUnlockRequired: false,
      baseUrlDefault: "http://localhost:11434",
      supportedApiStyle: "ollama-chat",
      status: "active",
    });
  });

  it("keeps cloud providers locked by default", () => {
    expect(cloudProvidersAreLockedByDefault()).toBe(true);
    expect(getLockedCloudProviders().map((provider) => provider.id).sort()).toEqual([
      "anthropic",
      "google-gemini",
      "openai",
      "openrouter",
    ]);
  });

  it("records future provider API styles as metadata only", () => {
    expect(getProviderById("openrouter")?.supportedApiStyle).toBe("openai-chat-compatible");
    expect(getProviderById("openai")?.supportedApiStyle).toBe("openai-responses");
    expect(getProviderById("anthropic")?.supportedApiStyle).toBe("anthropic-messages");
    expect(getProviderById("google-gemini")?.supportedApiStyle).toBe("gemini-generate-content");
  });

  it("does not include API key fields or secret values", () => {
    const serialized = JSON.stringify(PROVIDER_REGISTRY).toLowerCase();
    expect(serialized).not.toContain("apikey");
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("bearer");
  });
});
