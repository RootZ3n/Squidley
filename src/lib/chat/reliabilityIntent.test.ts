import { describe, it, expect } from "vitest";
import { detectChatReliabilityIntent } from "./reliabilityIntent";

describe("detectChatReliabilityIntent", () => {
  it("detects health-check phrasing", () => {
    expect(detectChatReliabilityIntent("Is the local model working?")?.intent).toBe(
      "health_check",
    );
    expect(detectChatReliabilityIntent("run a local health check please")?.intent).toBe(
      "health_check",
    );
    expect(detectChatReliabilityIntent("is ollama running")?.intent).toBe(
      "health_check",
    );
  });

  it("detects explicit summarize-error phrasing", () => {
    expect(detectChatReliabilityIntent("summarize this error")?.intent).toBe(
      "summarize_error",
    );
    expect(detectChatReliabilityIntent("what went wrong with this stack trace?")?.intent).toBe(
      "summarize_error",
    );
    expect(detectChatReliabilityIntent("explain this crash for me")?.intent).toBe(
      "summarize_error",
    );
  });

  it("detects a pasted error string with a keyword", () => {
    const m = detectChatReliabilityIntent(
      "Got this error: ECONNREFUSED 127.0.0.1:11434, what now?",
    );
    expect(m?.intent).toBe("summarize_error");
  });

  it("ignores casual conversation and code-explanation requests", () => {
    expect(detectChatReliabilityIntent("hello there")).toBeNull();
    expect(detectChatReliabilityIntent("explain this function to me")).toBeNull();
    expect(detectChatReliabilityIntent("what is the capital of France?")).toBeNull();
    expect(detectChatReliabilityIntent("write a haiku about squids")).toBeNull();
  });

  it("ignores long messages even when they match", () => {
    const long = "summarize this error: " + "x".repeat(500);
    expect(detectChatReliabilityIntent(long)).toBeNull();
  });

  it("ignores empty / whitespace", () => {
    expect(detectChatReliabilityIntent("")).toBeNull();
    expect(detectChatReliabilityIntent("   ")).toBeNull();
  });

  it("ignores 'error' word without an actual error shape", () => {
    // Casual mention of the word "error" without any traceback/keyword pair.
    expect(detectChatReliabilityIntent("I made an error in judgement.")).toBeNull();
  });
});
