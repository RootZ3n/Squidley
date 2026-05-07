import { ARCHIVUM_RECEIPT_ACTION } from "./constants";
import type { ArchivumEntry } from "./storage";
import type { TabulariumReceiptInput } from "@/lib/tabularium/receipts";

export function buildArchivumVelumHandoffReceivedReceipt(args: {
  edit?: boolean;
  entryId?: string;
} = {}): TabulariumReceiptInput {
  return {
    module: "archivum",
    action: ARCHIVUM_RECEIPT_ACTION.velumHandoffReceived,
    status: "info",
    title: args.edit ? "Redacted edit returned from Velum" : "Redacted text returned from Velum",
    summary: args.edit
      ? "A redacted preview returned from Velum to an edit draft. It was not saved automatically."
      : "A redacted preview returned from Velum to More Input. It was not saved automatically.",
    modelUsed: false,
    relatedItemId: args.entryId,
  };
}

export function buildArchivumVelumHandoffCreatedReceipt(args: {
  edit?: boolean;
  entryId?: string;
} = {}): TabulariumReceiptInput {
  return {
    module: "archivum",
    action: ARCHIVUM_RECEIPT_ACTION.velumHandoffCreated,
    status: "info",
    title: args.edit ? "Edited entry sent to Velum" : "More Input sent to Velum",
    summary: args.edit
      ? "An edited Archivum draft was prepared for local Velum review. The edited text is not stored in this receipt."
      : "A More Input draft was prepared for local Velum review. The draft text is not stored in this receipt.",
    modelUsed: false,
    relatedItemId: args.entryId,
  };
}

export function buildArchivumEntryCreatedReceipt(entry: ArchivumEntry): TabulariumReceiptInput {
  return {
    module: "archivum",
    action: ARCHIVUM_RECEIPT_ACTION.entryCreated,
    status: "succeeded",
    title: "Archivum entry saved",
    summary: `A ${entry.type} entry was saved locally. Velum reviewed: ${entry.velumReviewed}.`,
    modelUsed: false,
    changedLocalStorage: true,
    relatedItemId: entry.id,
  };
}

export function buildArchivumEntryEditedReceipt(args: {
  entryId: string;
  reviewReset: boolean;
}): TabulariumReceiptInput {
  return {
    module: "archivum",
    action: ARCHIVUM_RECEIPT_ACTION.entryEdited,
    status: "succeeded",
    title: "Archivum entry edited",
    summary: args.reviewReset
      ? "An entry was edited locally and Velum review status was reset because the text changed."
      : "An entry was edited locally.",
    modelUsed: false,
    changedLocalStorage: true,
    relatedItemId: args.entryId,
  };
}

export function buildArchivumEntryDeletedReceipt(entryId: string): TabulariumReceiptInput {
  return {
    module: "archivum",
    action: ARCHIVUM_RECEIPT_ACTION.entryDeleted,
    status: "succeeded",
    title: "Archivum entry deleted",
    summary: "An Archivum entry was deleted from this browser.",
    modelUsed: false,
    changedLocalStorage: true,
    relatedItemId: entryId,
  };
}

export function buildArchivumEntryExportedReceipt(entryId: string): TabulariumReceiptInput {
  return {
    module: "archivum",
    action: ARCHIVUM_RECEIPT_ACTION.entryExported,
    status: "info",
    title: "Archivum entry exported",
    summary: "One Archivum entry was exported locally from this browser.",
    modelUsed: false,
    relatedItemId: entryId,
  };
}

export function buildArchivumBundleExportedReceipt(entryCount: number): TabulariumReceiptInput {
  return {
    module: "archivum",
    action: ARCHIVUM_RECEIPT_ACTION.bundleExported,
    status: "info",
    title: "Archivum bundle exported",
    summary: `All Archivum entries were exported locally as a JSON bundle. Entry count: ${entryCount}.`,
    modelUsed: false,
    metadata: { entryCount },
  };
}

export function buildArchivumBundleImportFailedReceipt(): TabulariumReceiptInput {
  return {
    module: "archivum",
    action: ARCHIVUM_RECEIPT_ACTION.bundleImportFailed,
    status: "failed",
    title: "Archivum bundle import failed",
    summary: "A selected import file did not match the expected local Archivum bundle schema.",
    modelUsed: false,
  };
}

export function buildArchivumBundleImportedReceipt(importedCount: number): TabulariumReceiptInput {
  return {
    module: "archivum",
    action: ARCHIVUM_RECEIPT_ACTION.bundleImported,
    status: "succeeded",
    title: "Archivum bundle imported",
    summary: `Imported ${importedCount} Archivum entries into this browser. Imported entries were not automatically reviewed by Velum.`,
    modelUsed: false,
    changedLocalStorage: true,
    metadata: { importedCount },
  };
}
