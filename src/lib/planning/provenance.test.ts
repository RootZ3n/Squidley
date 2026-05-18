import { describe, it, expect } from "vitest";
import { buildPlan } from "./planner";
import { buildProvenanceReport, renderPlanAsText } from "./provenance";

describe("buildProvenanceReport", () => {
  it("known list contains only inspected files / non-low receipts", () => {
    const plan = buildPlan({
      userGoal: "fix the build",
      inspectedFiles: [
        { path: "package.json", packedContent: "{}" },
        { path: "src/build.ts", packedContent: "export {}" },
      ],
    });
    const r = buildProvenanceReport(plan);
    expect(r.known.some((k) => k.includes("package.json"))).toBe(true);
    expect(r.known.some((k) => k.includes("src/build.ts"))).toBe(true);
  });

  it("inferred list captures model_inference evidence only", () => {
    const plan = buildPlan({
      userGoal: "fix the build",
      inspectedFiles: [{ path: "package.json", packedContent: "{}" }],
    });
    const r = buildProvenanceReport(plan);
    expect(r.inferred.length).toBeGreaterThan(0);
    expect(r.inferred.some((s) => s.toLowerCase().includes("inferred"))).toBe(true);
  });

  it("assumed list always contains the user goal echo", () => {
    const r = buildProvenanceReport(
      buildPlan({ userGoal: "fix the auth bug" }),
    );
    expect(r.assumed.some((s) => s.includes("fix the auth bug"))).toBe(true);
  });

  it("missing list reflects PlanConfidence.missingInformation verbatim", () => {
    const plan = buildPlan({ userGoal: "fix the build" });
    const r = buildProvenanceReport(plan);
    expect(r.missing).toEqual(plan.confidence.missingInformation);
  });

  it("confidence is one of high/medium/low — never a number/percentage", () => {
    const r = buildProvenanceReport(buildPlan({ userGoal: "fix the build" }));
    expect(["high", "medium", "low"]).toContain(r.confidence);
    // Reasoning shouldn't promise precision percentages.
    expect(r.confidenceReasoning).not.toMatch(/\d+%/);
  });

  it("never reports a file as known unless it was actually inspected", () => {
    const plan = buildPlan({
      userGoal: "fix src/auth.ts and src/login.tsx",
      inspectedFiles: [{ path: "src/auth.ts", packedContent: "x" }],
    });
    const r = buildProvenanceReport(plan);
    expect(r.known.some((k) => k.includes("src/auth.ts"))).toBe(true);
    expect(r.known.some((k) => k.includes("src/login.tsx"))).toBe(false);
    expect(r.suggestedNextInspections).toContain("src/login.tsx");
  });
});

describe("renderPlanAsText", () => {
  it("does not echo file content into the rendered plan", () => {
    const sensitive = "const TOKEN = 'sk-abcdefghijklmnopqrstuvwxyz12';";
    const plan = buildPlan({
      userGoal: "explain src/auth.ts",
      inspectedFiles: [{ path: "src/auth.ts", packedContent: sensitive }],
    });
    const text = renderPlanAsText(plan);
    expect(text).not.toMatch(/sk-abcdefghijklmnopqrstuvwxyz12/);
  });

  it("calls out needs-your-OK steps explicitly", () => {
    const plan = buildPlan({
      userGoal: "fix middleware.ts",
      inspectedFiles: [{ path: "middleware.ts", packedContent: "export const x = 1;" }],
    });
    const text = renderPlanAsText(plan);
    expect(text).toMatch(/\[needs your OK\]/);
  });

  it("blocked plans render the refusal up top", () => {
    const plan = buildPlan({ userGoal: "rm -rf the project" });
    const text = renderPlanAsText(plan);
    expect(text).toMatch(/Risk: blocked/);
  });
});
