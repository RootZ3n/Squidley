export const CHAT_STORAGE_KEY = "peh.chat.conversation.v1";
export const CHAT_SESSIONS_STORAGE_KEY = "peh.chat.sessions.v2";

export const CHAT_RECEIPT_ACTION = {
  chatSent: "chat.sent",
  chatCompleted: "chat.completed",
  chatFailed: "chat.failed",
  chatInterrupted: "chat.interrupted",
  velumHandoffCreated: "velum.handoff.created",
  velumHandoffReceived: "velum.handoff.received",
  oculusHandoffReceived: "vision.handoff.received",
} as const;

export const CHAT_RECEIPT_ACTIONS = Object.values(CHAT_RECEIPT_ACTION);

export const CHAT_HANDOFF_KINDS = [
  "velum-to-chat-redacted",
  "chat-to-velum-draft",
  "vision-to-chat-analysis",
] as const;
