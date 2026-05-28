import { FABRICA_RECEIPT_ACTION } from "./constants";
import type { TabulariumReceiptInput } from "@/lib/tabularium/receipts";

export function buildFabricaSuggestionStartedReceipt(args: {
  model: string;
}): TabulariumReceiptInput {
  return {
    module: "fabrica",
    action: FABRICA_RECEIPT_ACTION.suggestionStarted,
    status: "running",
    title: "Fabrica single-file suggestion started",
    summary: "A local model was asked for one single-file suggestion. No files were written and no commands were run.",
    provider: "local",
    model: args.model,
    modelUsed: true,
    metadata: { fileSystemWrites: false },
  };
}

export function buildFabricaSuggestionSucceededReceipt(args: {
  model: string;
  summary?: string;
  durationMs: number;
  outputChars: number;
}): TabulariumReceiptInput {
  return {
    module: "fabrica",
    action: FABRICA_RECEIPT_ACTION.suggestionSucceeded,
    status: "succeeded",
    title: "Fabrica single-file suggestion completed",
    summary: args.summary ?? "Fabrica created a local single-file suggestion. No files were written.",
    provider: "local",
    model: args.model,
    modelUsed: true,
    completedAt: Date.now(),
    metadata: {
      durationMs: args.durationMs,
      outputChars: args.outputChars,
      fileSystemWrites: false,
    },
  };
}

export function buildFabricaSuggestionFailedReceipt(args: {
  model: string;
  message: string;
}): TabulariumReceiptInput {
  return {
    module: "fabrica",
    action: FABRICA_RECEIPT_ACTION.suggestionFailed,
    status: "failed",
    title: "Fabrica single-file suggestion failed",
    summary: args.message,
    provider: "local",
    model: args.model,
    modelUsed: true,
    completedAt: Date.now(),
    metadata: { fileSystemWrites: false },
  };
}

export function buildFabricaOutputCopiedReceipt(): TabulariumReceiptInput {
  return {
    module: "fabrica",
    action: FABRICA_RECEIPT_ACTION.outputCopied,
    status: "info",
    title: "Fabrica output copied",
    summary: "The user copied a local Fabrica suggestion. The full output was not stored in the receipt.",
    modelUsed: false,
  };
}

export function buildFabricaOutputExportedReceipt(): TabulariumReceiptInput {
  return {
    module: "fabrica",
    action: FABRICA_RECEIPT_ACTION.outputExported,
    status: "info",
    title: "Fabrica output exported",
    summary: "The user exported a local Fabrica suggestion as a browser download. Peh did not write directly to the file system.",
    modelUsed: false,
    metadata: { fileSystemWrites: false },
  };
}

export function buildFabricaSuggestionSavedToArchivumReceipt(args: {
  entryId?: string;
  failed?: boolean;
} = {}): TabulariumReceiptInput {
  if (args.failed) {
    return {
      module: "fabrica",
      action: FABRICA_RECEIPT_ACTION.outputSavedToArchivum,
      status: "failed",
      title: "Fabrica suggestion save failed",
      summary: "Fabrica could not save the suggestion text to Archivum in this browser.",
      modelUsed: false,
    };
  }
  return {
    module: "fabrica",
    action: FABRICA_RECEIPT_ACTION.outputSavedToArchivum,
    status: "succeeded",
    title: "Fabrica suggestion saved to Archivum",
    summary: "The Fabrica suggestion text was saved as a local Archivum note. No file was written to disk.",
    modelUsed: false,
    changedLocalStorage: true,
    relatedItemId: args.entryId,
    metadata: { source: "fabrica-suggestion", fileSystemWrites: false },
  };
}
