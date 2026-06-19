import { describe, expect, it } from "vitest";
import {
  PROVIDER_DESCRIPTIONS,
  RECOMMENDED_MODELS,
  buildVerifySetupResult,
  getLlamaCppSetupGuide,
  getOllamaSetupGuide,
} from "./setup";
import type { DetectionResult } from "./detection";

describe("provider descriptions", () => {
  it("has descriptions for both local providers", () => {
    expect(PROVIDER_DESCRIPTIONS.ollama.name).toBe("Ollama");
    expect(PROVIDER_DESCRIPTIONS["llama-cpp"].name).toMatch(/llama/i);
  });

  it("includes learn-more URLs", () => {
    expect(PROVIDER_DESCRIPTIONS.ollama.learnMoreUrl).toMatch(/^https?:\/\//);
    expect(PROVIDER_DESCRIPTIONS["llama-cpp"].learnMoreUrl).toMatch(/^https?:\/\//);
  });
});

describe("Ollama setup guide", () => {
  it("generates OS-specific steps for macOS", () => {
    const guide = getOllamaSetupGuide("macos");
    expect(guide.steps.length).toBeGreaterThan(0);
    expect(guide.steps[0].command).toMatch(/brew/);
  });

  it("generates OS-specific steps for linux", () => {
    const guide = getOllamaSetupGuide("linux");
    expect(guide.steps[0].command).toMatch(/curl/);
  });

  it("includes a pull-model step", () => {
    const guide = getOllamaSetupGuide("macos");
    const pullStep = guide.steps.find((s) => s.command?.includes("ollama pull"));
    expect(pullStep).toBeDefined();
  });

  it("includes a verify step", () => {
    const guide = getOllamaSetupGuide("macos");
    const verifyStep = guide.steps.find((s) => s.command?.includes("ollama list"));
    expect(verifyStep).toBeDefined();
  });
});

describe("llama-cpp setup guide", () => {
  it("generates OS-specific steps for linux", () => {
    const guide = getLlamaCppSetupGuide("linux");
    expect(guide.steps.length).toBeGreaterThan(0);
    expect(guide.steps[0].command).toMatch(/git clone/);
  });

  it("includes llama-server start command", () => {
    const guide = getLlamaCppSetupGuide("linux");
    const startStep = guide.steps.find((s) => s.command?.includes("llama-server"));
    expect(startStep).toBeDefined();
  });

  it("mentions PEH_LOCAL_BACKEND env var", () => {
    const guide = getLlamaCppSetupGuide("linux");
    const envStep = guide.steps.find((s) => s.detail?.includes("PEH_LOCAL_BACKEND"));
    expect(envStep).toBeDefined();
  });
});

describe("model recommendations", () => {
  it("has at least 3 recommendations", () => {
    expect(RECOMMENDED_MODELS.length).toBeGreaterThanOrEqual(3);
  });

  it("each recommendation has limitations text (honest)", () => {
    for (const rec of RECOMMENDED_MODELS) {
      expect(rec.limitations.length).toBeGreaterThan(0);
    }
  });
});

describe("buildVerifySetupResult", () => {
  it("reports no server when nothing detected", () => {
    const result = buildVerifySetupResult({
      detected: null,
      ollamaAvailable: false,
      llamaCppAvailable: false,
      message: "Nothing found.",
    });

    expect(result.serverReachable).toBe(false);
    expect(result.detectedBackend).toBeNull();
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("reports server with no models for Ollama", () => {
    const result = buildVerifySetupResult({
      detected: "ollama",
      ollamaAvailable: true,
      llamaCppAvailable: false,
      ollamaHealth: {
        ok: true,
        provider: "local",
        endpoint: "http://localhost:11434",
        modelCount: 0,
        cloudUsed: false,
      },
      message: "Ollama running.",
    });

    expect(result.serverReachable).toBe(true);
    expect(result.modelsAvailable).toBe(false);
    expect(result.suggestions[0]).toMatch(/ollama pull/);
  });

  it("reports server with no models for llama-cpp", () => {
    const result = buildVerifySetupResult({
      detected: "llama-cpp",
      ollamaAvailable: false,
      llamaCppAvailable: true,
      llamaCppHealth: {
        ok: true,
        provider: "local",
        backendType: "llama-cpp",
        endpoint: "http://localhost:8080",
        modelCount: 0,
        cloudUsed: false,
      },
      message: "llama-server running.",
    });

    expect(result.serverReachable).toBe(true);
    expect(result.modelsAvailable).toBe(false);
    expect(result.suggestions[0]).toMatch(/llama-server/);
  });

  it("reports ready when models are available", () => {
    const result = buildVerifySetupResult({
      detected: "ollama",
      ollamaAvailable: true,
      llamaCppAvailable: false,
      ollamaHealth: {
        ok: true,
        provider: "local",
        endpoint: "http://localhost:11434",
        modelCount: 3,
        cloudUsed: false,
      },
      message: "Ollama ready.",
    });

    expect(result.serverReachable).toBe(true);
    expect(result.modelsAvailable).toBe(true);
    expect(result.modelCount).toBe(3);
    expect(result.suggestions).toEqual([]);
  });
});
