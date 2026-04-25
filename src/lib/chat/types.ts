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
}

export type ChatResponseBody = ChatSuccessBody | ChatErrorBody;

export type ChatErrorCode =
  | "invalid_body"
  | "invalid_input"
  | "local_provider_unreachable"
  | "local_provider_error"
  | "local_provider_model_missing";
