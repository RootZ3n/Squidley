import { describe, expect, it } from "vitest";
import { getTour } from "./index";
import { visionTour } from "./vision";

describe("vision tour", () => {
  it("is registered under the moduleId", () => {
    expect(getTour("vision")).toBe(visionTour);
  });

  it("covers key Vision regions", () => {
    const targets = visionTour.steps.map((step) => step.target);
    for (const required of [
      "intro",
      "local-only-indicator",
      "vision-picker",
      "vision-preview",
      "vision-vision",
      "vision-result",
      "vision-handoff",
    ]) {
      expect(targets).toContain(required);
    }
  });

  it("explains manual privacy boundaries", () => {
    expect(visionTour.steps.some((step) => step.body.toLowerCase().includes("screen"))).toBe(true);
    expect(visionTour.steps.some((step) => step.body.toLowerCase().includes("cloud"))).toBe(true);
  });
});
