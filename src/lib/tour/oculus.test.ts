import { describe, expect, it } from "vitest";
import { getTour } from "./index";
import { oculusTour } from "./oculus";

describe("oculus tour", () => {
  it("is registered under the moduleId", () => {
    expect(getTour("oculus")).toBe(oculusTour);
  });

  it("covers key Oculus regions", () => {
    const targets = oculusTour.steps.map((step) => step.target);
    for (const required of [
      "intro",
      "local-only-indicator",
      "oculus-picker",
      "oculus-preview",
      "oculus-vision",
      "oculus-result",
      "oculus-handoff",
    ]) {
      expect(targets).toContain(required);
    }
  });

  it("explains manual privacy boundaries", () => {
    expect(oculusTour.steps.some((step) => step.body.toLowerCase().includes("screen"))).toBe(true);
    expect(oculusTour.steps.some((step) => step.body.toLowerCase().includes("cloud"))).toBe(true);
  });
});
