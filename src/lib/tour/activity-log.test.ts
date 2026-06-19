import { describe, expect, it } from "vitest";
import { getTour } from "./index";
import { activityLogTour } from "./activity-log";

describe("tabularium tour", () => {
  it("is registered under the moduleId", () => {
    expect(getTour("activity-log")).toBe(activityLogTour);
  });

  it("covers key receipt regions", () => {
    const targets = activityLogTour.steps.map((s) => s.target);
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
    expect(activityLogTour.steps.some((s) => s.body.toLowerCase().includes("browser"))).toBe(true);
    expect(activityLogTour.steps.some((s) => s.body.toLowerCase().includes("receipts"))).toBe(true);
  });
});
