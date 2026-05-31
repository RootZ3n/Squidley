import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOCAL_ENDPOINT,
  DEFAULT_LOCAL_MODEL,
  DEFAULT_LLAMACPP_ENDPOINT,
  ENV_KEYS,
  LOCAL_PROVIDER_ID,
  fetchLocalWithTimeout,
  getLocalProviderConfig,
  isAllowedLocalEndpoint,
} from "./local";

describe("local provider config", () => {
  it("uses sensible defaults when env is empty", () => {
    const cfg = getLocalProviderConfig({});
    expect(cfg.providerId).toBe(LOCAL_PROVIDER_ID);
    expect(cfg.endpoint).toBe(DEFAULT_LOCAL_ENDPOINT);
    expect(cfg.model).toBe(DEFAULT_LOCAL_MODEL);
    expect(cfg.backendType).toBe("auto");
    expect(cfg.cloudUsed).toBe(false);
    expect(cfg.toolsUsed).toBe(false);
  });

  it("reads PEH_LOCAL_ENDPOINT and PEH_LOCAL_MODEL overrides", () => {
    const cfg = getLocalProviderConfig({
      [ENV_KEYS.endpoint]: "http://127.0.0.1:9000",
      [ENV_KEYS.model]: "qwen2.5:3b",
    });
    expect(cfg.endpoint).toBe("http://127.0.0.1:9000");
    expect(cfg.model).toBe("qwen2.5:3b");
  });

  it("strips a trailing slash from the endpoint", () => {
    const cfg = getLocalProviderConfig({
      [ENV_KEYS.endpoint]: "http://localhost:11434/",
    });
    expect(cfg.endpoint).toBe("http://localhost:11434");
  });

  it("falls back to defaults when override is whitespace-only", () => {
    const cfg = getLocalProviderConfig({
      [ENV_KEYS.endpoint]: "   ",
      [ENV_KEYS.model]: "\t\n",
    });
    expect(cfg.endpoint).toBe(DEFAULT_LOCAL_ENDPOINT);
    expect(cfg.model).toBe(DEFAULT_LOCAL_MODEL);
  });

  it("falls back to defaults when override is undefined", () => {
    const cfg = getLocalProviderConfig({
      [ENV_KEYS.endpoint]: undefined,
      [ENV_KEYS.model]: undefined,
    });
    expect(cfg.endpoint).toBe(DEFAULT_LOCAL_ENDPOINT);
    expect(cfg.model).toBe(DEFAULT_LOCAL_MODEL);
  });

  it("rejects public internet endpoints and falls back to the local default", () => {
    const cfg = getLocalProviderConfig({
      [ENV_KEYS.endpoint]: "https://api.openai.com",
      [ENV_KEYS.model]: "any",
    });
    expect(cfg.endpoint).toBe(DEFAULT_LOCAL_ENDPOINT);
    expect(cfg.cloudUsed).toBe(false);
    expect(cfg.toolsUsed).toBe(false);
  });

  it("allows localhost, loopback, and private-network endpoints only", () => {
    expect(isAllowedLocalEndpoint("http://localhost:11434")).toBe(true);
    expect(isAllowedLocalEndpoint("http://127.0.0.1:11434")).toBe(true);
    expect(isAllowedLocalEndpoint("http://ollama.local:11434")).toBe(true);
    expect(isAllowedLocalEndpoint("http://192.168.1.5:11434")).toBe(true);
    expect(isAllowedLocalEndpoint("http://10.0.0.5:11434")).toBe(true);
    expect(isAllowedLocalEndpoint("http://172.16.0.5:11434")).toBe(true);
    expect(isAllowedLocalEndpoint("https://api.openai.com")).toBe(false);
    expect(isAllowedLocalEndpoint("http://8.8.8.8:11434")).toBe(false);
    expect(isAllowedLocalEndpoint("http://example.com:11434")).toBe(false);
  });

  it("parses PEH_LOCAL_BACKEND as backend type", () => {
    expect(getLocalProviderConfig({ [ENV_KEYS.backend]: "ollama" }).backendType).toBe("ollama");
    expect(getLocalProviderConfig({ [ENV_KEYS.backend]: "llama-cpp" }).backendType).toBe("llama-cpp");
    expect(getLocalProviderConfig({ [ENV_KEYS.backend]: "llamacpp" }).backendType).toBe("llama-cpp");
    expect(getLocalProviderConfig({ [ENV_KEYS.backend]: "llama.cpp" }).backendType).toBe("llama-cpp");
    expect(getLocalProviderConfig({ [ENV_KEYS.backend]: "auto" }).backendType).toBe("auto");
    expect(getLocalProviderConfig({ [ENV_KEYS.backend]: "unknown" }).backendType).toBe("auto");
    expect(getLocalProviderConfig({}).backendType).toBe("auto");
  });

  it("uses llama-cpp default endpoint when backend is llama-cpp and no endpoint override", () => {
    const cfg = getLocalProviderConfig({ [ENV_KEYS.backend]: "llama-cpp" });
    expect(cfg.endpoint).toBe(DEFAULT_LLAMACPP_ENDPOINT);
  });

  it("uses ollama default endpoint when backend is ollama", () => {
    const cfg = getLocalProviderConfig({ [ENV_KEYS.backend]: "ollama" });
    expect(cfg.endpoint).toBe(DEFAULT_LOCAL_ENDPOINT);
  });

  it("uses explicit local endpoint even when backend is llama-cpp", () => {
    const cfg = getLocalProviderConfig({
      [ENV_KEYS.backend]: "llama-cpp",
      [ENV_KEYS.endpoint]: "http://127.0.0.1:9999",
    });
    expect(cfg.endpoint).toBe("http://127.0.0.1:9999");
  });

  it("aborts local fetches after the timeout", async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      })) as typeof fetch;

    await expect(fetchLocalWithTimeout(fetchImpl, "http://127.0.0.1:11434/api/chat", {}, 1))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
