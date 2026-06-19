export const NOTEBOOK_STORAGE_KEY = "peh.archivum.entries.v1";
export const ARCHIVUM_EXPORT_HEADER = "Peh Public Notebook Export";
export const ARCHIVUM_BUNDLE_NAME = "Peh Public Notebook Bundle";

export const ARCHIVUM_ENTRY_SOURCES = {
  manualPaste: "manual-paste",
  oculusAnalysis: "oculus-analysis",
  fabricaSuggestion: "fabrica-suggestion",
} as const;

export const NOTEBOOK_RECEIPT_ACTION = {
  entryCreated: "entry.created",
  entryEdited: "entry.edited",
  entryDeleted: "entry.deleted",
  entryExported: "entry.exported",
  bundleExported: "bundle.exported",
  bundleImported: "bundle.imported",
  bundleImportFailed: "bundle.import.failed",
  velumHandoffCreated: "velum.handoff.created",
  velumHandoffReceived: "velum.handoff.received",
} as const;

export const NOTEBOOK_RECEIPT_ACTIONS = Object.values(NOTEBOOK_RECEIPT_ACTION);

export const MORE_INPUT_RECEIPT_ACTIONS = [
  NOTEBOOK_RECEIPT_ACTION.entryCreated,
  NOTEBOOK_RECEIPT_ACTION.velumHandoffCreated,
  NOTEBOOK_RECEIPT_ACTION.velumHandoffReceived,
] as const;

export const MORE_INPUT_HANDOFF_KINDS = [
  "more-input-to-velum-draft",
  "velum-to-more-input-redacted",
] as const;
