import { describe, expect, it } from "vitest";
import { getTour } from "./index";
import { fabricaTour } from "./fabrica";

describe("fabrica tour", () => {
  it("is registered under the moduleId", () => {
    expect(getTour("fabrica")).toBe(fabricaTour);
  });

  it("covers the single-file workshop flow", () => {
    const targets = fabricaTour.steps.map((step) => step.target);
    for (const target of [
      "intro",
      "local-only-indicator",
      "fabrica-inputs",
      "fabrica-change",
      "fabrica-model",
      "fabrica-limits",
      "fabrica-output",
    ]) {
      expect(targets).toContain(target);
    }
  });

  it("states that Fabrica is not autonomous", () => {
    const all = fabricaTour.steps.map((step) => step.body).join(" ").toLowerCase();
    expect(all).toContain("not a repo-wide coding agent");
    expect(all).toContain("does not run shell commands");
  });
});
