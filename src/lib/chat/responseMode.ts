/**
 * Response provenance for Public Squidley chat / fabrica / oculus replies.
 *
 * Every reply Squidley produces is tagged with a `responseMode` so the user
 * can always see WHICH path produced the answer:
 *
 *   - local_model            local model generated text only; no tool action
 *   - local_tool             a real local tool was invoked and produced evidence
 *   - model_plus_tool        model + at least one real local tool action
 *   - not_implemented        the asked-for ability is not implemented in this build
 *   - local_blocked          local path exists but is disabled in this mode
 *   - cloud_required_no_call ability would require cloud; no cloud call made
 *   - failed                 the local path attempted and failed
 *   - mock_demo_only         result is a demo/mock, not production behavior
 *
 * In this release every chat reply is "local_model" because Public Squidley
 * does not ship any tool execution surface. The fact that we still tag every
 * reply matters: it is the structural place where a future tool path would
 * have to PROVE its claim via a tool receipt, rather than slip in by virtue
 * of a model saying "I wrote the file".
 */

export type ResponseMode =
  | "local_model"
  | "local_tool"
  | "model_plus_tool"
  | "not_implemented"
  | "local_blocked"
  | "cloud_required_no_call"
  | "failed"
  | "mock_demo_only";

export interface ToolAttempt {
  toolId: string;
  startedAt: number;
  completedAt?: number;
  status: "succeeded" | "failed" | "blocked" | "not_implemented";
  failureReason?: string;
  /** Stable handle to the produced artifact, if any. Never raw user data. */
  artifactRef?: string;
}

export interface ResponseProvenance {
  responseMode: ResponseMode;
  provider: "local";
  model?: string;
  backend?: "ollama" | "llama-cpp";
  toolsAttempted: readonly ToolAttempt[];
  toolsSucceeded: readonly string[];
  toolsFailed: readonly string[];
  /** Tools the user appeared to request that this build does not implement. */
  unavailableTools: readonly string[];
  cloudAttempted: false;
  cloudCalled: false;
  cloudBlockedReason?: string;
  /** Short final status copy for receipts / debug surfaces. */
  finalCapabilityStatus: string;
  /** User-visible honesty message, if Squidley must correct a model claim. */
  userVisibleHonestyMessage?: string;
  /** Tool actions the model HALLUCINATED — claimed to perform without
   *  evidence. Always empty for genuinely tool-backed responses. */
  hallucinatedActions: readonly string[];
}

export function makeLocalModelOnlyProvenance(args: {
  model?: string;
  backend?: "ollama" | "llama-cpp";
  hallucinatedActions?: readonly string[];
  unavailableTools?: readonly string[];
  userVisibleHonestyMessage?: string;
}): ResponseProvenance {
  return {
    responseMode: "local_model",
    provider: "local",
    model: args.model,
    backend: args.backend,
    toolsAttempted: [],
    toolsSucceeded: [],
    toolsFailed: [],
    unavailableTools: args.unavailableTools ?? [],
    cloudAttempted: false,
    cloudCalled: false,
    finalCapabilityStatus: "answered_by_local_model_only",
    userVisibleHonestyMessage: args.userVisibleHonestyMessage,
    hallucinatedActions: args.hallucinatedActions ?? [],
  };
}

export function makeFailedProvenance(args: {
  model?: string;
  backend?: "ollama" | "llama-cpp";
  reason: string;
}): ResponseProvenance {
  return {
    responseMode: "failed",
    provider: "local",
    model: args.model,
    backend: args.backend,
    toolsAttempted: [],
    toolsSucceeded: [],
    toolsFailed: [],
    unavailableTools: [],
    cloudAttempted: false,
    cloudCalled: false,
    finalCapabilityStatus: `local_path_failed: ${args.reason}`,
    hallucinatedActions: [],
  };
}

/**
 * Project provenance into a small flat object suitable for the Tabularium
 * receipt metadata bag (only string/number/boolean values allowed).
 */
export function provenanceToReceiptMetadata(
  prov: ResponseProvenance,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {
    responseMode: prov.responseMode,
    provider: prov.provider,
    cloudAttempted: prov.cloudAttempted,
    cloudCalled: prov.cloudCalled,
    toolsAttemptedCount: prov.toolsAttempted.length,
    toolsSucceededCount: prov.toolsSucceeded.length,
    toolsFailedCount: prov.toolsFailed.length,
    unavailableToolsCount: prov.unavailableTools.length,
    hallucinatedActionsCount: prov.hallucinatedActions.length,
    finalCapabilityStatus: prov.finalCapabilityStatus,
  };
  if (prov.model) out.model = prov.model;
  if (prov.backend) out.backend = prov.backend;
  if (prov.cloudBlockedReason) out.cloudBlockedReason = prov.cloudBlockedReason;
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
