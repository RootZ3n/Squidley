/**
 * Mode-aware response provenance for Squidley.
 *
 * Extends the existing ResponseProvenance with mode-specific fields.
 * Every response includes mode, cloud consent state, approval state,
 * and escalation tracking.
 */

import type { SquidleyMode } from "./types";
import type { ResponseMode, ToolAttempt } from "../chat/responseMode";

export interface ModeAwareProvenance {
  /** The operating mode that produced this response. */
  mode: SquidleyMode;
  /** Response mode classification. */
  responseMode: ResponseMode;
  /** Provider used (local or cloud provider id). */
  provider: string;
  /** Model identifier. */
  model?: string;
  /** Backend type for local providers. */
  backend?: "ollama" | "llama-cpp";
  /** Whether a cloud API was actually called. */
  cloudCalled: boolean;
  /** Which cloud provider was called, if any. */
  cloudProvider?: string;
  /** Cloud consent state at time of response. */
  cloudConsentState: "not_required" | "granted" | "denied" | "not_asked";
  /** Tool calls attempted. */
  toolCallsAttempted: readonly ToolAttempt[];
  /** Tool IDs that succeeded. */
  toolCallsSucceeded: readonly string[];
  /** Tool IDs that failed. */
  toolCallsFailed: readonly string[];
  /** Tools that were requested but unavailable. */
  unavailableTools: readonly string[];
  /** Whether approval was required for any action. */
  approvalRequired: boolean;
  /** Approval state if required. */
  approvalState?: "granted" | "denied" | "not_asked";
  /** Final capability status string. */
  finalCapabilityStatus: string;
  /** Receipt ID if a receipt was logged. */
  receiptId?: string;
  /** Whether content was redacted before cloud transmission. */
  redactionState?: "redacted" | "not_required" | "skipped";
  /** Why cloud was used instead of local, if applicable. */
  escalationReason?: string;
  /** Hallucinated actions detected and corrected. */
  hallucinatedActions: readonly string[];
  /** User-visible honesty message. */
  userVisibleHonestyMessage?: string;
}

/**
 * Build provenance for a local-mode, local-model-only response.
 * This is the standard provenance for the current local-first build.
 */
export function makeLocalModeProvenance(args: {
  model?: string;
  backend?: "ollama" | "llama-cpp";
  hallucinatedActions?: readonly string[];
  unavailableTools?: readonly string[];
  userVisibleHonestyMessage?: string;
}): ModeAwareProvenance {
  return {
    mode: "local",
    responseMode: "local_model",
    provider: "local",
    model: args.model,
    backend: args.backend,
    cloudCalled: false,
    cloudConsentState: "not_required",
    toolCallsAttempted: [],
    toolCallsSucceeded: [],
    toolCallsFailed: [],
    unavailableTools: args.unavailableTools ?? [],
    approvalRequired: false,
    finalCapabilityStatus: "answered_by_local_model_only",
    hallucinatedActions: args.hallucinatedActions ?? [],
    userVisibleHonestyMessage: args.userVisibleHonestyMessage,
  };
}

/**
 * Build provenance for a cloud-mode response where cloud was actually called.
 */
export function makeCloudModeProvenance(args: {
  cloudProvider: string;
  model?: string;
  cloudConsentState: "granted" | "denied" | "not_asked";
  toolCallsAttempted?: readonly ToolAttempt[];
  toolCallsSucceeded?: readonly string[];
  toolCallsFailed?: readonly string[];
  unavailableTools?: readonly string[];
  approvalRequired?: boolean;
  approvalState?: "granted" | "denied" | "not_asked";
  redactionState?: "redacted" | "not_required" | "skipped";
  escalationReason?: string;
  receiptId?: string;
}): ModeAwareProvenance {
  const cloudCalled = args.cloudConsentState === "granted";
  return {
    mode: "cloud",
    responseMode: cloudCalled ? "local_model" : "cloud_required_no_call",
    provider: args.cloudProvider,
    model: args.model,
    cloudCalled,
    cloudProvider: args.cloudProvider,
    cloudConsentState: args.cloudConsentState,
    toolCallsAttempted: args.toolCallsAttempted ?? [],
    toolCallsSucceeded: args.toolCallsSucceeded ?? [],
    toolCallsFailed: args.toolCallsFailed ?? [],
    unavailableTools: args.unavailableTools ?? [],
    approvalRequired: args.approvalRequired ?? false,
    approvalState: args.approvalState,
    finalCapabilityStatus: cloudCalled
      ? "answered_by_cloud_provider"
      : "cloud_required_no_call",
    redactionState: args.redactionState,
    escalationReason: args.escalationReason,
    receiptId: args.receiptId,
    hallucinatedActions: [],
  };
}

/**
 * Build provenance for a failed response in any mode.
 */
export function makeFailedModeProvenance(args: {
  mode: SquidleyMode;
  reason: string;
  model?: string;
  backend?: "ollama" | "llama-cpp";
  cloudProvider?: string;
}): ModeAwareProvenance {
  return {
    mode: args.mode,
    responseMode: "failed",
    provider: args.cloudProvider ?? "local",
    model: args.model,
    backend: args.backend,
    cloudCalled: false,
    cloudProvider: args.cloudProvider,
    cloudConsentState: "not_required",
    toolCallsAttempted: [],
    toolCallsSucceeded: [],
    toolCallsFailed: [],
    unavailableTools: [],
    approvalRequired: false,
    finalCapabilityStatus: `failed: ${args.reason}`,
    hallucinatedActions: [],
  };
}

/**
 * Flatten mode-aware provenance to receipt metadata (flat string/number/boolean).
 */
export function modeProvenanceToReceiptMetadata(
  prov: ModeAwareProvenance,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {
    mode: prov.mode,
    responseMode: prov.responseMode,
    provider: prov.provider,
    cloudCalled: prov.cloudCalled,
    cloudConsentState: prov.cloudConsentState,
    toolCallsAttemptedCount: prov.toolCallsAttempted.length,
    toolCallsSucceededCount: prov.toolCallsSucceeded.length,
    toolCallsFailedCount: prov.toolCallsFailed.length,
    unavailableToolsCount: prov.unavailableTools.length,
    approvalRequired: prov.approvalRequired,
    hallucinatedActionsCount: prov.hallucinatedActions.length,
    finalCapabilityStatus: prov.finalCapabilityStatus,
  };
  if (prov.model) out.model = prov.model;
  if (prov.backend) out.backend = prov.backend;
  if (prov.cloudProvider) out.cloudProvider = prov.cloudProvider;
  if (prov.approvalState) out.approvalState = prov.approvalState;
  if (prov.redactionState) out.redactionState = prov.redactionState;
  if (prov.escalationReason) out.escalationReason = prov.escalationReason;
  if (prov.receiptId) out.receiptId = prov.receiptId;
  if (prov.unavailableTools.length > 0) {
    out.unavailableTools = prov.unavailableTools.join(",");
  }
  if (prov.hallucinatedActions.length > 0) {
    out.hallucinatedActions = prov.hallucinatedActions.join(",");
  }
  if (prov.userVisibleHonestyMessage) {
    out.userVisibleHonestyMessage = prov.userVisibleHonestyMessage.slice(0, 240);
  }
  return out;
}
