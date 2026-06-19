import { describe, it, expect } from "vitest";
import type { LocalProviderConfig } from "@/lib/providers/local";
import { runReliabilityForChat } from "./reliabilityChat";

const config: LocalProviderConfig = {
  providerId: "local",
  endpoint: "http://test-local:11434",
  model: "llama3.2",
  backendType: "ollama",
  cloudUsed: false,
  toolsUsed: false,
};

describe("runReliabilityForChat — health_check intent", () => {
  it("reports ready honestly when the injected probe says ok", async () => {
    const outcome = await runReliabilityForChat({
      intent: "health_check",
      message: "is ollama running",
      config,
      probe: async () => ({
        ok: true,
        backend: "ollama",
        endpoint: "http://test-local:11434",
        modelCount: 2,
      }),
    });
    expect(outcome.summary.ok).toBe(true);
    expect(outcome.reply).toMatch(/ready/);
    expect(outcome.summary.cloudUsed).toBe(false);
    expect(outcome.summary.localOnly).toBe(true);
  });

  it("reports not-ready and never claims cloud when probe fails", async () => {
    const outcome = await runReliabilityForChat({
      intent: "health_check",
      message: "is the local model working",
      config,
      probe: async () => ({
        ok: false,
        backend: "ollama",
        endpoint: "http://test-local:11434",
        error: "no models",
      }),
      cloudConfigured: true,
    });
    expect(outcome.summary.ok).toBe(false);
    expect(outcome.summary.cloudUsed).toBe(false);
    // Cloud may have been offered, but never used.
    for (const receipt of outcome.result.receipts) {
      expect(receipt.cloudUsed).toBe(false);
    }
  });
});

describe("runReliabilityForChat — summarize_error intent", () => {
  it("classifies ECONNREFUSED and returns a safe next step", async () => {
    const outcome = await runReliabilityForChat({
      intent: "summarize_error",
      message: "Got this error: ECONNREFUSED 127.0.0.1:11434",
      config,
    });
    expect(outcome.summary.ok).toBe(true);
    expect(outcome.reply).toMatch(/unreachable/);
    expect(outcome.reply).toMatch(/next step/i);
    expect(outcome.summary.cloudUsed).toBe(false);
  });

  it("never silently uses cloud, even when cloudConfigured=true", async () => {
    const outcome = await runReliabilityForChat({
      intent: "summarize_error",
      message: "TypeError: foo is not a function",
      config,
      cloudConfigured: true,
    });
    expect(outcome.summary.cloudUsed).toBe(false);
    for (const receipt of outcome.result.receipts) {
      expect(receipt.cloudUsed).toBe(false);
    }
  });

  it("returns a beginner-readable reply with a 'next step' marker", async () => {
    const outcome = await runReliabilityForChat({
      intent: "summarize_error",
      message: "ENOENT no such file or directory",
      config,
    });
    expect(outcome.reply).toMatch(/Suggested next step/);
  });
});

describe("runReliabilityForChat — invariants", () => {
  it("summary always reports localOnly=true and cloudUsed=false", async () => {
    const a = await runReliabilityForChat({
      intent: "summarize_error",
      message: "Error: timed out",
      config,
    });
    const b = await runReliabilityForChat({
      intent: "health_check",
      message: "is ollama up",
      config,
      probe: async () => ({
        ok: true,
        backend: "ollama",
        endpoint: "http://test-local:11434",
        modelCount: 1,
      }),
    });
    for (const s of [a.summary, b.summary]) {
      expect(s.localOnly).toBe(true);
      expect(s.cloudUsed).toBe(false);
    }
  });

  it("step count is bounded — runner never loops indefinitely", async () => {
    const outcome = await runReliabilityForChat({
      intent: "summarize_error",
      message: "Error: random failure",
      config,
    });
    expect(outcome.summary.stepCount).toBeLessThanOrEqual(20);
  });
});
