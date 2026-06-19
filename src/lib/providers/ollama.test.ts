import { describe, expect, it, vi } from "vitest";
import type { LocalProviderConfig } from "./local";
import {
  chooseDefaultModel,
  normalizeOllamaModelName,
  normalizeOllamaTags,
  probeLocalHealth,
} from "./ollama";

const config: LocalProviderConfig = {
  providerId: "local",
  endpoint: "http://test-local:11434",
  model: "llama3.2",
  backendType: "ollama",
  cloudUsed: false,
  toolsUsed: false,
};

function fakeOk(json: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => json,
  } as unknown as Response;
}

describe("Ollama model normalization", () => {
  it("normalizes /api/tags models into public model data", () => {
    const models = normalizeOllamaTags({
      models: [
        {
          name: "llama3.2:latest",
          size: 2019393189,
          modified_at: "2026-04-01T00:00:00Z",
        },
        { model: "qwen2.5:3b" },
        { name: "  " },
      ],
    });

    expect(models).toEqual([
      {
        name: "llama3.2:latest",
        displayName: "llama3.2 latest",
        size: 2019393189,
        modifiedAt: "2026-04-01T00:00:00Z",
      },
      {
        name: "qwen2.5:3b",
        displayName: "qwen2.5 3b",
      },
    ]);
  });

  it("returns an empty list for missing or malformed tags", () => {
    expect(normalizeOllamaTags({})).toEqual([]);
    expect(normalizeOllamaTags({ models: "nope" })).toEqual([]);
  });

  it("keeps display names beginner-readable without changing model ids", () => {
    expect(normalizeOllamaModelName("llama3.2:latest")).toBe("llama3.2 latest");
    expect(normalizeOllamaModelName("nomic-embed-text")).toBe("nomic-embed-text");
  });
});

describe("model selector fallback", () => {
  it("uses the configured model when it is installed", () => {
    expect(
      chooseDefaultModel({
        configuredModel: "llama3.2",
        models: [{ name: "llama3.2", displayName: "llama3.2" }],
      }),
    ).toBe("llama3.2");
  });

  it("falls back to the first discovered model", () => {
    expect(
      chooseDefaultModel({
        configuredModel: "missing",
        models: [
          { name: "qwen2.5:3b", displayName: "qwen2.5 3b" },
          { name: "llama3.2", displayName: "llama3.2" },
        ],
      }),
    ).toBe("qwen2.5:3b");
  });

  it("skips likely embedding models when choosing a fallback", () => {
    expect(
      chooseDefaultModel({
        configuredModel: "missing",
        models: [
          { name: "all-minilm:latest", displayName: "all-minilm latest" },
          { name: "nomic-embed-text:latest", displayName: "nomic embed text latest" },
          { name: "llama3.2:3b", displayName: "llama3.2 3b" },
        ],
      }),
    ).toBe("llama3.2:3b");
  });

  it("prefers an installed configured-model variant before the first discovered model", () => {
    expect(
      chooseDefaultModel({
        configuredModel: "llama3.2",
        models: [
          { name: "all-minilm:latest", displayName: "all-minilm latest" },
          { name: "llama3.2:3b", displayName: "llama3.2 3b" },
        ],
      }),
    ).toBe("llama3.2:3b");
  });

  it("returns an empty string when no local models are discovered", () => {
    expect(chooseDefaultModel({ configuredModel: "llama3.2", models: [] })).toBe("");
  });
});

describe("local health probe", () => {
  it("returns model count and local-only flags when Ollama is reachable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeOk({ models: [{ name: "llama3.2" }, { name: "qwen2.5:3b" }] }),
    );

    const health = await probeLocalHealth({
      config,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledWith("http://test-local:11434/api/tags", {
      method: "GET",
    });
    expect(health).toEqual({
      ok: true,
      provider: "local",
      backendType: "ollama",
      endpoint: "http://test-local:11434",
      modelCount: 2,
      cloudUsed: false,
    });
  });

  it("returns a friendly unavailable payload without stack traces", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const health = await probeLocalHealth({
      config,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(health.ok).toBe(false);
    expect(health.provider).toBe("local");
    expect(health.cloudUsed).toBe(false);
    expect(health.errorCode).toBe("local_provider_unreachable");
    expect(health.reason).toMatch(/local model server/i);
    expect(health.reason).not.toMatch(/ECONNREFUSED/);
  });
});
