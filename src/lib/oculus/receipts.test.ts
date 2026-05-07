import { describe, expect, it } from "vitest";
import { OCULUS_RECEIPT_ACTION } from "./constants";
import {
  buildOculusAnalysisStartedReceipt,
  buildOculusHandoffToColloquiumReceipt,
  buildOculusSaveAnalysisToArchivumReceipt,
} from "./receipts";

describe("Oculus receipt builders", () => {
  it("tracks local analysis without image data", () => {
    const receipt = buildOculusAnalysisStartedReceipt({ model: "llava:latest" });
    expect(receipt).toMatchObject({
      module: "oculus",
      action: OCULUS_RECEIPT_ACTION.analysisStarted,
      provider: "local",
      modelUsed: true,
    });
    expect(JSON.stringify(receipt)).not.toMatch(/base64|data:image|imageBytes/i);
  });

  it("hands off and saves only analysis text metadata", () => {
    expect(buildOculusHandoffToColloquiumReceipt()).toMatchObject({
      action: OCULUS_RECEIPT_ACTION.handoffToColloquium,
      modelUsed: false,
    });
    const saved = buildOculusSaveAnalysisToArchivumReceipt({
      model: "llava:latest",
      entryId: "entry-1",
      characterCount: 120,
    });
    expect(saved).toMatchObject({
      action: OCULUS_RECEIPT_ACTION.saveAnalysisToArchivum,
      changedLocalStorage: true,
      relatedItemId: "entry-1",
      metadata: { source: "oculus-analysis", characterCount: 120 },
    });
    expect(JSON.stringify(saved)).not.toMatch(/data:image|base64/i);
  });
});
