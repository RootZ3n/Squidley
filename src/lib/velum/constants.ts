export const VELUM_HANDOFF_KEY = "peh.velum.redactedDraft.v1";
export const CHAT_TO_VELUM_HANDOFF_KEY = "peh.chat.velumDraft.v1";
export const MORE_INPUT_TO_VELUM_HANDOFF_KEY = "peh.moreInput.velumDraft.v1";
export const VELUM_TO_MORE_INPUT_HANDOFF_KEY = "peh.velum.moreInputRedacted.v1";

export const VELUM_HANDOFF_KINDS = [
  "chat-to-velum-draft",
  "more-input-to-velum-draft",
  "velum-to-chat-redacted",
  "velum-to-more-input-redacted",
] as const;

export const VELUM_RECEIPT_ACTION = {
  textReviewed: "text.reviewed",
  redactionCreated: "redaction.created",
  handoffFromChat: "handoff.from-chat",
  handoffFromMoreInput: "handoff.from-more-input",
  handoffToChat: "handoff.to-chat",
  handoffToMoreInput: "handoff.to-more-input",
} as const;

export const VELUM_RECEIPT_ACTIONS = Object.values(VELUM_RECEIPT_ACTION);
