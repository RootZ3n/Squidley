import { describe, it, expect } from "vitest";
import {
  DEFAULT_ALLOWED_COMPOUND_TOOLS,
  DEFAULT_RELIABILITY_POLICY,
  createSmallModelTask,
} from "@/lib/reliability/types";

describe("reliability/types", () => {
  it("default policy is local-first and bounded", () => {
    expect(DEFAULT_RELIABILITY_POLICY.maxRetries).toBe(2);
    expect(DEFAULT_RELIABILITY_POLICY.maxSteps).toBeGreaterThan(0);
    expect(DEFAULT_RELIABILITY_POLICY.beginnerMode).toBe(true);
    expect(DEFAULT_RELIABILITY_POLICY.allowedActions).toEqual(
      DEFAULT_ALLOWED_COMPOUND_TOOLS,
    );
    // Edit tool is NOT in the default allowed actions (stub only).
    expect(DEFAULT_RELIABILITY_POLICY.allowedActions).not.toContain(
      "make_small_text_change_and_verify",
    );
  });

  it("createSmallModelTask defaults to local mode + safe risk", () => {
    const task = createSmallModelTask({ userPrompt: "explain this repo" });
    expect(task.mode).toBe("local");
    expect(task.riskLevel).toBe("safe");
    expect(task.maxRetries).toBe(DEFAULT_RELIABILITY_POLICY.maxRetries);
    expect(task.contextBudget).toBeGreaterThan(0);
    expect(task.userPrompt).toBe("explain this repo");
  });

  it("blocked risk forces mode to blocked regardless of caller", () => {
    const task = createSmallModelTask({
      userPrompt: "rm -rf /",
      riskLevel: "blocked",
      mode: "local",
    });
    expect(task.mode).toBe("blocked");
  });

  it("clamps invalid bounds rather than trusting caller", () => {
    const task = createSmallModelTask({
      userPrompt: "x",
      policy: { maxRetries: -5, maxSteps: 0, contextBudget: 0 },
    });
    expect(task.maxRetries).toBe(0);
    expect(task.maxSteps).toBe(1);
    expect(task.contextBudget).toBeGreaterThanOrEqual(256);
  });

  it("task ids are unique within a millisecond batch", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(createSmallModelTask({ userPrompt: "x" }).id);
    }
    expect(ids.size).toBe(50);
  });
});
