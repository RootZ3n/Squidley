import { WORKSHOP_RECEIPT_ACTION } from "./constants";
import type { ActivityReceiptInput } from "@/lib/activity-log/receipts";

export function buildWorkshopSuggestionStartedReceipt(args: {
  model: string;
}): ActivityReceiptInput {
  return {
    module: "workshop",
    action: WORKSHOP_RECEIPT_ACTION.suggestionStarted,
    status: "running",
    title: "Workshop single-file suggestion started",
    summary: "A local model was asked for one single-file suggestion. No files were written and no commands were run.",
    provider: "local",
    model: args.model,
    modelUsed: true,
    metadata: { fileSystemWrites: false },
  };
}

export function buildWorkshopSuggestionSucceededReceipt(args: {
  model: string;
  summary?: string;
  durationMs: number;
  outputChars: number;
}): ActivityReceiptInput {
  return {
    module: "workshop",
    action: WORKSHOP_RECEIPT_ACTION.suggestionSucceeded,
    status: "succeeded",
    title: "Workshop single-file suggestion completed",
    summary: args.summary ?? "Workshop created a local single-file suggestion. No files were written.",
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

export function buildWorkshopSuggestionFailedReceipt(args: {
  model: string;
  message: string;
}): ActivityReceiptInput {
  return {
    module: "workshop",
    action: WORKSHOP_RECEIPT_ACTION.suggestionFailed,
    status: "failed",
    title: "Workshop single-file suggestion failed",
    summary: args.message,
    provider: "local",
    model: args.model,
    modelUsed: true,
    completedAt: Date.now(),
    metadata: { fileSystemWrites: false },
  };
}

export function buildWorkshopOutputCopiedReceipt(): ActivityReceiptInput {
  return {
    module: "workshop",
    action: WORKSHOP_RECEIPT_ACTION.outputCopied,
    status: "info",
    title: "Workshop output copied",
    summary: "The user copied a local Workshop suggestion. The full output was not stored in the receipt.",
    modelUsed: false,
  };
}

export function buildWorkshopOutputExportedReceipt(): ActivityReceiptInput {
  return {
    module: "workshop",
    action: WORKSHOP_RECEIPT_ACTION.outputExported,
    status: "info",
    title: "Workshop output exported",
    summary: "The user exported a local Workshop suggestion as a browser download. Peh did not write directly to the file system.",
    modelUsed: false,
    metadata: { fileSystemWrites: false },
  };
}

export function buildWorkshopSuggestionSavedToNotebookReceipt(args: {
  entryId?: string;
  failed?: boolean;
} = {}): ActivityReceiptInput {
  if (args.failed) {
    return {
      module: "workshop",
      action: WORKSHOP_RECEIPT_ACTION.outputSavedToNotebook,
      status: "failed",
      title: "Workshop suggestion save failed",
      summary: "Workshop could not save the suggestion text to Notebook in this browser.",
      modelUsed: false,
    };
  }
  return {
    module: "workshop",
    action: WORKSHOP_RECEIPT_ACTION.outputSavedToNotebook,
    status: "succeeded",
    title: "Workshop suggestion saved to Notebook",
    summary: "The Workshop suggestion text was saved as a local Notebook note. No file was written to disk.",
    modelUsed: false,
    changedLocalStorage: true,
    relatedItemId: args.entryId,
    metadata: { source: "workshop-suggestion", fileSystemWrites: false },
  };
}
