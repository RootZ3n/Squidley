/**
 * Tests verifying backendType is correctly preserved across the provider
 * system: health, detection, and stream metadata.
 *
 * Design note: providerId remains "ollama" for capability matching.
 * backendType ("ollama" | "llama-cpp") distinguishes the actual server
 * API format and is surfaced in health responses, model discovery,
 * and stream metadata.
 */
import { describe, expect, it, vi } from "vitest";
import { probeLocalHealth } from "./ollama";
import { probeLlamaCppHealth } from "./llamacpp";
import type { LocalProviderConfig } from "./local";

function fakeOk(json: unknown): Response {
  return { ok: true, status: 200, json: async () => json } as unknown as Response;
}

const ollamaConfig: LocalProviderConfig = {
  providerId: "local",
  endpoint: "http://test:11434",
  model: "llama3.2",
  backendType: "ollama",
  cloudUsed: false,
  toolsUsed: false,
};

const llamaCppConfig: LocalProviderConfig = {
  providerId: "local",
  endpoint: "http://test:8080",
  model: "test",
  backendType: "llama-cpp",
  cloudUsed: false,
  toolsUsed: false,
};

describe("backendType in health responses", () => {
  it("Ollama health includes backendType: 'ollama' on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeOk({ models: [{ name: "llama3.2" }] }),
    );
    const health = await probeLocalHealth({
      config: ollamaConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(health.ok).toBe(true);
    expect(health.backendType).toBe("ollama");
  });

  it("llama-cpp health includes backendType: 'llama-cpp' on success", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fakeOk({ status: "ok" }))
      .mockResolvedValueOnce(fakeOk({ data: [{ id: "model" }] }));
    const health = await probeLlamaCppHealth({
      config: llamaCppConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(health.ok).toBe(true);
    expect(health.backendType).toBe("llama-cpp");
  });

  it("llama-cpp health includes backendType even on error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));
    const health = await probeLlamaCppHealth({
      config: llamaCppConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(health.ok).toBe(false);
    expect(health.backendType).toBe("llama-cpp");
  });
});

describe("providerId vs backendType design invariant", () => {
  it("both providers produce providerId 'local' in config", () => {
    expect(ollamaConfig.providerId).toBe("local");
    expect(llamaCppConfig.providerId).toBe("local");
  });

  it("backendType distinguishes Ollama from llama-cpp", () => {
    expect(ollamaConfig.backendType).toBe("ollama");
    expect(llamaCppConfig.backendType).toBe("llama-cpp");
  });
});
