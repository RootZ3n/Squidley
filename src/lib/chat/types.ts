/**
 * Shared chat types between the API route, the Colloquium UI, and tests.
 */

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequestBody {
  /** The new user message to send. Required. */
  message: string;
  /** Optional model override. Falls back to the server's configured default. */
  model?: string;
  /** Prior conversation in chronological order (excluding the new message). */
  history?: ChatMessage[];
  /**
   * Optional approval token for read-only file inspection. Only consumed
   * when the message has a file-inspection intent. The token is bound
   * to a single path and has a short TTL — see fileApproval.ts.
   */
  inspectionApproval?: unknown;
  /**
   * Evidence the client gathered from prior approved inspections in
   * this conversation. Each entry is a `(path, packedContent)` pair
   * that the planner may reference as KNOWN evidence. The planner
   * never reads files itself; if a file is not in this list, it can
   * only be `inferred`, `assumed`, or `missing`.
   */
  inspectedFiles?: readonly { path: string; packedContent: string }[];
  /**
   * Structured tiny-edit proposal supplied by the UI. When present,
   * the chat route routes the message through the tiny-edit workflow
   * (Phase A if `editApproval` is absent, Phase B if it is present).
   */
  editProposal?: {
    path: string;
    originalSnippet: string;
    proposedSnippet: string;
    reason?: string;
  };
  /**
   * Approval token for a tiny edit. Bound to the four hashes
   * (path / originalHash / proposedHash / fileHash). Without this
   * token, no write happens.
   */
  editApproval?: unknown;
}

export interface ChatErrorBody {
  ok: false;
  provider: "local";
  cloudUsed: false;
  toolsUsed: false;
  promptGateway?: {
    risk: "low" | "medium" | "high" | "blocked";
    allowed: boolean;
    findingCategories: string[];
    safeSummary: string;
  };
  error: {
    code: ChatErrorCode;
    /** Beginner-friendly message safe to render in the UI. */
    message: string;
  };
}

export interface ChatSuccessBody {
  ok: true;
  provider: "local";
  cloudUsed: false;
  toolsUsed: false;
  model: string;
  reply: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  /** Exact prompt token count from the upstream model, if reported. */
  promptEvalCount?: number;
  /** Exact response token count from the upstream model, if reported. */
  evalCount?: number;
  /**
   * Provenance for this answer — which path produced it. In this public build,
   * every successful reply is `"local_model"` because there is no tool
   * execution surface. The field is present unconditionally so future tool
   * paths must explicitly set it and prove their claim with a tool receipt.
   */
  responseMode?: import("./responseMode").ResponseMode;
  /**
   * If the local model's reply hallucinated a tool action (e.g. "I wrote the
   * file"), this is Peh's user-visible correction message. The model's
   * original `reply` is preserved unchanged.
   */
  honestyMessage?: string;
  /** Tool ids the model implied it used but which this build does not have. */
  unavailableTools?: readonly string[];
  /**
   * Beginner-readable summary emitted when the Small Model Reliability
   * Layer handled this request. Absent for normal chat that passed
   * validation on first try. Never carries raw content — only a summary.
   *
   * Three intents:
   *   - "summarize_error" / "health_check": handled fully by reliability
   *     layer (no upstream model call).
   *   - "wrap": local model was called for code-explanation / debugging,
   *     and validation/retry/fallback machinery was applied. Only set
   *     when something other than first-try success happened.
   */
  reliability?: {
    intent: "summarize_error" | "health_check" | "wrap";
    summary: string;
    stepCount: number;
    cloudSuggested: boolean;
    cloudUsed: false;
    localOnly: true;
    ok: boolean;
    /** Only present for intent="wrap". */
    kind?: "validated" | "retried-ok" | "fallback";
    /** Only present for intent="wrap". */
    retries?: number;
    /** Only present for intent="wrap" with kind="fallback". */
    decomposition?: readonly string[];
    /** Tabularium action ids the reliability layer emitted for this turn. */
    receiptActions?: readonly string[];
  };
  /**
   * Approval-required response body. Present when the user asked for
   * file inspection but no valid approval was supplied. The UI renders
   * this as an approval card and re-sends the message with an approval
   * token if the user clicks Approve. Reading is NOT performed yet.
   */
  approvalRequired?: {
    action: "inspect_one_file_safely";
    path: string;
    reason: string;
    riskLevel: "low" | "medium" | "high";
    willRead: string;
    willNotRead: readonly string[];
    secretRedaction: { applied: true; disclaimer: string };
    safetyRules: readonly string[];
    expiresInMs: number;
  };
  /**
   * Structured outcome of a completed/blocked/denied file inspection.
   * Absent on casual chat and on approval-required responses.
   */
  fileInspection?: {
    status: "completed" | "blocked" | "denied" | "needs-path";
    path?: string;
    summary: string;
    redactionsApplied?: readonly { category: string; count: number }[];
    cloudUsed: false;
    localOnly: true;
  };
  /**
   * Structured plan + provenance, present when the message triggered
   * the Structured Planning Layer. The plan is deterministic and
   * evidence-backed (see lib/planning).
   */
  plan?: {
    id: string;
    userGoal: string;
    confidence: "high" | "medium" | "low";
    confidenceReasoning: string;
    riskLevel: "safe" | "review" | "elevated" | "blocked";
    stepCount: number;
    requiresApproval: boolean;
    suggestedNextInspections: readonly string[];
    receiptActions: readonly string[];
    cloudUsed: false;
    localOnly: true;
  };
  /**
   * Beginner-friendly provenance projection of `plan`. Always present
   * when `plan` is. Contains known/inferred/assumed/missing buckets.
   */
  planProvenance?: {
    known: readonly string[];
    inferred: readonly string[];
    assumed: readonly string[];
    missing: readonly string[];
    suggestedNextInspections: readonly string[];
  };
  /**
   * Approval-required body for a tiny edit. Present when the user
   * asked Peh to make an edit but did not supply an approval
   * token. The UI renders a diff-preview + Approve/Decline panel. No
   * file content has been written.
   */
  editApprovalRequired?: {
    action: "tiny_edit";
    path: string;
    originalSnippet: string;
    proposedSnippet: string;
    originalHash: string;
    proposedHash: string;
    fileHash: string;
    summary: string;
    reason: string;
    confidence: "high" | "medium" | "low";
    riskLevel: "safe" | "review" | "elevated" | "blocked";
    expiresInMs: number;
    limitations: readonly string[];
    diffPreview: {
      path: string;
      lines: readonly string[];
      bytesRemoved: number;
      bytesAdded: number;
      linesChanged: number;
    };
  };
  /**
   * Structured outcome of an applied/blocked/denied tiny edit. Absent
   * on casual chat and on `editApprovalRequired` responses.
   */
  edit?: {
    status:
      | "approval-required"
      | "blocked"
      | "applied-verified"
      | "applied-rolled-back"
      | "denied";
    path: string;
    applied: boolean;
    rolledBack: boolean;
    summary: string;
    failureReason?: string;
    verification?: {
      verificationStatus: "passed" | "failed";
      failureReason?: string;
      checks: readonly { id: string; description: string; passed: boolean }[];
    };
    receiptActions: readonly string[];
    cloudUsed: false;
    localOnly: true;
  };
}

export type ChatResponseBody = ChatSuccessBody | ChatErrorBody;

export type ChatErrorCode =
  | "invalid_body"
  | "invalid_input"
  | "local_provider_unreachable"
  | "local_provider_error"
  | "local_provider_model_missing"
  | "prompt_gateway_blocked";
