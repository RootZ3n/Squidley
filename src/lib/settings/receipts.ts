import { SETTINGS_RECEIPT_ACTION } from "./constants";
import type { TabulariumReceiptInput } from "@/lib/tabularium/receipts";

export function buildSettingsTourRestartedReceipt(moduleName: string): TabulariumReceiptInput {
  return {
    module: "settings",
    action: SETTINGS_RECEIPT_ACTION.tourRestarted,
    status: "info",
    title: `${moduleName} tour restart requested`,
    summary: "The local tour preference was updated in this browser.",
    modelUsed: false,
    changedLocalStorage: true,
  };
}

export function buildSettingsFirstRunResetReceipt(): TabulariumReceiptInput {
  return {
    module: "settings",
    action: SETTINGS_RECEIPT_ACTION.firstRunReset,
    status: "info",
    title: "Welcome state reset",
    summary: "Welcome and first-run state were reset in this browser.",
    modelUsed: false,
    changedLocalStorage: true,
  };
}

export function buildSettingsLocalChatsClearedReceipt(): TabulariumReceiptInput {
  return {
    module: "settings",
    action: SETTINGS_RECEIPT_ACTION.localChatsCleared,
    status: "succeeded",
    title: "All local chats cleared",
    summary: "All Colloquium chats saved in this browser were cleared.",
    modelUsed: false,
    changedLocalStorage: true,
  };
}

export function buildSettingsLocalChatsExportedReceipt(args: {
  sessionCount: number;
  messageCount: number;
}): TabulariumReceiptInput {
  return {
    module: "settings",
    action: SETTINGS_RECEIPT_ACTION.localChatsExported,
    status: "info",
    title: "All local chats exported",
    summary: `Exported ${args.sessionCount} local chat sessions from this browser.`,
    modelUsed: false,
    metadata: { sessionCount: args.sessionCount, messageCount: args.messageCount },
  };
}

export function buildSettingsArchivumClearedReceipt(): TabulariumReceiptInput {
  return {
    module: "settings",
    action: SETTINGS_RECEIPT_ACTION.archivumCleared,
    status: "succeeded",
    title: "Archivum entries cleared",
    summary: "All Archivum entries saved in this browser were cleared. Tabularium receipts were not cleared.",
    modelUsed: false,
    changedLocalStorage: true,
  };
}

export function buildSettingsReceiptsExportedReceipt(receiptCount: number): TabulariumReceiptInput {
  return {
    module: "settings",
    action: SETTINGS_RECEIPT_ACTION.receiptsExported,
    status: "info",
    title: "Tabularium receipts exported",
    summary: `Exported ${receiptCount} receipts from this browser.`,
    modelUsed: false,
    metadata: { receiptCount },
  };
}
