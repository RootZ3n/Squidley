/**
 * Generic capability preflight receipt helper.
 *
 * Reduces duplicated patterns between Velum and Chat by providing a
 * single pipeline:
 *   capability id -> runtime decision -> capability.decision event -> ActivityLog receipt input
 *
 * Hard constraints:
 *   - Pure build helper does not write storage.
 *   - Record helper writes only through logActivityReceipt.
 *   - No fetch. No provider calls. No cloud calls. No UI side effects.
 *   - Receipt metadata never carries prompt text, user/assistant content,
 *     drafts, histories, or secrets.
 */

import {
  capabilityDecisionToActivityReceiptInput,
  type CapabilityActivityLogAdapterOptions,
} from "@/lib/capabilities/activity-log-adapter";
import { createCapabilityDecisionReceipt } from "@/lib/capabilities/receipts";
import {
  resolveCapabilityRuntimeForId,
  type AvailableProfile,
  type CapabilityRuntimeInput,
} from "@/lib/capabilities/runtime";
import {
  logActivityReceipt,
  type ActivityReceipt,
  type ActivityReceiptInput,
  type ActivityStatus,
} from "@/lib/activity-log/receipts";

export interface CapabilityPreflightArgs {
  capabilityId: string;
  availableLocalProfiles?: readonly AvailableProfile[];
  availableCloudProfiles?: readonly AvailableProfile[];
  cloudUnlocked?: boolean;
  cloudConsentGranted?: boolean;
  velumReviewPassed?: boolean;
  blockedReason?: string;
  providerId?: string;
  modelId?: string;
  createdAt?: number;
  note?: string;
  status?: ActivityStatus;
  receiptId?: string;
}

function argsToRuntimeContext(
  args: CapabilityPreflightArgs,
): Omit<CapabilityRuntimeInput, "capabilityId"> {
  return {
    availableLocalProfiles: args.availableLocalProfiles ?? [],
    availableCloudProfiles: args.availableCloudProfiles ?? [],
    cloudUnlocked: args.cloudUnlocked ?? false,
    cloudConsentGranted: args.cloudConsentGranted ?? false,
    velumReviewPassed: args.velumReviewPassed ?? false,
    ...(args.blockedReason !== undefined
      ? { blockedReason: args.blockedReason }
      : {}),
  };
}

/**
 * Pure build: capability id -> runtime decision -> ActivityLog receipt input.
 * Does not write storage.
 */
export function buildCapabilityPreflightReceiptInput(
  args: CapabilityPreflightArgs,
): ActivityReceiptInput {
  const decision = resolveCapabilityRuntimeForId(
    args.capabilityId,
    argsToRuntimeContext(args),
  );
  const event = createCapabilityDecisionReceipt(decision, {
    createdAt: args.createdAt,
    providerId: args.providerId,
    modelId: args.modelId,
    note: args.note,
  });
  const adapterOptions: CapabilityActivityLogAdapterOptions = {};
  if (args.status !== undefined) adapterOptions.status = args.status;
  if (args.receiptId !== undefined) adapterOptions.receiptId = args.receiptId;
  return capabilityDecisionToActivityReceiptInput(event, adapterOptions);
}

/**
 * Record: builds preflight receipt input and persists it through the existing
 * logActivityReceipt path. Returns the persisted receipt on success or null
 * when storage is unavailable. Never throws on storage failure.
 */
export function recordCapabilityPreflightReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: CapabilityPreflightArgs,
): ActivityReceipt | null {
  return logActivityReceipt(
    storage,
    buildCapabilityPreflightReceiptInput(args),
  );
}
