import { describe, expect, it } from "vitest";
import { SETTINGS_RECEIPT_ACTION } from "./constants";
import {
  buildSettingsNotebookClearedReceipt,
  buildSettingsFirstRunResetReceipt,
  buildSettingsLocalChatsClearedReceipt,
  buildSettingsLocalChatsExportedReceipt,
  buildSettingsReceiptsExportedReceipt,
  buildSettingsTourRestartedReceipt,
} from "./receipts";
import { createActivityReceipt } from "@/lib/activity-log/receipts";

describe("settings receipt helpers", () => {
  it("builds tour and first-run receipts with local-only defaults", () => {
    const tour = createActivityReceipt(buildSettingsTourRestartedReceipt("Velum"));
    const firstRun = createActivityReceipt(buildSettingsFirstRunResetReceipt());

    expect(tour).toMatchObject({
      module: "settings",
      action: SETTINGS_RECEIPT_ACTION.tourRestarted,
      status: "info",
      localOnly: true,
      cloudUsed: false,
      modelUsed: false,
      toolsUsed: false,
      changedLocalStorage: true,
    });
    expect(tour.title).toBe("Velum tour restart requested");
    expect(firstRun.action).toBe(SETTINGS_RECEIPT_ACTION.firstRunReset);
    expect(firstRun.summary).toContain("Welcome and first-run state");
  });

  it("builds clear receipts without storing cleared local data", () => {
    const chat = createActivityReceipt(buildSettingsLocalChatsClearedReceipt());
    const notebook = createActivityReceipt(buildSettingsNotebookClearedReceipt());
    const serialized = JSON.stringify([chat, notebook]);

    expect(chat.action).toBe(SETTINGS_RECEIPT_ACTION.localChatsCleared);
    expect(notebook.action).toBe(SETTINGS_RECEIPT_ACTION.notebookCleared);
    expect(chat.changedLocalStorage).toBe(true);
    expect(notebook.changedLocalStorage).toBe(true);
    expect(serialized).not.toContain("secret chat message");
    expect(serialized).not.toContain("full notebook entry");
    expect(serialized).not.toContain("BEGIN PRIVATE KEY");
  });

  it("builds export receipts with counts only", () => {
    const chats = createActivityReceipt(buildSettingsLocalChatsExportedReceipt({
      sessionCount: 3,
      messageCount: 12,
    }));
    const receipts = createActivityReceipt(buildSettingsReceiptsExportedReceipt(42));
    const serialized = JSON.stringify([chats, receipts]);

    expect(chats).toMatchObject({
      action: SETTINGS_RECEIPT_ACTION.localChatsExported,
      metadata: { sessionCount: 3, messageCount: 12 },
    });
    expect(receipts).toMatchObject({
      action: SETTINGS_RECEIPT_ACTION.receiptsExported,
      metadata: { receiptCount: 42 },
    });
    expect(serialized).not.toContain("exported chat content");
    expect(serialized).not.toContain("exported receipt body");
  });
});
