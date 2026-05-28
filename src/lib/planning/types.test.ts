import { describe, it, expect } from "vitest";
import {
  makeEvidenceId,
  makePlanId,
  makeStepId,
  type EvidenceRef,
  type ExecutionPlan,
  type PlanConfidence,
  type PlanStep,
} from "./types";

describe("planning/types — id generators", () => {
  it("plan ids are unique within a millisecond batch", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(makePlanId());
    expect(ids.size).toBe(50);
  });

  it("step ids are stable for given (planId, index)", () => {
    expect(makeStepId("plan-x", 0)).toBe("plan-x-step-1");
    expect(makeStepId("plan-x", 4)).toBe("plan-x-step-5");
  });

  it("evidence ids are stable for given (planId, index)", () => {
    expect(makeEvidenceId("plan-x", 0)).toBe("plan-x-evid-1");
    expect(makeEvidenceId("plan-x", 7)).toBe("plan-x-evid-8");
  });
});

describe("planning/types — invariants", () => {
  it("ExecutionPlan literal types pin cloudUsed=false / localOnly=true", () => {
    // Compile-time + structural check.
    const plan: ExecutionPlan = {
      id: "p",
      userGoal: "?",
      confidence: {
        overall: "low",
        reasoning: "no evidence yet",
        missingInformation: [],
        assumptions: [],
      },
      riskLevel: "safe",
      requiresApproval: false,
      estimatedComplexity: "trivial",
      createdAt: 0,
      steps: [],
      evidence: {},
      limitations: [],
      suggestedNextInspections: [],
      receipts: [],
      cloudUsed: false,
      localOnly: true,
    };
    expect(plan.cloudUsed).toBe(false);
    expect(plan.localOnly).toBe(true);
  });

  it("EvidenceRef requires a confidence level", () => {
    const ev: EvidenceRef = {
      type: "file",
      source: "src/a.ts",
      confidence: "high",
      summary: "imports parseFoo from './foo'",
    };
    expect(["high", "medium", "low"]).toContain(ev.confidence);
  });

  it("PlanConfidence carries reasoning + missing + assumptions", () => {
    const c: PlanConfidence = {
      overall: "medium",
      reasoning: "one file inspected; topic clear",
      missingInformation: ["middleware.ts not inspected"],
      assumptions: ["user means the public-facing route"],
    };
    expect(c.overall).toBe("medium");
    expect(c.missingInformation.length).toBe(1);
  });

  it("PlanStep can be marked blocked with a beginner-readable reason", () => {
    const s: PlanStep = {
      id: "p-step-1",
      title: "Delete file",
      summary: "—",
      status: "blocked",
      requiredInputs: [],
      suggestedTools: [],
      relatedFiles: [],
      evidenceRefs: [],
      blockedReason:
        "Peh does not delete files. This step would be performed by the user.",
      userConfirmationRequired: true,
    };
    expect(s.status).toBe("blocked");
    expect(s.blockedReason).toMatch(/does not delete/);
  });
});
