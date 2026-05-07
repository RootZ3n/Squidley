/**
 * Archivum / More Input capability decision receipt helpers.
 *
 * Bridges the Archivum local-storage and future-summarize flows into the
 * capability decision receipt pipeline via the shared preflight helper.
 * Pure functions only; no fetch, no provider calls, no cloud calls.
 *
 * Important: these receipts record *capability decisions* (e.g. "local
 * storage is LOCAL_READY"), NOT the note/document content. Entry text,
 * summaries, and imported file contents never appear in capability receipt
 * metadata. The existing content-side receipts in `receipts.ts` cover the
 * storage audit rows.
 */

import {
  buildCapabilityPreflightReceiptInput,
  recordCapabilityPreflightReceipt,
} from "@/lib/capabilities/preflight";
import type {
  TabulariumReceipt,
  TabulariumReceiptInput,
} from "@/lib/tabularium/receipts";

export const ARCHIVUM_LOCAL_STORAGE_CAPABILITY_ID =
  "archivum:archivum.local-storage" as const;
export const ARCHIVUM_SUMMARIZE_CAPABILITY_ID =
  "archivum:archivum.summarize" as const;
export const MORE_INPUT_LOCAL_STORAGE_CAPABILITY_ID =
  "more-input:archivum.local-storage" as const;
export const MORE_INPUT_SUMMARIZE_CAPABILITY_ID =
  "more-input:archivum.summarize" as const;

export interface ArchivumCapabilityReceiptArgs {
  createdAt?: number;
  receiptId?: string;
}

export interface ArchivumSummarizeCapabilityReceiptArgs {
  /** True when a local chat model is selected and available. */
  localModelReady?: boolean;
  /** Provider id, only when known at the call site (e.g. "ollama"). */
  providerId?: string;
  /** Model id, only when known at the call site. */
  modelId?: string;
  createdAt?: number;
  receiptId?: string;
}

const OLLAMA_CHAT_PROFILE = {
  providerId: "ollama",
  capabilityProfile: "chat",
} as const;

// ---------------------------------------------------------------------------
// Archivum local-storage (local-core, no requirements -> always LOCAL_READY)
// ---------------------------------------------------------------------------

export function buildArchivumLocalStorageCapabilityReceiptInput(
  args: ArchivumCapabilityReceiptArgs = {},
): TabulariumReceiptInput {
  return buildCapabilityPreflightReceiptInput({
    capabilityId: ARCHIVUM_LOCAL_STORAGE_CAPABILITY_ID,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}

export function recordArchivumLocalStorageCapabilityReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: ArchivumCapabilityReceiptArgs = {},
): TabulariumReceipt | null {
  return recordCapabilityPreflightReceipt(storage, {
    capabilityId: ARCHIVUM_LOCAL_STORAGE_CAPABILITY_ID,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}

// ---------------------------------------------------------------------------
// More Input local-storage (local-core, no requirements -> always LOCAL_READY)
// ---------------------------------------------------------------------------

export function buildMoreInputLocalStorageCapabilityReceiptInput(
  args: ArchivumCapabilityReceiptArgs = {},
): TabulariumReceiptInput {
  return buildCapabilityPreflightReceiptInput({
    capabilityId: MORE_INPUT_LOCAL_STORAGE_CAPABILITY_ID,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}

export function recordMoreInputLocalStorageCapabilityReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: ArchivumCapabilityReceiptArgs = {},
): TabulariumReceipt | null {
  return recordCapabilityPreflightReceipt(storage, {
    capabilityId: MORE_INPUT_LOCAL_STORAGE_CAPABILITY_ID,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}

// ---------------------------------------------------------------------------
// Archivum summarize (local-limited, needs ollama chat)
// ---------------------------------------------------------------------------

export function buildArchivumSummarizeCapabilityReceiptInput(
  args: ArchivumSummarizeCapabilityReceiptArgs = {},
): TabulariumReceiptInput {
  return buildCapabilityPreflightReceiptInput({
    capabilityId: ARCHIVUM_SUMMARIZE_CAPABILITY_ID,
    availableLocalProfiles: args.localModelReady ? [OLLAMA_CHAT_PROFILE] : [],
    providerId: args.providerId,
    modelId: args.modelId,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}

export function recordArchivumSummarizeCapabilityReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: ArchivumSummarizeCapabilityReceiptArgs = {},
): TabulariumReceipt | null {
  return recordCapabilityPreflightReceipt(storage, {
    capabilityId: ARCHIVUM_SUMMARIZE_CAPABILITY_ID,
    availableLocalProfiles: args.localModelReady ? [OLLAMA_CHAT_PROFILE] : [],
    providerId: args.providerId,
    modelId: args.modelId,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}

// ---------------------------------------------------------------------------
// More Input summarize (local-limited, needs ollama chat)
// ---------------------------------------------------------------------------

export function buildMoreInputSummarizeCapabilityReceiptInput(
  args: ArchivumSummarizeCapabilityReceiptArgs = {},
): TabulariumReceiptInput {
  return buildCapabilityPreflightReceiptInput({
    capabilityId: MORE_INPUT_SUMMARIZE_CAPABILITY_ID,
    availableLocalProfiles: args.localModelReady ? [OLLAMA_CHAT_PROFILE] : [],
    providerId: args.providerId,
    modelId: args.modelId,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}

export function recordMoreInputSummarizeCapabilityReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: ArchivumSummarizeCapabilityReceiptArgs = {},
): TabulariumReceipt | null {
  return recordCapabilityPreflightReceipt(storage, {
    capabilityId: MORE_INPUT_SUMMARIZE_CAPABILITY_ID,
    availableLocalProfiles: args.localModelReady ? [OLLAMA_CHAT_PROFILE] : [],
    providerId: args.providerId,
    modelId: args.modelId,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}
