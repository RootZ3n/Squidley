export const WORKSHOP_RECEIPT_ACTION = {
  suggestionStarted: "workshop.single-file-suggestion.started",
  suggestionSucceeded: "workshop.single-file-suggestion.succeeded",
  suggestionFailed: "workshop.single-file-suggestion.failed",
  outputCopied: "workshop.output.copied",
  outputExported: "workshop.output.exported",
  outputSavedToNotebook: "workshop.output.saved-to-archivum",
} as const;

export const WORKSHOP_RECEIPT_ACTIONS = Object.values(WORKSHOP_RECEIPT_ACTION);

export const WORKSHOP_NOTEBOOK_SOURCE = "fabrica-suggestion";
