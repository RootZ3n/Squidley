import { describe, expect, it, vi } from "vitest";
import type { LocalProviderConfig } from "./local";
import { detectLocalBackend } from "./detection";

function makeConfig(overrides: Partial<LocalProviderConfig> = {}): LocalProviderConfig {
  return {
    providerId: "local",
    endpoint: "http://localhost:11434",
    model: "llama3.2",
    backendType: "auto",
    cloudUsed: false,
    toolsUsed: false,
    ...overrides,
  };
}

function fakeOk(json: unknown): Response {
  return { ok: true, status: 200, json: async () => json } as unknown as Response;
}

function fakeError(status = 500): Response {
  return { ok: false, status } as unknown as Response;
}

describe("detectLocalBackend", () => {
  it("detects Ollama when explicitly configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeOk({ models: [{ name: "llama3.2" }] }),
    );

    const result = await detectLocalBackend({
      config: makeConfig({ backendType: "ollama" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.detected).toBe("ollama");
    expect(result.ollamaAvailable).toBe(true);
    expect(result.llamaCppAvailable).toBe(false);
  });

  it("detects llama-cpp when explicitly configured", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fakeOk({ status: "ok" })) // /health
      .mockResolvedValueOnce(fakeOk({ data: [{ id: "model" }] })); // /v1/models

    const result = await detectLocalBackend({
      config: makeConfig({ backendType: "llama-cpp" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.detected).toBe("llama-cpp");
    expect(result.llamaCppAvailable).toBe(true);
    expect(result.ollamaAvailable).toBe(false);
  });

  it("auto-detects Ollama first when both could work", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeOk({ models: [{ name: "llama3.2" }] }),
    );

    const result = await detectLocalBackend({
      config: makeConfig({ backendType: "auto" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.detected).toBe("ollama");
  });

  it("falls back to llama-cpp when Ollama fails during auto-detect", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED")) // Ollama probe fails
      .mockResolvedValueOnce(fakeOk({ status: "ok" })) // llama-cpp /health
      .mockResolvedValueOnce(fakeOk({ data: [{ id: "model" }] })); // llama-cpp /v1/models

    const result = await detectLocalBackend({
      config: makeConfig({ backendType: "auto" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.detected).toBe("llama-cpp");
    expect(result.ollamaAvailable).toBe(false);
    expect(result.llamaCppAvailable).toBe(true);
  });

  it("returns null when neither provider is available", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await detectLocalBackend({
      config: makeConfig({ backendType: "auto" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.detected).toBeNull();
    expect(result.ollamaAvailable).toBe(false);
    expect(result.llamaCppAvailable).toBe(false);
    expect(result.message).toMatch(/No local model server/i);
  });

  it("returns unavailable message when explicit provider is down", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));

    const result = await detectLocalBackend({
      config: makeConfig({ backendType: "ollama" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.detected).toBeNull();
    expect(result.message).toMatch(/not.*running|not reachable/i);
  });

  it("never reports cloud usage", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));

    const result = await detectLocalBackend({
      config: makeConfig({ backendType: "auto" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ollamaHealth?.cloudUsed).toBe(false);
  });
});
