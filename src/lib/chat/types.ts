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
   * file"), this is Squidley's user-visible correction message. The model's
   * original `reply` is preserved unchanged.
   */
  honestyMessage?: string;
  /** Tool ids the model implied it used but which this build does not have. */
  unavailableTools?: readonly string[];
  /**
   * Beginner-readable summary emitted when the Small Model Reliability
   * Layer handled this request (e.g. health-check or error-summary intent).
   * Absent for normal chat. Never carries raw content — only a summary.
   */
  reliability?: {
    intent: "summarize_error" | "health_check";
    summary: string;
    stepCount: number;
    cloudSuggested: boolean;
    cloudUsed: false;
    localOnly: true;
    ok: boolean;
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
