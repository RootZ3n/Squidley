import { SETTINGS_RECEIPT_ACTION } from "./constants";
import type { ActivityReceiptInput } from "@/lib/activity-log/receipts";

export function buildSettingsTourRestartedReceipt(moduleName: string): ActivityReceiptInput {
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

export function buildSettingsFirstRunResetReceipt(): ActivityReceiptInput {
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

export function buildSettingsLocalChatsClearedReceipt(): ActivityReceiptInput {
  return {
    module: "settings",
    action: SETTINGS_RECEIPT_ACTION.localChatsCleared,
    status: "succeeded",
    title: "All local chats cleared",
    summary: "All Chat chats saved in this browser were cleared.",
    modelUsed: false,
    changedLocalStorage: true,
  };
}

export function buildSettingsLocalChatsExportedReceipt(args: {
  sessionCount: number;
  messageCount: number;
}): ActivityReceiptInput {
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

export function buildSettingsNotebookClearedReceipt(): ActivityReceiptInput {
  return {
    module: "settings",
    action: SETTINGS_RECEIPT_ACTION.notebookCleared,
    status: "succeeded",
    title: "Notebook entries cleared",
    summary: "All Notebook entries saved in this browser were cleared. ActivityLog receipts were not cleared.",
    modelUsed: false,
    changedLocalStorage: true,
  };
}

export function buildSettingsReceiptsExportedReceipt(receiptCount: number): ActivityReceiptInput {
  return {
    module: "settings",
    action: SETTINGS_RECEIPT_ACTION.receiptsExported,
    status: "info",
    title: "ActivityLog receipts exported",
    summary: `Exported ${receiptCount} receipts from this browser.`,
    modelUsed: false,
    metadata: { receiptCount },
  };
}
