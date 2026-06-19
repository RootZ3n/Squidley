import { describe, it, expect } from "vitest";
import {
  countStepsOfKind,
  runReliability,
  type ReliabilityModelAction,
} from "@/lib/reliability/runner";
import { createSmallModelTask } from "@/lib/reliability/types";

function makeAction(
  responses: { ok: boolean; content?: string; error?: string }[],
): ReliabilityModelAction {
  let i = 0;
  return async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return { ok: r.ok, content: r.content ?? "", error: r.error };
  };
}

describe("reliability/runner", () => {
  it("returns success on a happy path and never calls cloud", async () => {
    const task = createSmallModelTask({ userPrompt: "what is two plus two?" });
    const result = await runReliability({
      task,
      action: makeAction([{ ok: true, content: "Four." }]),
    });
    expect(result.ok).toBe(true);
    expect(result.finalAnswer).toBe("Four.");
    expect(result.cloudUsed).toBe(false);
    expect(result.cloudSuggested).toBe(false);
    expect(result.localOnly).toBe(true);
  });

  it("retries once after a single failure and succeeds", async () => {
    const task = createSmallModelTask({ userPrompt: "x" });
    const result = await runReliability({
      task,
      action: makeAction([
        { ok: false, error: "ECONNREFUSED localhost:11434" },
        { ok: true, content: "Now it works." },
      ]),
    });
    expect(result.ok).toBe(true);
    expect(countStepsOfKind(result.steps, "retry")).toBe(1);
    expect(countStepsOfKind(result.steps, "validate")).toBe(2);
  });

  it("decomposes when the same failure signature repeats", async () => {
    const task = createSmallModelTask({ userPrompt: "x", policy: { maxRetries: 2 } });
    const result = await runReliability({
      task,
      // Same root error twice; differing nonces should be stripped by signature.
      action: makeAction([
        { ok: false, error: "ECONNREFUSED 127.0.0.1:11434 at /tmp/a/1.js:1:1" },
        { ok: false, error: "ECONNREFUSED 127.0.0.1:11434 at /tmp/b/2.js:9:9" },
      ]),
    });
    expect(result.ok).toBe(false);
    expect(result.finalAnswer).toMatch(/smaller/);
    expect(countStepsOfKind(result.steps, "decompose")).toBeGreaterThan(0);
  });

  it("stops after maxRetries even if signatures differ", async () => {
    const task = createSmallModelTask({ userPrompt: "x", policy: { maxRetries: 2 } });
    let calls = 0;
    const action: ReliabilityModelAction = async () => {
      calls++;
      return { ok: false, content: "", error: `unique error ${calls}` };
    };
    const result = await runReliability({ task, action });
    expect(result.ok).toBe(false);
    expect(calls).toBeLessThanOrEqual(1 + task.maxRetries);
  });

  it("offers cloud escalation (never auto-runs it) after decomposition", async () => {
    const task = createSmallModelTask({ userPrompt: "fix the build" });
    const result = await runReliability({
      task,
      action: makeAction([
        { ok: false, error: "model returned empty content" },
        { ok: false, error: "model returned empty content" },
      ]),
      cloudConfigured: true,
    });
    expect(result.ok).toBe(false);
    expect(result.cloudSuggested).toBe(true);
    expect(result.cloudUsed).toBe(false);
    // Receipts must show local_failed -> escalation_offered -> previewed -> skipped.
    const actions = result.receipts.map((r) => r.action);
    expect(actions).toContain("reliability.local-failed");
    expect(actions).toContain("reliability.escalation-offered");
    expect(actions).toContain("reliability.cloud-packet-previewed");
    expect(actions.some((a) => a.startsWith("reliability.consent-"))).toBe(true);
  });

  it("blocked tasks are refused with a beginner-friendly explanation", async () => {
    const task = createSmallModelTask({
      userPrompt: "rm -rf /",
      riskLevel: "blocked",
    });
    const result = await runReliability({
      task,
      action: makeAction([{ ok: true, content: "fine" }]),
    });
    expect(result.ok).toBe(false);
    expect(result.finalAnswer).toMatch(/risky|risk|stopped/i);
    expect(result.cloudUsed).toBe(false);
  });

  it("validation flags empty content as failure even when ok=true", async () => {
    const task = createSmallModelTask({ userPrompt: "x" });
    const result = await runReliability({
      task,
      // First attempt looks ok but is empty; second succeeds.
      action: makeAction([
        { ok: true, content: "   " },
        { ok: true, content: "real answer" },
      ]),
    });
    expect(result.ok).toBe(true);
    expect(countStepsOfKind(result.steps, "retry")).toBe(1);
  });

  it("never sets cloudUsed=true even when consent is conceptually granted", async () => {
    // Even when local fails repeatedly and cloud is configured, runner does not
    // call cloud. The receipt for consent_granted is not produced here because
    // we always default to skipped — but the invariant must hold either way.
    const task = createSmallModelTask({ userPrompt: "x" });
    const result = await runReliability({
      task,
      action: makeAction([
        { ok: false, error: "boom" },
        { ok: false, error: "boom" },
      ]),
      cloudConfigured: true,
    });
    for (const receipt of result.receipts) {
      expect(receipt.cloudUsed).toBe(false);
      expect(receipt.metadata?.cloud_used).toBe(false);
    }
  });

  it("custom validator can reject certain outputs", async () => {
    const task = createSmallModelTask({ userPrompt: "x" });
    const result = await runReliability({
      task,
      action: makeAction([
        { ok: true, content: "I cannot help with that." },
        { ok: true, content: "Real answer." },
      ]),
      validate: (out) =>
        /cannot help/i.test(out.content)
          ? { ok: false, reason: "refusal detected" }
          : { ok: true },
    });
    expect(result.ok).toBe(true);
    expect(result.finalAnswer).toBe("Real answer.");
  });

  it("includes a task-started receipt at the top", async () => {
    const task = createSmallModelTask({ userPrompt: "x" });
    const result = await runReliability({
      task,
      action: makeAction([{ ok: true, content: "done" }]),
    });
    expect(result.receipts[0].action).toBe("reliability.task-started");
  });
});
