export const FABRICA_RECEIPT_ACTION = {
  suggestionStarted: "fabrica.single-file-suggestion.started",
  suggestionSucceeded: "fabrica.single-file-suggestion.succeeded",
  suggestionFailed: "fabrica.single-file-suggestion.failed",
  outputCopied: "fabrica.output.copied",
  outputExported: "fabrica.output.exported",
  outputSavedToArchivum: "fabrica.output.saved-to-archivum",
} as const;

export const FABRICA_RECEIPT_ACTIONS = Object.values(FABRICA_RECEIPT_ACTION);

export const FABRICA_ARCHIVUM_SOURCE = "fabrica-suggestion";
