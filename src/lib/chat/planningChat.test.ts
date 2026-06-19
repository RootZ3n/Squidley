import { describe, it, expect } from "vitest";
import { runPlanningForChat } from "./planningChat";

describe("runPlanningForChat", () => {
  it("returns a rendered plan + provenance + summary", () => {
    const r = runPlanningForChat({
      message: "how would you fix the build?",
      inspectedFiles: [{ path: "package.json", packedContent: "{}" }],
    });
    expect(r.ok).toBe(true);
    expect(r.reply).toMatch(/Plan for/);
    expect(r.plan.steps.length).toBeGreaterThan(0);
    expect(r.summary.cloudUsed).toBe(false);
    expect(r.summary.receiptActions).toContain("planning.completed");
    expect(r.summary.id).toBe(r.plan.id);
  });

  it("blocked plan returns ok=false but still produces a beginner-readable reply", () => {
    const r = runPlanningForChat({ message: "rm -rf the project" });
    expect(r.ok).toBe(false);
    expect(r.summary.riskLevel).toBe("blocked");
    expect(r.summary.receiptActions).toContain("planning.blocked");
    expect(r.reply).toMatch(/Risk: blocked/);
  });

  it("low confidence when no files are inspected", () => {
    const r = runPlanningForChat({ message: "make a plan to fix this" });
    expect(r.summary.confidence).toBe("low");
  });

  it("medium confidence with one file + clear verb", () => {
    const r = runPlanningForChat({
      message: "how would you fix the build?",
      inspectedFiles: [{ path: "package.json", packedContent: "{}" }],
    });
    expect(r.summary.confidence).toBe("medium");
  });

  it("never includes a file in known evidence unless inspected", () => {
    const r = runPlanningForChat({
      message: "fix middleware.ts and src/auth.ts",
      inspectedFiles: [{ path: "src/auth.ts", packedContent: "x" }],
    });
    expect(r.provenance.known.some((k) => k.includes("src/auth.ts"))).toBe(true);
    expect(r.provenance.known.some((k) => k.includes("middleware.ts"))).toBe(false);
    expect(r.summary.suggestedNextInspections).toContain("middleware.ts");
  });
});
