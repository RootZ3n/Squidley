import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOCAL_ENDPOINT,
  DEFAULT_LOCAL_MODEL,
  ENV_KEYS,
  LOCAL_PROVIDER_ID,
  getLocalProviderConfig,
} from "./local";

describe("local provider config", () => {
  it("uses sensible defaults when env is empty", () => {
    const cfg = getLocalProviderConfig({});
    expect(cfg.providerId).toBe(LOCAL_PROVIDER_ID);
    expect(cfg.endpoint).toBe(DEFAULT_LOCAL_ENDPOINT);
    expect(cfg.model).toBe(DEFAULT_LOCAL_MODEL);
    expect(cfg.cloudUsed).toBe(false);
    expect(cfg.toolsUsed).toBe(false);
  });

  it("reads SQUIDLEY_LOCAL_ENDPOINT and SQUIDLEY_LOCAL_MODEL overrides", () => {
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

  it("never returns cloudUsed=true or toolsUsed=true", () => {
    const cfg = getLocalProviderConfig({
      [ENV_KEYS.endpoint]: "http://example.com",
      [ENV_KEYS.model]: "any",
    });
    expect(cfg.cloudUsed).toBe(false);
    expect(cfg.toolsUsed).toBe(false);
  });
});
