import { describe, expect, it } from "vitest";
import {
  archivumLocalStorageDecision,
  colloquiumBasicChatDecision,
  fabricaMultiFileBuildDecision,
  fabricaSingleFileSuggestionDecision,
  getRatioStatusLabel,
  getRatioUnlockLine,
  legatusAgentWorkflowDecision,
  oculusLocalImageAnalysisDecision,
  praertoriumPolicyControlDecision,
  ratioDecisionForPublicModule,
  tabulariumLocalReceiptsDecision,
  velumDeterministicReviewDecision,
} from ".";

describe("Ratio UI decisions", () => {
  it("marks Colloquium basic chat available in public-local", () => {
    const decision = colloquiumBasicChatDecision("llama3.2:3b");

    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe("available");
    expect(decision.beginnerMessage).not.toHaveLength(0);
  });

  it("keeps Fabrica single-file available and multi-file future locked", () => {
    const singleFile = fabricaSingleFileSuggestionDecision("llama3.2:3b");
    const multiFile = fabricaMultiFileBuildDecision("llama3.2:3b");

    expect(singleFile.allowed).toBe(true);
    expect(singleFile.status).toBe("available");
    expect(multiFile.allowed).toBe(false);
    expect(multiFile.status).toBe("future");
    expect(getRatioUnlockLine(multiFile)).toMatch(/Future wiring/i);
  });

  it("requires a vision model for Oculus local image analysis", () => {
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
    const praertorium = praertoriumPolicyControlDecision("llama3.2:3b");

    expect(legatus.allowed).toBe(false);
    expect(legatus.status).toBe("needs-cloud-unlock");
    expect(praertorium.allowed).toBe(false);
    expect(praertorium.status).toBe("needs-cloud-unlock");
  });

  it("returns useful labels and beginner messages without overstating capability", () => {
    const unknown = colloquiumBasicChatDecision("unknown-local-model");
    expect(getRatioStatusLabel("needs-cloud-unlock")).toBe("Needs Cloud Unlock");
    expect(unknown.beginnerMessage).not.toHaveLength(0);
    expect(unknown.modelSummary).toMatch(/conservatively/i);
    expect(unknown.modelSummary).not.toMatch(/agent workflow is available/i);
  });

  it("maps public module ids to Ratio decisions", () => {
    expect(ratioDecisionForPublicModule("velum").status).toBe("available");
    expect(ratioDecisionForPublicModule("fabrica").status).toBe("needs-stronger-model");
    expect(ratioDecisionForPublicModule("legatus").status).toBe("needs-cloud-unlock");
  });
});
