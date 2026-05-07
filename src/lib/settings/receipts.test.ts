import { describe, expect, it } from "vitest";
import { SETTINGS_RECEIPT_ACTION } from "./constants";
import {
  buildSettingsArchivumClearedReceipt,
  buildSettingsFirstRunResetReceipt,
  buildSettingsLocalChatsClearedReceipt,
  buildSettingsLocalChatsExportedReceipt,
  buildSettingsReceiptsExportedReceipt,
  buildSettingsTourRestartedReceipt,
} from "./receipts";
import { createTabulariumReceipt } from "@/lib/tabularium/receipts";

describe("settings receipt helpers", () => {
  it("builds tour and first-run receipts with local-only defaults", () => {
    const tour = createTabulariumReceipt(buildSettingsTourRestartedReceipt("Velum"));
    const firstRun = createTabulariumReceipt(buildSettingsFirstRunResetReceipt());

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
    const chat = createTabulariumReceipt(buildSettingsLocalChatsClearedReceipt());
    const archivum = createTabulariumReceipt(buildSettingsArchivumClearedReceipt());
    const serialized = JSON.stringify([chat, archivum]);

    expect(chat.action).toBe(SETTINGS_RECEIPT_ACTION.localChatsCleared);
    expect(archivum.action).toBe(SETTINGS_RECEIPT_ACTION.archivumCleared);
    expect(chat.changedLocalStorage).toBe(true);
    expect(archivum.changedLocalStorage).toBe(true);
    expect(serialized).not.toContain("secret chat message");
    expect(serialized).not.toContain("full archivum entry");
    expect(serialized).not.toContain("BEGIN PRIVATE KEY");
  });

  it("builds export receipts with counts only", () => {
    const chats = createTabulariumReceipt(buildSettingsLocalChatsExportedReceipt({
      sessionCount: 3,
      messageCount: 12,
    }));
    const receipts = createTabulariumReceipt(buildSettingsReceiptsExportedReceipt(42));
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
