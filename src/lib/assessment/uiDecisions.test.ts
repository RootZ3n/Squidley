import { describe, expect, it } from "vitest";
import {
  archivumLocalStorageDecision,
  chatBasicDecision,
  fabricaMultiFileBuildDecision,
  fabricaSingleFileSuggestionDecision,
  getAssessmentStatusLabel,
  getAssessmentUnlockLine,
  legatusAgentWorkflowDecision,
  oculusLocalImageAnalysisDecision,
  ratioDecisionForPublicModule,
  tabulariumLocalReceiptsDecision,
  velumDeterministicReviewDecision,
} from ".";

describe("Assessment UI decisions", () => {
  it("marks Chat basic chat available in public-local", () => {
    const decision = chatBasicDecision("llama3.2:3b");

    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe("available");
    expect(decision.beginnerMessage).not.toHaveLength(0);
  });

  it("keeps Workshop single-file available and multi-file future locked", () => {
    const singleFile = fabricaSingleFileSuggestionDecision("llama3.2:3b");
    const multiFile = fabricaMultiFileBuildDecision("llama3.2:3b");

    expect(singleFile.allowed).toBe(true);
    expect(singleFile.status).toBe("available");
    expect(multiFile.allowed).toBe(false);
    expect(multiFile.status).toBe("future");
    expect(getAssessmentUnlockLine(multiFile)).toMatch(/Future wiring/i);
  });

  it("requires a vision model for Vision local image analysis", () => {
    const noVision = oculusLocalImageAnalysisDecision("llama3.2:3b");
    const vision = oculusLocalImageAnalysisDecision("qwen3-vl:4b");

    expect(noVision.allowed).toBe(false);
    expect(noVision.status).toBe("needs-stronger-model");
    expect(noVision.requiredCapabilities?.join(" ")).toMatch(/vision/i);
    expect(vision.allowed).toBe(true);
    expect(vision.status).toBe("available");
  });

  it("shows no-model local modules as available deterministic work", () => {
    const velum = velumDeterministicReviewDecision();
    const archivum = archivumLocalStorageDecision();
    const tabularium = tabulariumLocalReceiptsDecision();

    for (const decision of [velum, archivum, tabularium]) {
      expect(decision.allowed).toBe(true);
      expect(decision.status).toBe("available");
      expect(decision.effectiveMode).toBe("deterministic");
      expect(decision.modelSummary).toMatch(/does not need a model/i);
    }
  });

  it("keeps cloud agent modules locked in public-local", () => {
    const legatus = legatusAgentWorkflowDecision("llama3.2:3b");

    expect(legatus.allowed).toBe(false);
    expect(legatus.status).toBe("needs-cloud-unlock");
  });

  it("returns useful labels and beginner messages without overstating capability", () => {
    const unknown = chatBasicDecision("unknown-local-model");
    expect(getAssessmentStatusLabel("needs-cloud-unlock")).toBe("Needs Cloud Unlock");
    expect(unknown.beginnerMessage).not.toHaveLength(0);
    expect(unknown.modelSummary).toMatch(/conservatively/i);
    expect(unknown.modelSummary).not.toMatch(/agent workflow is available/i);
  });

  it("maps public module ids to Assessment decisions", () => {
    expect(ratioDecisionForPublicModule("velum").status).toBe("available");
    expect(ratioDecisionForPublicModule("fabrica").status).toBe("needs-stronger-model");
    expect(ratioDecisionForPublicModule("legatus").status).toBe("needs-cloud-unlock");
  });
});
