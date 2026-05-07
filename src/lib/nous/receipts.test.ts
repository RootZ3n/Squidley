import { describe, expect, it } from "vitest";
import { NOUS_RECEIPT_ACTION } from "./constants";
import {
  buildNousModelPreferenceChangedReceipt,
  buildNousModelPreferencesResetReceipt,
} from "./receipts";
import { createTabulariumReceipt } from "@/lib/tabularium/receipts";

describe("Nous receipt helpers", () => {
  it("builds a safe model preference changed receipt", () => {
    const receipt = createTabulariumReceipt(buildNousModelPreferenceChangedReceipt({
      moduleId: "colloquium",
      role: "chatModel",
      model: "llama3.2",
    }));

    expect(receipt).toMatchObject({
      module: "nous",
      action: NOUS_RECEIPT_ACTION.modelPreferenceChanged,
      status: "succeeded",
      provider: "local",
      model: "llama3.2",
      localOnly: true,
      cloudUsed: false,
      modelUsed: false,
      toolsUsed: false,
      changedLocalStorage: true,
      metadata: { moduleId: "colloquium", role: "chatModel" },
    });
    expect(receipt.summary).toContain("browser localStorage");
  });

  it("preserves page-specific copy without storing secrets or prompts", () => {
    const receipt = createTabulariumReceipt(buildNousModelPreferenceChangedReceipt({
      moduleId: "fabrica",
      role: "buildModel",
      model: "safe-local-model",
      title: "Fabrica local model preference changed",
      summary: "The Fabrica page saved a browser-local preferred single-file suggestion model. No cloud provider was enabled.",
    }));

    expect(receipt.title).toBe("Fabrica local model preference changed");
    expect(receipt.summary).toContain("No cloud provider was enabled");
    expect(JSON.stringify(receipt)).not.toContain("sk-test");
    expect(JSON.stringify(receipt)).not.toContain("raw prompt");
  });

  it("builds a model preferences reset receipt", () => {
    const receipt = createTabulariumReceipt(buildNousModelPreferencesResetReceipt());

    expect(receipt).toMatchObject({
      module: "nous",
      action: NOUS_RECEIPT_ACTION.modelPreferencesReset,
      status: "succeeded",
      localOnly: true,
      cloudUsed: false,
      modelUsed: false,
      toolsUsed: false,
      changedLocalStorage: true,
    });
  });
});
