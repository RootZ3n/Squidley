import { describe, expect, it } from "vitest";
import { VISION_RECEIPT_ACTION } from "./constants";
import {
  buildVisionAnalysisStartedReceipt,
  buildVisionHandoffToChatReceipt,
  buildVisionSaveAnalysisToNotebookReceipt,
} from "./receipts";

describe("Vision receipt builders", () => {
  it("tracks local analysis without image data", () => {
    const receipt = buildVisionAnalysisStartedReceipt({ model: "llava:latest" });
    expect(receipt).toMatchObject({
      module: "vision",
      action: VISION_RECEIPT_ACTION.analysisStarted,
      provider: "local",
      modelUsed: true,
    });
    expect(JSON.stringify(receipt)).not.toMatch(/base64|data:image|imageBytes/i);
  });

  it("hands off and saves only analysis text metadata", () => {
    expect(buildVisionHandoffToChatReceipt()).toMatchObject({
      action: VISION_RECEIPT_ACTION.handoffToChat,
      modelUsed: false,
    });
    const saved = buildVisionSaveAnalysisToNotebookReceipt({
      model: "llava:latest",
      entryId: "entry-1",
      characterCount: 120,
    });
    expect(saved).toMatchObject({
      action: VISION_RECEIPT_ACTION.saveAnalysisToNotebook,
      changedLocalStorage: true,
      relatedItemId: "entry-1",
      metadata: { source: "oculus-analysis", characterCount: 120 },
    });
    expect(JSON.stringify(saved)).not.toMatch(/data:image|base64/i);
  });
});
