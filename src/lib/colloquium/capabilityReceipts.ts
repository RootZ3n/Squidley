/**
 * Colloquium capability decision receipt helpers.
 *
 * Pure preflight: when the local chat submit path is about to invoke the
 * local model, this records *what Peh decided* about the chat
 * capability -- not the user's prompt or the assistant's reply. The existing
 * `buildColloquiumChatSentReceipt` covers the conversational receipt row.
 *
 * Hard constraints:
 *   - No fetch. No provider calls. No cloud calls.
 *   - The runtime context is constructed from values already known at the
 *     submit site; we never probe a provider here.
 *   - Receipt metadata never carries prompt text, message text, drafts,
 *     histories, or any user/assistant content. The capability adapter only
 *     copies decision metadata.
 *
 * Delegates to the shared preflight helper while preserving all public exports.
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

export const COLLOQUIUM_CHAT_CAPABILITY_ID = "colloquium:chat.basic" as const;

export interface ColloquiumCapabilityReceiptArgs {
  /**
   * Local models already discovered by the Colloquium page. When provided,
   * the helper derives real capability profiles from the model list rather
   * than relying on the boolean localChatReady flag.
   */
  localModels?: readonly LocalModelSnapshot[];
  /**
   * The currently selected model id (e.g. "llama3.2:latest"). Used as a
   * minimal fallback snapshot when localModels is not provided, and always
   * passed as receipt metadata when present.
   */
  selectedModel?: string;
  /**
   * @deprecated Prefer localModels or selectedModel. Kept for backward
   * compatibility: when true and no localModels/selectedModel are given,
   * injects a hardcoded ollama chat profile.
   */
  localChatReady?: boolean;
  /** Provider id, only when known cheaply at the call site (e.g. "ollama"). */
  providerId?: string;
  /** Model id selected by the user, only when known at the call site. */
  modelId?: string;
  createdAt?: number;
  receiptId?: string;
}

/**
 * Resolve available local profiles from the args, preferring real model data
 * over the legacy boolean flag.
 */
function resolveLocalProfiles(args: ColloquiumCapabilityReceiptArgs): AvailableProfile[] {
  // Best: full model list from the page.
  if (args.localModels && args.localModels.length > 0) {
    return localModelsToCapabilityProfiles(args.localModels);
  }

  // Good: selected model name as a minimal snapshot.
  const selected = (args.selectedModel ?? args.modelId ?? "").trim();
  if (selected.length > 0) {
    const snapshot: LocalModelSnapshot = { name: selected, providerId: "ollama" };
    // If the selected model is embedding-only, it cannot provide chat.
    if (isLikelyEmbeddingModel(snapshot)) return [];
    return localModelsToCapabilityProfiles([snapshot]);
  }

  // Legacy fallback: the old boolean flag.
  if (args.localChatReady) {
    return [{ providerId: "ollama", capabilityProfile: "chat" }];
  }

  return [];
}

export function buildColloquiumCapabilityDecisionReceiptInput(
  args: ColloquiumCapabilityReceiptArgs = {},
): TabulariumReceiptInput {
  const modelId = args.selectedModel ?? args.modelId;
  const providerId = modelId ? (args.providerId ?? "ollama") : args.providerId;

  return buildCapabilityPreflightReceiptInput({
    capabilityId: COLLOQUIUM_CHAT_CAPABILITY_ID,
    availableLocalProfiles: resolveLocalProfiles(args),
    providerId,
    modelId,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}

/**
 * Persist a Colloquium capability decision receipt through the existing
 * Tabularium pipeline. Returns the persisted receipt on success or null when
 * `logTabulariumReceipt` could not write. Caller treats the return as
 * advisory -- chat success must not depend on receipt persistence.
 */
export function recordColloquiumCapabilityDecisionReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: ColloquiumCapabilityReceiptArgs = {},
): TabulariumReceipt | null {
  const modelId = args.selectedModel ?? args.modelId;
  const providerId = modelId ? (args.providerId ?? "ollama") : args.providerId;

  return recordCapabilityPreflightReceipt(storage, {
    capabilityId: COLLOQUIUM_CHAT_CAPABILITY_ID,
    availableLocalProfiles: resolveLocalProfiles(args),
    providerId,
    modelId,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}
