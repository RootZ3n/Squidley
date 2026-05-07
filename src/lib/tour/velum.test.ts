import { describe, expect, it } from "vitest";
import { getTour } from "./index";
import { velumTour } from "./velum";

describe("velum tour", () => {
  it("is registered under the moduleId", () => {
    expect(getTour("velum")).toBe(velumTour);
  });

  it("covers every required Velum UI region", () => {
    const targets = velumTour.steps.map((s) => s.target);
    for (const required of [
      "intro",
      "velum-paste",
      "velum-review",
      "velum-findings",
      "velum-redaction",
      "local-only-indicator",
    ]) {
      expect(targets, `tour must cover ${required}`).toContain(required);
    }
  });

  it("keeps copy beginner-friendly and local-only", () => {
    expect(velumTour.steps[0].body.toLowerCase()).toContain("veil");
    expect(velumTour.steps.some((s) => s.body.toLowerCase().includes("no cloud"))).toBe(true);
  });

  it("has unique step ids and targets", () => {
    const ids = velumTour.steps.map((s) => s.id);
    const targets = velumTour.steps.map((s) => s.target);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(targets).size).toBe(targets.length);
  });
});
