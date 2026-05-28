/**
 * Tool-honesty integration tests.
 *
 * Public Squidley ships zero action tools. These tests prove that when the
 * local model TEXT claims a tool action, the chat handler surfaces a
 * user-visible correction and does NOT let the answer slip through as a
 * success claim.
 */
import { describe, expect, it, vi } from "vitest";
import { handleChatRequest } from "@/lib/chat/handler";
import type { LocalProviderConfig } from "@/lib/providers/local";

const ollamaConfig: LocalProviderConfig = {
  providerId: "local",
  endpoint: "http://test-local:11434",
  model: "test-model",
  backendType: "ollama",
  cloudUsed: false,
  toolsUsed: false,
};

const llamaCppConfig: LocalProviderConfig = {
  providerId: "local",
  endpoint: "http://test-local:8080",
  model: "test-model",
  backendType: "llama-cpp",
  cloudUsed: false,
  toolsUsed: false,
};

function fakeOllama(reply: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ message: { content: reply }, prompt_eval_count: 4, eval_count: 7 }),
    text: async () => JSON.stringify({ message: { content: reply } }),
  } as unknown as Response;
}

function fakeLlamaCpp(reply: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { role: "assistant", content: reply } }],
      usage: { prompt_tokens: 4, completion_tokens: 7 },
    }),
    text: async () =>
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: reply } }],
      }),
  } as unknown as Response;
}

describe("tool honesty — Ollama path", () => {
  it("model-only reply: responseMode=local_model, no honestyMessage", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeOllama("Here is a draft you can copy."));
    const result = await handleChatRequest({
      body: { message: "draft a note" },
      config: ollamaConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe(200);
    if (!result.payload.ok) throw new Error("expected ok=true");
    expect(result.payload.responseMode).toBe("local_model");
    expect(result.payload.honestyMessage).toBeUndefined();
    expect(result.payload.unavailableTools).toBeUndefined();
    expect(result.payload.cloudUsed).toBe(false);
    expect(result.payload.toolsUsed).toBe(false);
  });

  it("hallucinated fs.write: honestyMessage explains no file was saved", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeOllama("I wrote the file notes.md for you."));
    const result = await handleChatRequest({
      body: { message: "save it" },
      config: ollamaConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    if (!result.payload.ok) throw new Error("expected ok=true");
    expect(result.payload.responseMode).toBe("local_model");
    expect(result.payload.honestyMessage).toMatch(/no file-write tool|did not save/i);
    expect(result.payload.unavailableTools).toContain("fs.write");
    // The reply text itself is preserved unchanged.
    expect(result.payload.reply).toBe("I wrote the file notes.md for you.");
  });

  it("hallucinated shell: honestyMessage explains no command was run", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeOllama("I ran the tests and they passed."));
    const result = await handleChatRequest({
      body: { message: "run the tests" },
      config: ollamaConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    if (!result.payload.ok) throw new Error("expected ok=true");
    expect(result.payload.honestyMessage).toMatch(/run shell commands|Nothing was run/i);
    expect(result.payload.unavailableTools).toContain("shell");
  });

  it("hallucinated web search: honestyMessage explains no web call was made", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeOllama("I searched the web and found an article."));
    const result = await handleChatRequest({
      body: { message: "look up X" },
      config: ollamaConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    if (!result.payload.ok) throw new Error("expected ok=true");
    expect(result.payload.honestyMessage).toMatch(/web\/search\/browser tool|No web request was made/i);
    expect(result.payload.unavailableTools).toContain("web_search");
    // Critically, the fetchImpl must NOT have been called a second time for
    // a web search — only the local Ollama endpoint.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://test-local:11434/api/chat");
  });

  it("multiple hallucinations: all surface in unavailableTools", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeOllama(
        "I read your project, I ran the tests, and I committed the fix.",
      ),
    );
    const result = await handleChatRequest({
      body: { message: "do all the things" },
      config: ollamaConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    if (!result.payload.ok) throw new Error("expected ok=true");
    expect(result.payload.unavailableTools).toEqual(
      expect.arrayContaining(["fs.read", "shell", "git_commit"]),
    );
  });

  it("hedged claim like 'I can write the file' is NOT flagged", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeOllama("I can draft the file contents for you to copy."));
    const result = await handleChatRequest({
      body: { message: "draft a file" },
      config: ollamaConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    if (!result.payload.ok) throw new Error("expected ok=true");
    expect(result.payload.honestyMessage).toBeUndefined();
  });
});

describe("tool honesty — llama-cpp path", () => {
  it("hallucinated fs.write on OpenAI-compatible backend is also corrected", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeLlamaCpp("I've saved the file to disk."));
    const result = await handleChatRequest({
      body: { message: "save it" },
      config: llamaCppConfig,
      resolvedBackend: "llama-cpp",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    if (!result.payload.ok) throw new Error("expected ok=true");
    expect(result.payload.responseMode).toBe("local_model");
    expect(result.payload.honestyMessage).toMatch(/file-write tool|did not save/i);
    expect(result.payload.unavailableTools).toContain("fs.write");
  });
});

describe("tool honesty — provenance invariants", () => {
  it("cloudUsed and toolsUsed remain false even for hallucinated tool replies", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeOllama("I ran the deploy script and pushed to prod."));
    const result = await handleChatRequest({
      body: { message: "deploy" },
      config: ollamaConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    if (!result.payload.ok) throw new Error("expected ok=true");
    expect(result.payload.cloudUsed).toBe(false);
    expect(result.payload.toolsUsed).toBe(false);
    expect(result.payload.responseMode).toBe("local_model");
  });
});
