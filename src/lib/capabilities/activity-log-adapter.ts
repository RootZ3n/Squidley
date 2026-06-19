/**
 * Adapter: CapabilityDecisionReceiptEvent -> ActivityLog receipt input/object.
 *
 * The capability layer emits pure decision events. The ActivityLog receipts
 * layer owns the persisted, sanitized ledger format. This adapter is the only
 * sanctioned bridge between them — it does not write to storage, fetch, or
 * touch any provider.
 *
 * Why a moduleId mapping is needed:
 *   `ActivityModule` is a strict union of canonical module identifiers used
 *   throughout the receipts ledger. Capability moduleIds include some that are
 *   not in that union (e.g. "more-input" — a routeAliasOf "archivum" — and
 *   future/locked modules like "archelon", "legatus", "imaginanium", etc.).
 *   We map "more-input" to "archivum" because that is its canonical owner;
 *   everything else without a ActivityLog module slot lands under "system".
 *   The original capability moduleId is always preserved in metadata.
 *
 * Why we deliberately omit top-level `provider` and `model`:
 *   A decision event is *not* a model invocation. Setting `provider: "local"`
 *   or `model: <id>` at the top of a ActivityReceipt signals "the model
 *   ran" (and would flip `modelUsed` to true). For decision events, that is
 *   misleading. We pass `modelUsed: false` and surface `providerId` /
 *   `modelId` inside metadata instead.
 */

import {
  createActivityReceipt,
  type ActivityModule,
  type ActivityReceipt,
  type ActivityReceiptInput,
  type ActivityStatus,
} from "@/lib/activity-log/receipts";
import type { CapabilityRuntimeState } from "./contracts";
import type { CapabilityDecisionReceiptEvent } from "./receipts";

export const CAPABILITY_DECISION_TABULARIUM_ACTION = "capability.decision" as const;

const TABULARIUM_MODULES: ReadonlySet<ActivityModule> = new Set<ActivityModule>([
  "colloquium",
  "velum",
  "archivum",
  "oculus",
  "fabrica",
  "nous",
  "settings",
  "system",
]);

const STATE_SUMMARY_PREFIX: Record<CapabilityRuntimeState, string> = {
  LOCAL_READY: "Local ready: Peh can attempt this locally.",
  LOCAL_LIMITED:
    "Local limited: Peh can attempt this locally, but results may be limited.",
  CLOUD_OPTIONAL:
    "Cloud optional: Peh can try locally, but cloud may improve the result.",
  CLOUD_REQUIRED:
    "Cloud required: Peh needs cloud capability before this can run.",
  BLOCKED: "Blocked: This capability is currently blocked.",
};

export interface CapabilityActivityLogAdapterOptions {
  status?: ActivityStatus;
  receiptId?: string;
}

export function moduleIdToActivityModule(moduleId: string): ActivityModule {
  if (moduleId === "more-input") return "archivum";
  if ((TABULARIUM_MODULES as ReadonlySet<string>).has(moduleId)) {
    return moduleId as ActivityModule;
  }
  return "system";
}

function buildSummary(event: CapabilityDecisionReceiptEvent): string {
  const prefix = STATE_SUMMARY_PREFIX[event.state] ?? "Capability decision recorded.";
  if (!event.honestMessage || event.honestMessage.trim().length === 0) {
    return prefix;
  }
  return `${prefix} ${event.honestMessage}`;
}

function buildMetadata(
  event: CapabilityDecisionReceiptEvent,
): Record<string, string | number | boolean> {
  // Insertion order matters: ActivityLog sanitizer keeps the first 12 entries.
  // The 9 spec-required filter fields go first; optional context follows.
  const metadata: Record<string, string | number | boolean> = {
    capabilityId: event.capabilityId,
    moduleId: event.moduleId,
    capabilityTier: event.tier,
    capabilityState: event.state,
    providerMode: event.providerMode,
    cloudAllowed: event.cloudAllowed,
    localAttemptAllowed: event.localAttemptAllowed,
    requiresCloudConsent: event.requiresCloudConsent,
    requiresVelumReview: event.requiresVelumReview,
  };
  if (event.escalationReason !== undefined) {
    metadata.escalationReason = event.escalationReason;
  }
  if (event.reasons.length > 0) {
    metadata.reasons = event.reasons.join("; ");
  }
  if (event.providerId !== undefined) {
    metadata.providerId = event.providerId;
  }
  if (event.modelId !== undefined) {
    metadata.modelId = event.modelId;
  }
  return metadata;
}

export function capabilityDecisionToActivityReceiptInput(
  event: CapabilityDecisionReceiptEvent,
  options: CapabilityActivityLogAdapterOptions = {},
): ActivityReceiptInput {
  return {
    ...(options.receiptId !== undefined ? { id: options.receiptId } : {}),
    createdAt: event.createdAt,
    module: moduleIdToActivityModule(event.moduleId),
    action: CAPABILITY_DECISION_TABULARIUM_ACTION,
    status: options.status ?? "info",
    title: `Capability decision: ${event.capabilityId}`,
    summary: buildSummary(event),
    modelUsed: false,
    metadata: buildMetadata(event),
  };
}

export function createCapabilityDecisionActivityReceipt(
  event: CapabilityDecisionReceiptEvent,
  options: CapabilityActivityLogAdapterOptions = {},
): ActivityReceipt {
  return createActivityReceipt(
    capabilityDecisionToActivityReceiptInput(event, options),
  );
}
