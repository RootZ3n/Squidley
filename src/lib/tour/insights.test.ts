import { describe, expect, it } from "vitest";
import { getTour } from "./index";
import { insightsTour } from "./insights";

describe("nous tour", () => {
  it("is registered under the moduleId", () => {
    expect(getTour("nous")).toBe(insightsTour);
  });

  it("covers the Insights map, model controls, and provider lock", () => {
    const targets = insightsTour.steps.map((step) => step.target);
    for (const required of [
      "intro",
      "local-only-indicator",
      "nous-model-controls",
      "nous-asi",
      "nous-module-map",
      "nous-provider-registry",
      "nous-cloud-lock",
    ]) {
      expect(targets).toContain(required);
    }
  });

  it("explains cloud providers are locked", () => {
    expect(insightsTour.steps.some((step) => step.body.toLowerCase().includes("no cloud"))).toBe(true);
    expect(insightsTour.steps.some((step) => step.body.toLowerCase().includes("locked"))).toBe(true);
  });
});
