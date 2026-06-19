import { describe, it, expect } from "vitest";
import { chatTour } from "./chat";
import { getTour } from "./index";

describe("colloquium tour", () => {
  it("is registered under the moduleId", () => {
    expect(getTour("colloquium")).toBe(chatTour);
  });

  it("has unique step ids", () => {
    const ids = chatTour.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("first step explains the Latin meaning of Chat", () => {
    const first = chatTour.steps[0];
    expect(first).toBeDefined();
    expect(first.body.toLowerCase()).toContain("latin");
    expect(first.body.toLowerCase()).toMatch(/conversation|discussion/);
  });

  it("covers every required UI region", () => {
    const targets = chatTour.steps.map((s) => s.target);
    for (const required of [
      "chat-thread",
      "input-box",
      "local-only-indicator",
      "model-selector",
      "receipts",
      "message-metrics",
    ]) {
      expect(targets, `tour must cover ${required}`).toContain(required);
    }
  });

  it("every step has a non-empty title and body", () => {
    for (const s of chatTour.steps) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(20);
    }
  });

  it("has at least 6 steps (intro + 6 UI regions)", () => {
    expect(chatTour.steps.length).toBeGreaterThanOrEqual(6);
  });

  it("each step targets a unique region", () => {
    const targets = chatTour.steps.map((s) => s.target);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("first step body explicitly says Latin for conversation or discussion", () => {
    const body = chatTour.steps[0].body.toLowerCase();
    expect(body).toContain("latin");
    expect(body).toMatch(/"conversation"|conversation/);
    expect(body).toMatch(/"discussion"|discussion/);
  });
});
