export const VELUM_HANDOFF_KEY = "peh.velum.redactedDraft.v1";
export const COLLOQUIUM_TO_VELUM_HANDOFF_KEY = "peh.colloquium.velumDraft.v1";
export const MORE_INPUT_TO_VELUM_HANDOFF_KEY = "peh.moreInput.velumDraft.v1";
export const VELUM_TO_MORE_INPUT_HANDOFF_KEY = "peh.velum.moreInputRedacted.v1";

export const VELUM_HANDOFF_KINDS = [
  "colloquium-to-velum-draft",
  "more-input-to-velum-draft",
  "velum-to-colloquium-redacted",
  "velum-to-more-input-redacted",
] as const;

export const VELUM_RECEIPT_ACTION = {
  textReviewed: "text.reviewed",
  redactionCreated: "redaction.created",
  handoffFromColloquium: "handoff.from-colloquium",
  handoffFromMoreInput: "handoff.from-more-input",
  handoffToColloquium: "handoff.to-colloquium",
  handoffToMoreInput: "handoff.to-more-input",
} as const;

export const VELUM_RECEIPT_ACTIONS = Object.values(VELUM_RECEIPT_ACTION);
