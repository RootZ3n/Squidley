export const COLLOQUIUM_STORAGE_KEY = "squidley.colloquium.conversation.v1";
export const COLLOQUIUM_SESSIONS_STORAGE_KEY = "squidley.colloquium.sessions.v2";

export const COLLOQUIUM_RECEIPT_ACTION = {
  chatSent: "chat.sent",
  chatCompleted: "chat.completed",
  chatFailed: "chat.failed",
  chatInterrupted: "chat.interrupted",
  velumHandoffCreated: "velum.handoff.created",
  velumHandoffReceived: "velum.handoff.received",
  oculusHandoffReceived: "oculus.handoff.received",
} as const;

export const COLLOQUIUM_RECEIPT_ACTIONS = Object.values(COLLOQUIUM_RECEIPT_ACTION);

export const COLLOQUIUM_HANDOFF_KINDS = [
  "velum-to-colloquium-redacted",
  "colloquium-to-velum-draft",
  "oculus-to-colloquium-analysis",
] as const;
