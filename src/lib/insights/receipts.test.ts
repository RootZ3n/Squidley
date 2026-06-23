import { describe, expect, it } from "vitest";
import { INSIGHTS_RECEIPT_ACTION } from "./constants";
import {
  buildInsightsModelPreferenceChangedReceipt,
  buildInsightsModelPreferencesResetReceipt,
} from "./receipts";
import { createActivityReceipt } from "@/lib/activity-log/receipts";

describe("Insights receipt helpers", () => {
  it("builds a safe model preference changed receipt", () => {
    const receipt = createActivityReceipt(buildInsightsModelPreferenceChangedReceipt({
      moduleId: "chat",
      role: "chatModel",
      model: "llama3.2",
    }));

    expect(receipt).toMatchObject({
      module: "insights",
      action: INSIGHTS_RECEIPT_ACTION.modelPreferenceChanged,
      status: "succeeded",
      provider: "local",
      model: "llama3.2",
      localOnly: true,
      cloudUsed: false,
      modelUsed: false,
      toolsUsed: false,
      changedLocalStorage: true,
      metadata: { moduleId: "chat", role: "chatModel" },
    });
    expect(receipt.summary).toContain("browser localStorage");
  });

  it("preserves page-specific copy without storing secrets or prompts", () => {
    const receipt = createActivityReceipt(buildInsightsModelPreferenceChangedReceipt({
      moduleId: "workshop",
      role: "buildModel",
      model: "safe-local-model",
      title: "Workshop local model preference changed",
      summary: "The Workshop page saved a browser-local preferred single-file suggestion model. No cloud provider was enabled.",
    }));

    expect(receipt.title).toBe("Workshop local model preference changed");
    expect(receipt.summary).toContain("No cloud provider was enabled");
    expect(JSON.stringify(receipt)).not.toContain("sk-test");
    expect(JSON.stringify(receipt)).not.toContain("raw prompt");
  });

  it("builds a model preferences reset receipt", () => {
    const receipt = createActivityReceipt(buildInsightsModelPreferencesResetReceipt());

    expect(receipt).toMatchObject({
      module: "insights",
      action: INSIGHTS_RECEIPT_ACTION.modelPreferencesReset,
      status: "succeeded",
      localOnly: true,
      cloudUsed: false,
      modelUsed: false,
      toolsUsed: false,
      changedLocalStorage: true,
    });
  });
});
