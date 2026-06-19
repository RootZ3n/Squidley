import { describe, expect, it } from "vitest";
import { WORKSHOP_RECEIPT_ACTION } from "./constants";
import {
  buildWorkshopOutputCopiedReceipt,
  buildWorkshopSuggestionSavedToNotebookReceipt,
  buildWorkshopSuggestionStartedReceipt,
  buildWorkshopSuggestionSucceededReceipt,
} from "./receipts";
import { createActivityReceipt } from "@/lib/activity-log/receipts";

describe("Workshop receipt builders", () => {
  it("builds local model suggestion receipts without source or output content", () => {
    const started = buildWorkshopSuggestionStartedReceipt({ model: "llama3.2:3b" });
    const succeeded = buildWorkshopSuggestionSucceededReceipt({
      model: "llama3.2:3b",
      summary: "Done",
      durationMs: 42,
      outputChars: 9000,
    });

    expect(started).toMatchObject({
      module: "workshop",
      action: WORKSHOP_RECEIPT_ACTION.suggestionStarted,
      provider: "local",
      modelUsed: true,
    });
    expect(succeeded.metadata).toMatchObject({ durationMs: 42, outputChars: 9000, fileSystemWrites: false });
    expect(JSON.stringify(succeeded)).not.toContain("function secret");
  });

  it("builds copy/save receipts with safe local metadata", () => {
    expect(buildWorkshopOutputCopiedReceipt()).toMatchObject({
      module: "workshop",
      action: WORKSHOP_RECEIPT_ACTION.outputCopied,
      modelUsed: false,
    });
    expect(buildWorkshopSuggestionSavedToNotebookReceipt({ entryId: "entry-1" })).toMatchObject({
      action: WORKSHOP_RECEIPT_ACTION.outputSavedToNotebook,
      changedLocalStorage: true,
      relatedItemId: "entry-1",
      metadata: { source: "workshop-suggestion", fileSystemWrites: false },
    });
  });

  it("sanitizes failed summaries through ActivityLog contract", () => {
    const receipt = createActivityReceipt(buildWorkshopSuggestionSavedToNotebookReceipt({ failed: true }));
    expect(receipt.localOnly).toBe(true);
    expect(receipt.cloudUsed).toBe(false);
    expect(receipt.toolsUsed).toBe(false);
  });
});
