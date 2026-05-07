/**
 * Colloquium capability decision receipt helpers.
 *
 * Pure preflight: when the local chat submit path is about to invoke the
 * local model, this records *what Squidley decided* about the chat
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
import type {
  TabulariumReceipt,
  TabulariumReceiptInput,
} from "@/lib/tabularium/receipts";

export const COLLOQUIUM_CHAT_CAPABILITY_ID = "colloquium:chat.basic" as const;

/**
 * The local chat path uses Ollama. The `colloquium:chat.basic` capability is
 * registered with `localRequirements: [{ providerId: "ollama",
 * capabilityProfile: "chat" }]`. When the submit path knows it has a selected
 * local chat model, supplying this profile makes the runtime resolver report
 * LOCAL_READY; when no model is configured, supply an empty list so the
 * decision honestly reports "not ready".
 */
const COLLOQUIUM_LOCAL_CHAT_PROFILE = {
  providerId: "ollama",
  capabilityProfile: "chat",
} as const;

export interface ColloquiumCapabilityReceiptArgs {
  /**
   * True when the chat submit path has a selected local chat model and is
   * about to invoke it. Defaults to false (no local provider asserted).
   */
  localChatReady?: boolean;
  /** Provider id, only when known cheaply at the call site (e.g. "ollama"). */
  providerId?: string;
  /** Model id selected by the user, only when known at the call site. */
  modelId?: string;
  createdAt?: number;
  receiptId?: string;
}

export function buildColloquiumCapabilityDecisionReceiptInput(
  args: ColloquiumCapabilityReceiptArgs = {},
): TabulariumReceiptInput {
  return buildCapabilityPreflightReceiptInput({
    capabilityId: COLLOQUIUM_CHAT_CAPABILITY_ID,
    availableLocalProfiles: args.localChatReady
      ? [COLLOQUIUM_LOCAL_CHAT_PROFILE]
      : [],
    providerId: args.providerId,
    modelId: args.modelId,
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
  return recordCapabilityPreflightReceipt(storage, {
    capabilityId: COLLOQUIUM_CHAT_CAPABILITY_ID,
    availableLocalProfiles: args.localChatReady
      ? [COLLOQUIUM_LOCAL_CHAT_PROFILE]
      : [],
    providerId: args.providerId,
    modelId: args.modelId,
    createdAt: args.createdAt,
    receiptId: args.receiptId,
  });
}
