/**
 * Tests verifying backendType flows through stream metadata events.
 */
import { describe, expect, it } from "vitest";
import { encodeStreamEvent, parseStreamEventLine } from "./stream";

describe("backendType in stream metadata", () => {
  it("includes backendType in meta event for Ollama", () => {
    const event = encodeStreamEvent({
      type: "meta",
      ok: true,
      provider: "local",
      cloudUsed: false,
      toolsUsed: false,
      model: "llama3.2",
      startedAt: 1000,
      backendType: "ollama",
    });
    const parsed = parseStreamEventLine(event);
    expect(parsed).toMatchObject({
      type: "meta",
      backendType: "ollama",
      provider: "local",
      cloudUsed: false,
    });
  });

  it("includes backendType in meta event for llama-cpp", () => {
    const event = encodeStreamEvent({
      type: "meta",
      ok: true,
      provider: "local",
      cloudUsed: false,
      toolsUsed: false,
      model: "llama-3.2-3b",
      startedAt: 2000,
      backendType: "llama-cpp",
    });
    const parsed = parseStreamEventLine(event);
    expect(parsed).toMatchObject({
      type: "meta",
      backendType: "llama-cpp",
      provider: "local",
      cloudUsed: false,
    });
  });

  it("meta event without backendType still works (backward compat)", () => {
    const event = encodeStreamEvent({
      type: "meta",
      ok: true,
      provider: "local",
      cloudUsed: false,
      toolsUsed: false,
      model: "test",
      startedAt: 0,
    });
    const parsed = parseStreamEventLine(event);
    expect(parsed).toMatchObject({ type: "meta", provider: "local" });
    expect((parsed as Record<string, unknown>).backendType).toBeUndefined();
  });
});
