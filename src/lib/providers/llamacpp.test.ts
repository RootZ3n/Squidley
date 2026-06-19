import { describe, expect, it, vi } from "vitest";
import type { LocalProviderConfig } from "./local";
import {
  extractOpenAIReply,
  extractOpenAIUsage,
  hasReasoningOnly,
  llamaCppChatUrl,
  llamaCppHealthUrl,
  llamaCppModelsUrl,
  normalizeLlamaCppModelName,
  normalizeLlamaCppModels,
  parseOpenAIStreamLine,
  probeLlamaCppHealth,
} from "./llamacpp";

const config: LocalProviderConfig = {
  providerId: "local",
  endpoint: "http://test-local:8080",
  model: "test-model",
  backendType: "llama-cpp",
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

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

describe("llama-cpp URL helpers", () => {
  it("builds correct health URL", () => {
    expect(llamaCppHealthUrl(config)).toBe("http://test-local:8080/health");
  });

  it("builds correct models URL", () => {
    expect(llamaCppModelsUrl(config)).toBe("http://test-local:8080/v1/models");
  });

  it("builds correct chat URL", () => {
    expect(llamaCppChatUrl(config)).toBe("http://test-local:8080/v1/chat/completions");
  });
});

// ---------------------------------------------------------------------------
// Model normalization
// ---------------------------------------------------------------------------

describe("llama-cpp model normalization", () => {
  it("normalizes OpenAI /v1/models response", () => {
    const models = normalizeLlamaCppModels({
      object: "list",
      data: [
        { id: "llama-3.2-3b-q4_k_m", object: "model", owned_by: "llamacpp" },
        { id: "qwen2.5-7b.gguf", object: "model" },
      ],
    });

    expect(models).toEqual([
      { name: "llama-3.2-3b-q4_k_m", displayName: "llama-3.2-3b-q4_k_m" },
      { name: "qwen2.5-7b.gguf", displayName: "qwen2.5-7b" },
    ]);
  });

  it("returns empty list for missing or malformed data", () => {
    expect(normalizeLlamaCppModels({})).toEqual([]);
    expect(normalizeLlamaCppModels({ data: "nope" })).toEqual([]);
    expect(normalizeLlamaCppModels(null)).toEqual([]);
  });

  it("skips entries with empty ids", () => {
    expect(normalizeLlamaCppModels({ data: [{ id: "  " }, { id: "" }] })).toEqual([]);
  });
});

describe("llama-cpp model name normalization", () => {
  it("strips .gguf extension", () => {
    expect(normalizeLlamaCppModelName("model.gguf")).toBe("model");
    expect(normalizeLlamaCppModelName("Model.GGUF")).toBe("Model");
  });

  it("strips path prefix", () => {
    expect(normalizeLlamaCppModelName("/models/llama-3.2-3b.gguf")).toBe("llama-3.2-3b");
  });

  it("preserves simple names", () => {
    expect(normalizeLlamaCppModelName("llama-3.2-3b-q4_k_m")).toBe("llama-3.2-3b-q4_k_m");
  });

  it("handles empty strings", () => {
    expect(normalizeLlamaCppModelName("")).toBe("");
    expect(normalizeLlamaCppModelName("  ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Health probe
// ---------------------------------------------------------------------------

describe("llama-cpp health probe", () => {
  it("returns healthy with model count when server and models are available", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fakeOk({ status: "ok" })) // /health
      .mockResolvedValueOnce(fakeOk({ // /v1/models
        data: [{ id: "test-model" }],
      }));

    const health = await probeLlamaCppHealth({
      config,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(health.ok).toBe(true);
    expect(health.provider).toBe("local");
    expect(health.backendType).toBe("llama-cpp");
    expect(health.modelCount).toBe(1);
    expect(health.cloudUsed).toBe(false);
    expect(fetchImpl).toHaveBeenCalledWith("http://test-local:8080/health", { method: "GET" });
  });

  it("returns healthy even if /v1/models fails (optional)", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fakeOk({ status: "ok" })) // /health
      .mockRejectedValueOnce(new Error("404")); // /v1/models fails

    const health = await probeLlamaCppHealth({
      config,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(health.ok).toBe(true);
    expect(health.modelCount).toBeUndefined();
  });

  it("returns unreachable when server is down", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const health = await probeLlamaCppHealth({
      config,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(health.ok).toBe(false);
    expect(health.errorCode).toBe("local_provider_unreachable");
    expect(health.reason).toMatch(/llama-server/i);
    expect(health.reason).not.toMatch(/ECONNREFUSED/);
    expect(health.cloudUsed).toBe(false);
  });

  it("returns error with loading hint when health returns 503", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response);

    const health = await probeLlamaCppHealth({
      config,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(health.ok).toBe(false);
    expect(health.errorCode).toBe("local_provider_error");
    expect(health.reason).toMatch(/loading/i);
  });
});

// ---------------------------------------------------------------------------
// OpenAI response parsing
// ---------------------------------------------------------------------------

describe("OpenAI chat response parsing", () => {
  it("extracts reply from standard response", () => {
    expect(
      extractOpenAIReply({
        choices: [{ message: { role: "assistant", content: "Hello!" } }],
      }),
    ).toBe("Hello!");
  });

  it("returns empty string for missing choices", () => {
    expect(extractOpenAIReply({})).toBe("");
    expect(extractOpenAIReply({ choices: [] })).toBe("");
    expect(extractOpenAIReply(null)).toBe("");
  });

  it("extracts usage tokens", () => {
    const usage = extractOpenAIUsage({
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
    expect(usage.promptTokens).toBe(10);
    expect(usage.completionTokens).toBe(20);
  });

  it("returns empty usage for missing data", () => {
    expect(extractOpenAIUsage({})).toEqual({});
    expect(extractOpenAIUsage(null)).toEqual({});
  });

  it("returns empty string when content is empty even if reasoning exists", () => {
    // extractOpenAIReply intentionally does NOT substitute reasoning for content.
    expect(
      extractOpenAIReply({
        choices: [{ message: { role: "assistant", content: "", reasoning_content: "I think..." } }],
      }),
    ).toBe("");
  });

  it("returns content when both content and reasoning exist", () => {
    expect(
      extractOpenAIReply({
        choices: [{ message: { content: "Hello!", reasoning_content: "thinking..." } }],
      }),
    ).toBe("Hello!");
  });
});

// ---------------------------------------------------------------------------
// hasReasoningOnly — reasoning field detection
// ---------------------------------------------------------------------------

describe("hasReasoningOnly", () => {
  it("returns false when content is present", () => {
    expect(hasReasoningOnly({
      choices: [{ message: { content: "Hello!" } }],
    })).toBe(false);
  });

  it("returns true when content is empty but reasoning_content exists", () => {
    expect(hasReasoningOnly({
      choices: [{ message: { content: "", reasoning_content: "I should say hello..." } }],
    })).toBe(true);
  });

  it("returns true when content is empty but reasoning exists", () => {
    expect(hasReasoningOnly({
      choices: [{ message: { content: "", reasoning: "Step 1..." } }],
    })).toBe(true);
  });

  it("returns true when content is empty but thinking exists", () => {
    expect(hasReasoningOnly({
      choices: [{ message: { content: "", thinking: "Let me think..." } }],
    })).toBe(true);
  });

  it("returns false when everything is empty", () => {
    expect(hasReasoningOnly({
      choices: [{ message: { content: "" } }],
    })).toBe(false);
  });

  it("returns false for missing choices", () => {
    expect(hasReasoningOnly({})).toBe(false);
    expect(hasReasoningOnly(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OpenAI streaming
// ---------------------------------------------------------------------------

describe("OpenAI stream line parsing", () => {
  it("parses a delta chunk", () => {
    const chunk = parseOpenAIStreamLine(
      'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}',
    );
    expect(chunk).toEqual({
      content: "Hi",
      done: false,
      promptTokens: undefined,
      completionTokens: undefined,
    });
  });

  it("detects end-of-stream with finish_reason=stop", () => {
    const chunk = parseOpenAIStreamLine(
      'data: {"choices":[{"delta":{"content":""},"finish_reason":"stop"}]}',
    );
    expect(chunk?.done).toBe(true);
  });

  it("handles [DONE] sentinel", () => {
    const chunk = parseOpenAIStreamLine("data: [DONE]");
    expect(chunk).toEqual({ content: "", done: true });
  });

  it("returns null for empty lines", () => {
    expect(parseOpenAIStreamLine("")).toBeNull();
    expect(parseOpenAIStreamLine("  ")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseOpenAIStreamLine("data: not-json")).toBeNull();
  });

  it("extracts usage from stream chunks that include it", () => {
    const chunk = parseOpenAIStreamLine(
      'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":10}}',
    );
    expect(chunk?.promptTokens).toBe(5);
    expect(chunk?.completionTokens).toBe(10);
  });
});
