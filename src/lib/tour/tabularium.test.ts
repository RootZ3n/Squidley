import { describe, expect, it } from "vitest";
import { getTour } from "./index";
import { tabulariumTour } from "./tabularium";

describe("tabularium tour", () => {
  it("is registered under the moduleId", () => {
    expect(getTour("tabularium")).toBe(tabulariumTour);
  });

  it("covers key receipt regions", () => {
    const targets = tabulariumTour.steps.map((s) => s.target);
    for (const required of [
      "intro",
      "local-only-indicator",
      "tabularium-filters",
      "tabularium-list",
      "tabularium-detail",
      "tabularium-actions",
    ]) {
      expect(targets).toContain(required);
    }
  });

  it("explains local receipts and trust", () => {
    expect(tabulariumTour.steps.some((s) => s.body.toLowerCase().includes("browser"))).toBe(true);
    expect(tabulariumTour.steps.some((s) => s.body.toLowerCase().includes("receipts"))).toBe(true);
  });
});
