import { describe, expect, it } from "vitest";
import { FABRICA_RECEIPT_ACTION } from "./constants";
import {
  buildFabricaOutputCopiedReceipt,
  buildFabricaSuggestionSavedToArchivumReceipt,
  buildFabricaSuggestionStartedReceipt,
  buildFabricaSuggestionSucceededReceipt,
} from "./receipts";
import { createTabulariumReceipt } from "@/lib/tabularium/receipts";

describe("Fabrica receipt builders", () => {
  it("builds local model suggestion receipts without source or output content", () => {
    const started = buildFabricaSuggestionStartedReceipt({ model: "llama3.2:3b" });
    const succeeded = buildFabricaSuggestionSucceededReceipt({
      model: "llama3.2:3b",
      summary: "Done",
      durationMs: 42,
      outputChars: 9000,
    });

    expect(started).toMatchObject({
      module: "fabrica",
      action: FABRICA_RECEIPT_ACTION.suggestionStarted,
      provider: "local",
      modelUsed: true,
    });
    expect(succeeded.metadata).toMatchObject({ durationMs: 42, outputChars: 9000, fileSystemWrites: false });
    expect(JSON.stringify(succeeded)).not.toContain("function secret");
  });

  it("builds copy/save receipts with safe local metadata", () => {
    expect(buildFabricaOutputCopiedReceipt()).toMatchObject({
      module: "fabrica",
      action: FABRICA_RECEIPT_ACTION.outputCopied,
      modelUsed: false,
    });
    expect(buildFabricaSuggestionSavedToArchivumReceipt({ entryId: "entry-1" })).toMatchObject({
      action: FABRICA_RECEIPT_ACTION.outputSavedToArchivum,
      changedLocalStorage: true,
      relatedItemId: "entry-1",
      metadata: { source: "fabrica-suggestion", fileSystemWrites: false },
    });
  });

  it("sanitizes failed summaries through Tabularium contract", () => {
    const receipt = createTabulariumReceipt(buildFabricaSuggestionSavedToArchivumReceipt({ failed: true }));
    expect(receipt.localOnly).toBe(true);
    expect(receipt.cloudUsed).toBe(false);
    expect(receipt.toolsUsed).toBe(false);
  });
});
