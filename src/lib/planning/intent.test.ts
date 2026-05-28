import { describe, it, expect } from "vitest";
import { detectPlanningIntent } from "./intent";

describe("detectPlanningIntent — matches", () => {
  const matches = [
    "Make a plan",
    "give me a plan to ship this",
    "how would you fix this?",
    "what should I change?",
    "how should I approach this?",
    "what files are involved?",
    "how hard would this be?",
    "what would Peh need to inspect?",
    "outline the steps please",
    "step-by-step plan",
    "what's the plan?",
  ];
  for (const m of matches) {
    it(`matches "${m}"`, () => {
      expect(detectPlanningIntent(m)?.intent).toBe("plan");
    });
  }
});

describe("detectPlanningIntent — does NOT match", () => {
  const skips = [
    "explain src/app/page.tsx",
    "tell me a joke",
    "hi there",
    "is ollama running",
    "what does this code do",
    "inspect package.json",
    "summarize this error: ECONNREFUSED",
  ];
  for (const s of skips) {
    it(`does not match "${s}"`, () => {
      expect(detectPlanningIntent(s)).toBeNull();
    });
  }

  it("ignores over-long messages", () => {
    expect(detectPlanningIntent("make a plan " + "x".repeat(800))).toBeNull();
  });
});
