/**
 * Colloquium capability decision receipt helpers.
 *
 * Pure preflight: when the local chat submit path is about to invoke the
 * local model, this records *what Squidley decided* about the chat
 * capability — not the user's prompt or the assistant's reply. The existing
 * `buildColloquiumChatSentReceipt` covers the conversational receipt row.
 *
 * Hard constraints:
 *   - No fetch. No provider calls. No cloud calls.
 *   - The runtime context is constructed from values already known at the
 *     submit site; we never probe a provider here.
 *   - Receipt metadata never carries prompt text, message text, drafts,
 *     histories, or any user/assistant content. The capability adapter only
 *     copies decision metadata.
 */

import {
  capabilityDecisionToTabulariumReceiptInput,
  type CapabilityTabulariumAdapterOptions,
} from "@/lib/capabilities/tabularium-adapter";
import { createCapabilityDecisionReceipt } from "@/lib/capabilities/receipts";
import {
  resolveCapabilityRuntimeForId,
  type CapabilityRuntimeInput,
} from "@/lib/capabilities/runtime";
import {
  logTabulariumReceipt,
  type TabulariumReceipt,
  type TabulariumReceiptInput,
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

function colloquiumRuntimeContext(
  localChatReady: boolean,
): Omit<CapabilityRuntimeInput, "capabilityId"> {
  return {
    availableLocalProfiles: localChatReady ? [COLLOQUIUM_LOCAL_CHAT_PROFILE] : [],
    availableCloudProfiles: [],
    cloudUnlocked: false,
    cloudConsentGranted: false,
    velumReviewPassed: false,
  };
}

export function buildColloquiumCapabilityDecisionReceiptInput(
  args: ColloquiumCapabilityReceiptArgs = {},
): TabulariumReceiptInput {
  const decision = resolveCapabilityRuntimeForId(
    COLLOQUIUM_CHAT_CAPABILITY_ID,
    colloquiumRuntimeContext(Boolean(args.localChatReady)),
  );
  const event = createCapabilityDecisionReceipt(decision, {
    createdAt: args.createdAt,
    providerId: args.providerId,
    modelId: args.modelId,
  });
  const adapterOptions: CapabilityTabulariumAdapterOptions = {};
  if (args.receiptId !== undefined) adapterOptions.receiptId = args.receiptId;
  return capabilityDecisionToTabulariumReceiptInput(event, adapterOptions);
}

/**
 * Persist a Colloquium capability decision receipt through the existing
 * Tabularium pipeline. Returns the persisted receipt on success or null when
 * `logTabulariumReceipt` could not write. Caller treats the return as
 * advisory — chat success must not depend on receipt persistence.
 */
export function recordColloquiumCapabilityDecisionReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: ColloquiumCapabilityReceiptArgs = {},
): TabulariumReceipt | null {
  return logTabulariumReceipt(
    storage,
    buildColloquiumCapabilityDecisionReceiptInput(args),
  );
}
