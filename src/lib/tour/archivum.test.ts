import { describe, expect, it } from "vitest";
import { archivumTour } from "./archivum";
import { getTour } from "./index";

describe("archivum tour", () => {
  it("is registered under the moduleId", () => {
    expect(getTour("archivum")).toBe(archivumTour);
  });

  it("covers Archivum and More Input regions", () => {
    const targets = archivumTour.steps.map((s) => s.target);
    for (const required of [
      "intro",
      "more-input-form",
      "archivum-velum-review",
      "archivum-save",
      "local-only-indicator",
      "archivum-list",
      "archivum-badges",
      "archivum-entry-actions",
      "archivum-entry-detail",
    ]) {
      expect(targets).toContain(required);
    }
  });

  it("explains local-only storage", () => {
    expect(archivumTour.steps.some((s) => s.body.toLowerCase().includes("browser"))).toBe(true);
    expect(archivumTour.steps.some((s) => s.body.toLowerCase().includes("cloud"))).toBe(true);
  });
});
