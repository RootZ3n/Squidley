export const SETTINGS_RECEIPT_ACTION = {
  tourRestarted: "tour.restart",
  firstRunReset: "first-run.reset",
  localChatsCleared: "local-chats.cleared",
  localChatsExported: "local-chats.exported",
  archivumCleared: "archivum.cleared",
  receiptsExported: "receipts.exported",
} as const;

export const SETTINGS_RECEIPT_ACTIONS = Object.values(SETTINGS_RECEIPT_ACTION);
