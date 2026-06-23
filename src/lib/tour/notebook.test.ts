import { describe, expect, it } from "vitest";
import { notebookTour } from "./notebook";
import { getTour } from "./index";

describe("notebook tour", () => {
  it("is registered under the moduleId", () => {
    expect(getTour("notebook")).toBe(notebookTour);
  });

  it("covers Notebook and More Input regions", () => {
    const targets = notebookTour.steps.map((s) => s.target);
    for (const required of [
      "intro",
      "more-input-form",
      "notebook-velum-review",
      "notebook-save",
      "local-only-indicator",
      "notebook-list",
      "notebook-badges",
      "notebook-entry-actions",
      "notebook-entry-detail",
    ]) {
      expect(targets).toContain(required);
    }
  });

  it("explains local-only storage", () => {
    expect(notebookTour.steps.some((s) => s.body.toLowerCase().includes("browser"))).toBe(true);
    expect(notebookTour.steps.some((s) => s.body.toLowerCase().includes("cloud"))).toBe(true);
  });
});
