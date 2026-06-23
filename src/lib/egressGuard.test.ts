/**
 * Egress guard tests.
 *
 * These tests verify a single property: when the production server-side
 * handlers run, they only attempt to fetch local endpoints. We replace
 * the global `fetch` with an interceptor that:
 *   - Fails the test if the destination is not a local URL.
 *   - Returns a stub Response so the handler exits cleanly.
 *
 * This is the automated complement to `scripts/prove-local-only.mjs` and
 * `scripts/egress-proof.sh`. It runs on every CI test.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { handleChatRequest } from "@/lib/chat/handler";
import { openLocalChatStream } from "@/lib/chat/stream";
import { getLocalProviderConfig, type LocalProviderConfig } from "@/lib/providers/local";
import { detectLocalBackend } from "@/lib/providers/detection";
import { POST as workshopSuggest } from "@/app/api/workshop/suggest/route";
import { POST as visionAnalyze } from "@/app/api/vision/analyze/route";
import { GET as localModels } from "@/app/api/local/models/route";
import { GET as localHealth } from "@/app/api/local/health/route";

function isLocalUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host === "[::1]") return true;
  if (host.endsWith(".local") || host.endsWith(".test") || host.endsWith(".invalid")) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  return false;
}

function installEgressGuard(): { attempts: string[]; restore: () => void } {
  const attempts: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    attempts.push(url);
    if (!isLocalUrl(url)) {
      throw new Error(`EGRESS_GUARD_FAIL: non-local fetch attempted: ${url}`);
    }
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return {
    attempts,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const ollamaConfig: LocalProviderConfig = {
  providerId: "local",
  endpoint: "http://localhost:11434",
  model: "llama3.2",
  backendType: "ollama",
  cloudUsed: false,
  toolsUsed: false,
};

const llamaConfig: LocalProviderConfig = {
  providerId: "local",
  endpoint: "http://localhost:8080",
  model: "llama-3.2-3b",
  backendType: "llama-cpp",
  cloudUsed: false,
  toolsUsed: false,
};

describe("egress guard — every server-side fetch hits a local URL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isLocalUrl rejects cloud endpoints up front", () => {
    expect(isLocalUrl("https://api.openai.com/v1/chat/completions")).toBe(false);
    expect(isLocalUrl("https://api.anthropic.com/v1/messages")).toBe(false);
    expect(isLocalUrl("https://openrouter.ai/api/v1/chat/completions")).toBe(false);
    expect(isLocalUrl("https://generativelanguage.googleapis.com")).toBe(false);
    expect(isLocalUrl("http://8.8.8.8:11434")).toBe(false);
    expect(isLocalUrl("http://localhost:11434/api/chat")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1:8080/v1/chat/completions")).toBe(true);
  });

  it("chat handler (ollama) only touches local URLs", async () => {
    const guard = installEgressGuard();
    try {
      await handleChatRequest({ body: { message: "hi" }, config: ollamaConfig });
      expect(guard.attempts.length).toBeGreaterThan(0);
      for (const url of guard.attempts) expect(isLocalUrl(url)).toBe(true);
    } finally {
      guard.restore();
    }
  });

  it("chat handler (llama-cpp) only touches local URLs", async () => {
    const guard = installEgressGuard();
    try {
      await handleChatRequest({
        body: { message: "hi" },
        config: llamaConfig,
        resolvedBackend: "llama-cpp",
      });
      for (const url of guard.attempts) expect(isLocalUrl(url)).toBe(true);
    } finally {
      guard.restore();
    }
  });

  it("stream handler (ollama) only touches local URLs", async () => {
    const guard = installEgressGuard();
    try {
      await openLocalChatStream({ body: { message: "hi" }, config: ollamaConfig });
      for (const url of guard.attempts) expect(isLocalUrl(url)).toBe(true);
    } finally {
      guard.restore();
    }
  });

  it("stream handler (llama-cpp) only touches local URLs", async () => {
    const guard = installEgressGuard();
    try {
      await openLocalChatStream({
        body: { message: "hi" },
        config: llamaConfig,
        resolvedBackend: "llama-cpp",
      });
      for (const url of guard.attempts) expect(isLocalUrl(url)).toBe(true);
    } finally {
      guard.restore();
    }
  });

  it("detection probe only touches local URLs in auto mode", async () => {
    const guard = installEgressGuard();
    try {
      const autoConfig = getLocalProviderConfig({ PEH_LOCAL_BACKEND: "auto" });
      await detectLocalBackend({ config: autoConfig });
      for (const url of guard.attempts) expect(isLocalUrl(url)).toBe(true);
    } finally {
      guard.restore();
    }
  });

  it("/api/local/health only touches local URLs", async () => {
    const guard = installEgressGuard();
    try {
      await localHealth();
      for (const url of guard.attempts) expect(isLocalUrl(url)).toBe(true);
    } finally {
      guard.restore();
    }
  });

  it("/api/local/models only touches local URLs", async () => {
    const guard = installEgressGuard();
    try {
      await localModels();
      for (const url of guard.attempts) expect(isLocalUrl(url)).toBe(true);
    } finally {
      guard.restore();
    }
  });

  it("/api/workshop/suggest only touches local URLs", async () => {
    const guard = installEgressGuard();
    try {
      await workshopSuggest(
        new Request("http://test.invalid/api/workshop/suggest", {
          method: "POST",
          body: JSON.stringify({
            fileName: "demo.ts",
            language: "typescript",
            originalContent: "const x = 1;",
            requestedChange: "rename x to count",
          }),
        }),
      );
      for (const url of guard.attempts) expect(isLocalUrl(url)).toBe(true);
    } finally {
      guard.restore();
    }
  });

  it("/api/vision/analyze only touches local URLs", async () => {
    const guard = installEgressGuard();
    try {
      await visionAnalyze(
        new Request("http://test.invalid/api/vision/analyze", {
          method: "POST",
          body: JSON.stringify({
            imageBase64: "iVBORw0KGgo=",
            model: "qwen3-vl:4b",
          }),
        }),
      );
      for (const url of guard.attempts) expect(isLocalUrl(url)).toBe(true);
    } finally {
      guard.restore();
    }
  });

  it("cloud env vars set during a chat request do not change destinations", async () => {
    const guard = installEgressGuard();
    const prev = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    };
    process.env.OPENAI_API_KEY = "sk-egress-test-should-not-matter";
    process.env.ANTHROPIC_API_KEY = "anth-egress-test-should-not-matter";
    process.env.GEMINI_API_KEY = "g-egress-test-should-not-matter";
    process.env.OPENROUTER_API_KEY = "or-egress-test-should-not-matter";
    try {
      const cfg = getLocalProviderConfig({
        PEH_LOCAL_ENDPOINT: "http://localhost:11434",
        PEH_LOCAL_MODEL: "llama3.2",
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      });
      await handleChatRequest({ body: { message: "hi" }, config: cfg });
      for (const url of guard.attempts) expect(isLocalUrl(url)).toBe(true);
    } finally {
      guard.restore();
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
        else process.env[k] = v;
      }
    }
  });
});
