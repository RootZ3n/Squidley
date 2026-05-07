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
import {
  localModelsToCapabilityProfiles,
  isLikelyEmbeddingModel,
  type LocalModelSnapshot,
} from "@/lib/capabilities/localReadiness";
import type { AvailableProfile } from "@/lib/capabilities/runtime";
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
  /** Local models already discovered. When provided, real capability profiles are derived. */
  localModels?: readonly LocalModelSnapshot[];
  /** The currently selected model id. Used as minimal fallback when localModels is not provided. */
  selectedModel?: string;
  /**
   * @deprecated Prefer localModels or selectedModel. Kept for backward
   * compatibility: when true and no localModels/selectedModel are given,
   * injects a hardcoded ollama chat profile.
   */
  localModelReady?: boolean;
  /** Provider id, only when known at the call site (e.g. "ollama"). */
  providerId?: string;
  /** Model id, only when known at the call site. */
  modelId?: string;
  createdAt?: number;
  receiptId?: string;
}

/**
 * Resolve available local profiles from summarize args, preferring real model
 * data over the legacy boolean flag.
 */
function resolveSummarizeLocalProfiles(
  args: ArchivumSummarizeCapabilityReceiptArgs,
): AvailableProfile[] {
  // Best: full model list.
  if (args.localModels && args.localModels.length > 0) {
    return localModelsToCapabilityProfiles(args.localModels);
  }

  // Good: selected model name as a minimal snapshot.
  const selected = (args.selectedModel ?? args.modelId ?? "").trim();
  if (selected.length > 0) {
    const snapshot: LocalModelSnapshot = { name: selected, providerId: "ollama" };
    if (isLikelyEmbeddingModel(snapshot)) return [];
    return localModelsToCapabilityProfiles([snapshot]);
  }

  // Legacy fallback: the old boolean flag.
  if (args.localModelReady) {
    return [{ providerId: "ollama", capabilityProfile: "chat" }];
  }

  return [];
}

/** Resolve providerId/modelId from summarize args. */
function resolveSummarizeModelFields(args: ArchivumSummarizeCapabilityReceiptArgs) {
  const modelId = args.selectedModel ?? args.modelId;
  const providerId = modelId ? (args.providerId ?? "ollama") : args.providerId;
  return { providerId, modelId };
}

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
  const { providerId, modelId } = resolveSummarizeModelFields(args);
  return buildCapabilityPreflightReceiptInput({
    capabilityId: ARCHIVUM_SUMMARIZE_CAPABILITY_ID,
    availableLocalProfiles: resolveSummarizeLocalProfiles(args),
    providerId,
    modelId,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}

export function recordArchivumSummarizeCapabilityReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: ArchivumSummarizeCapabilityReceiptArgs = {},
): TabulariumReceipt | null {
  const { providerId, modelId } = resolveSummarizeModelFields(args);
  return recordCapabilityPreflightReceipt(storage, {
    capabilityId: ARCHIVUM_SUMMARIZE_CAPABILITY_ID,
    availableLocalProfiles: resolveSummarizeLocalProfiles(args),
    providerId,
    modelId,
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
  const { providerId, modelId } = resolveSummarizeModelFields(args);
  return buildCapabilityPreflightReceiptInput({
    capabilityId: MORE_INPUT_SUMMARIZE_CAPABILITY_ID,
    availableLocalProfiles: resolveSummarizeLocalProfiles(args),
    providerId,
    modelId,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}

export function recordMoreInputSummarizeCapabilityReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: ArchivumSummarizeCapabilityReceiptArgs = {},
): TabulariumReceipt | null {
  const { providerId, modelId } = resolveSummarizeModelFields(args);
  return recordCapabilityPreflightReceipt(storage, {
    capabilityId: MORE_INPUT_SUMMARIZE_CAPABILITY_ID,
    availableLocalProfiles: resolveSummarizeLocalProfiles(args),
    providerId,
    modelId,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}
