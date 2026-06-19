import { NOTEBOOK_RECEIPT_ACTION } from "./constants";
import type { NotebookEntry } from "./storage";
import type { ActivityReceiptInput } from "@/lib/activity-log/receipts";

export function buildNotebookVelumHandoffReceivedReceipt(args: {
  edit?: boolean;
  entryId?: string;
} = {}): ActivityReceiptInput {
  return {
    module: "notebook",
    action: NOTEBOOK_RECEIPT_ACTION.velumHandoffReceived,
    status: "info",
    title: args.edit ? "Redacted edit returned from Velum" : "Redacted text returned from Velum",
    summary: args.edit
      ? "A redacted preview returned from Velum to an edit draft. It was not saved automatically."
      : "A redacted preview returned from Velum to More Input. It was not saved automatically.",
    modelUsed: false,
    relatedItemId: args.entryId,
  };
}

export function buildNotebookVelumHandoffCreatedReceipt(args: {
  edit?: boolean;
  entryId?: string;
} = {}): ActivityReceiptInput {
  return {
    module: "notebook",
    action: NOTEBOOK_RECEIPT_ACTION.velumHandoffCreated,
    status: "info",
    title: args.edit ? "Edited entry sent to Velum" : "More Input sent to Velum",
    summary: args.edit
      ? "An edited Notebook draft was prepared for local Velum review. The edited text is not stored in this receipt."
      : "A More Input draft was prepared for local Velum review. The draft text is not stored in this receipt.",
    modelUsed: false,
    relatedItemId: args.entryId,
  };
}

export function buildNotebookEntryCreatedReceipt(entry: NotebookEntry): ActivityReceiptInput {
  return {
    module: "notebook",
    action: NOTEBOOK_RECEIPT_ACTION.entryCreated,
    status: "succeeded",
    title: "Notebook entry saved",
    summary: `A ${entry.type} entry was saved locally. Velum reviewed: ${entry.velumReviewed}.`,
    modelUsed: false,
    changedLocalStorage: true,
    relatedItemId: entry.id,
  };
}

export function buildNotebookEntryEditedReceipt(args: {
  entryId: string;
  reviewReset: boolean;
}): ActivityReceiptInput {
  return {
    module: "notebook",
    action: NOTEBOOK_RECEIPT_ACTION.entryEdited,
    status: "succeeded",
    title: "Notebook entry edited",
    summary: args.reviewReset
      ? "An entry was edited locally and Velum review status was reset because the text changed."
      : "An entry was edited locally.",
    modelUsed: false,
    changedLocalStorage: true,
    relatedItemId: args.entryId,
  };
}

export function buildNotebookEntryDeletedReceipt(entryId: string): ActivityReceiptInput {
  return {
    module: "notebook",
    action: NOTEBOOK_RECEIPT_ACTION.entryDeleted,
    status: "succeeded",
    title: "Notebook entry deleted",
    summary: "An Notebook entry was deleted from this browser.",
    modelUsed: false,
    changedLocalStorage: true,
    relatedItemId: entryId,
  };
}

export function buildNotebookEntryExportedReceipt(entryId: string): ActivityReceiptInput {
  return {
    module: "notebook",
    action: NOTEBOOK_RECEIPT_ACTION.entryExported,
    status: "info",
    title: "Notebook entry exported",
    summary: "One Notebook entry was exported locally from this browser.",
    modelUsed: false,
    relatedItemId: entryId,
  };
}

export function buildNotebookBundleExportedReceipt(entryCount: number): ActivityReceiptInput {
  return {
    module: "notebook",
    action: NOTEBOOK_RECEIPT_ACTION.bundleExported,
    status: "info",
    title: "Notebook bundle exported",
    summary: `All Notebook entries were exported locally as a JSON bundle. Entry count: ${entryCount}.`,
    modelUsed: false,
    metadata: { entryCount },
  };
}

export function buildNotebookBundleImportFailedReceipt(): ActivityReceiptInput {
  return {
    module: "notebook",
    action: NOTEBOOK_RECEIPT_ACTION.bundleImportFailed,
    status: "failed",
    title: "Notebook bundle import failed",
    summary: "A selected import file did not match the expected local Notebook bundle schema.",
    modelUsed: false,
  };
}

export function buildNotebookBundleImportedReceipt(importedCount: number): ActivityReceiptInput {
  return {
    module: "notebook",
    action: NOTEBOOK_RECEIPT_ACTION.bundleImported,
    status: "succeeded",
    title: "Notebook bundle imported",
    summary: `Imported ${importedCount} Notebook entries into this browser. Imported entries were not automatically reviewed by Velum.`,
    modelUsed: false,
    changedLocalStorage: true,
    metadata: { importedCount },
  };
}
