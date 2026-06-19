/**
 * Tests for llama-cpp backend support in the chat handler.
 */
import { describe, it, expect, vi } from "vitest";
import { handleChatRequest } from "./handler";
import type { LocalProviderConfig } from "@/lib/providers/local";

const llamaCppConfig: LocalProviderConfig = {
  providerId: "local",
  endpoint: "http://test-local:8080",
  model: "llama-3.2-3b",
  backendType: "llama-cpp",
  cloudUsed: false,
  toolsUsed: false,
};

function fakeOk(json: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => json,
    text: async () => JSON.stringify(json),
  } as unknown as Response;
}

function fakeStatus(status: number, body = ""): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  } as unknown as Response;
}

describe("handleChatRequest — llama-cpp backend", () => {
  it("calls the OpenAI-compatible /v1/chat/completions endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeOk({
        choices: [{ message: { role: "assistant", content: "hello from llama-server" } }],
        usage: { prompt_tokens: 5, completion_tokens: 10 },
      }),
    );

    const result = await handleChatRequest({
      body: { message: "hello" },
      config: llamaCppConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 1000,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://test-local:8080/v1/chat/completions");
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.model).toBe("llama-3.2-3b");
    expect(sentBody.stream).toBe(false);
    expect(sentBody.messages[0]).toMatchObject({ role: "system" });
    expect(sentBody.messages[0].content).toMatch(/Public local-only mode/);
    expect(sentBody.messages.slice(1)).toEqual([{ role: "user", content: "hello" }]);

    expect(result.status).toBe(200);
    if (result.payload.ok) {
      expect(result.payload.provider).toBe("local");
      expect(result.payload.cloudUsed).toBe(false);
      expect(result.payload.toolsUsed).toBe(false);
      expect(result.payload.reply).toBe("hello from llama-server");
      expect(result.payload.promptEvalCount).toBe(5);
      expect(result.payload.evalCount).toBe(10);
      expect(result.payload.model).toBe("llama-3.2-3b");
    } else {
      throw new Error("expected success");
    }
  });

  it("returns beginner-friendly error when llama-server is unreachable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const result = await handleChatRequest({
      body: { message: "hi" },
      config: llamaCppConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.status).toBe(503);
    if (!result.payload.ok) {
      expect(result.payload.error.code).toBe("local_provider_unreachable");
      expect(result.payload.error.message).toMatch(/local model server/i);
      expect(result.payload.error.message).toMatch(/llama-server/i);
      expect(result.payload.cloudUsed).toBe(false);
    }
  });

  it("returns model-missing error with llama-server guidance", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeStatus(404));
    const result = await handleChatRequest({
      body: { message: "hi", model: "nonesuch" },
      config: llamaCppConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.status).toBe(404);
    if (!result.payload.ok) {
      expect(result.payload.error.code).toBe("local_provider_model_missing");
      expect(result.payload.error.message).toContain("nonesuch");
      expect(result.payload.error.message).toMatch(/llama-server/i);
      // Should NOT mention ollama pull for llama-cpp backend
      expect(result.payload.error.message).not.toMatch(/ollama pull/);
    }
  });

  it("resolvedBackend override takes precedence over config", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeOk({
        choices: [{ message: { role: "assistant", content: "ok" } }],
      }),
    );

    await handleChatRequest({
      body: { message: "hi" },
      config: { ...llamaCppConfig, backendType: "ollama" },
      resolvedBackend: "llama-cpp",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://test-local:8080/v1/chat/completions");
  });

  it("always returns cloudUsed=false and toolsUsed=false", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeOk({ choices: [{ message: { content: "ok" } }] }),
    );
    const result = await handleChatRequest({
      body: { message: "hi" },
      config: llamaCppConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.payload.cloudUsed).toBe(false);
    expect(result.payload.toolsUsed).toBe(false);
  });

  it("never contacts a non-configured endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeOk({ choices: [{ message: { content: "ok" } }] }),
    );
    await handleChatRequest({
      body: { message: "hi" },
      config: llamaCppConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    for (const call of fetchImpl.mock.calls) {
      const url = String(call[0]);
      expect(url.startsWith(llamaCppConfig.endpoint)).toBe(true);
    }
  });

  it("handles empty choices array gracefully", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeOk({ choices: [] }),
    );
    const result = await handleChatRequest({
      body: { message: "hi" },
      config: llamaCppConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.status).toBe(200);
    if (result.payload.ok) {
      expect(result.payload.reply).toBe("");
    }
  });
});

describe("handleChatRequest — no cloud escalation", () => {
  it("does not attempt cloud escalation when local fails for llama-cpp", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));
    const result = await handleChatRequest({
      body: { message: "hi" },
      config: llamaCppConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.payload.cloudUsed).toBe(false);
  });
});
