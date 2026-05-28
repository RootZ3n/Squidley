/**
 * llama.cpp / llama-server provider support.
 *
 * llama-server exposes an OpenAI-compatible API:
 *   - GET  /health              → server health
 *   - GET  /v1/models           → available models (OpenAI format)
 *   - POST /v1/chat/completions → chat completions (OpenAI format)
 *
 * Some llama-server builds also expose /slots. We probe /health first
 * (lightweight), then /v1/models for discovery.
 *
 * Hard constraints:
 *   - No cloud calls. No side effects. No localStorage writes.
 *   - Errors are beginner-friendly. No raw stack traces.
 *   - Conservative model capability inference.
 */

import type { LocalProviderConfig } from "./local";
import type { LocalModelInfo } from "./ollama";

export interface LlamaCppHealthPayload {
  ok: boolean;
  provider: "local";
  backendType: "llama-cpp";
  endpoint: string;
  modelCount?: number;
  errorCode?: "local_provider_unreachable" | "local_provider_error";
  reason?: string;
  cloudUsed: false;
}

interface OpenAIModelEntry {
  id?: unknown;
  object?: unknown;
  owned_by?: unknown;
}

interface OpenAIModelsResponse {
  data?: unknown;
  object?: unknown;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function llamaCppHealthUrl(config: LocalProviderConfig): string {
  return `${config.endpoint}/health`;
}

export function llamaCppModelsUrl(config: LocalProviderConfig): string {
  return `${config.endpoint}/v1/models`;
}

export function llamaCppChatUrl(config: LocalProviderConfig): string {
  return `${config.endpoint}/v1/chat/completions`;
}

// ---------------------------------------------------------------------------
// Model normalization
// ---------------------------------------------------------------------------

/**
 * Normalize the /v1/models response from llama-server into our standard
 * LocalModelInfo shape. llama-server typically reports one model (the one
 * loaded at startup), but the format supports multiple.
 */
export function normalizeLlamaCppModels(body: unknown): LocalModelInfo[] {
  const response = body as OpenAIModelsResponse | null;
  const data = response?.data;
  if (!Array.isArray(data)) return [];

  return data
    .map((raw): LocalModelInfo | null => {
      const entry = raw as OpenAIModelEntry;
      const id = typeof entry.id === "string" ? entry.id.trim() : "";
      if (id.length === 0) return null;

      return {
        name: id,
        displayName: normalizeLlamaCppModelName(id),
      };
    })
    .filter((m): m is LocalModelInfo => m !== null);
}

/**
 * Clean up a llama-server model id for display. llama-server model ids
 * can be file paths or identifiers depending on how the server was started.
 */
export function normalizeLlamaCppModelName(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length === 0) return trimmed;

  // Strip common file path prefixes and extensions
  let name = trimmed;

  // Remove path components (e.g. "/models/llama-3.2-3b.gguf" → "llama-3.2-3b.gguf")
  const lastSlash = name.lastIndexOf("/");
  if (lastSlash >= 0) name = name.slice(lastSlash + 1);

  // Remove .gguf extension
  if (name.toLowerCase().endsWith(".gguf")) {
    name = name.slice(0, -5);
  }

  return name || trimmed;
}

// ---------------------------------------------------------------------------
// Health probe
// ---------------------------------------------------------------------------

/**
 * Probe a llama-server instance. Checks /health first, then /v1/models
 * for model count.
 */
export async function probeLlamaCppHealth(args: {
  config: LocalProviderConfig;
  fetchImpl?: typeof fetch;
}): Promise<LlamaCppHealthPayload> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const endpoint = args.config.endpoint;

  // 1. Check /health
  let healthResponse: Response;
  try {
    healthResponse = await fetchImpl(llamaCppHealthUrl(args.config), {
      method: "GET",
    });
  } catch {
    return {
      ok: false,
      provider: "local",
      backendType: "llama-cpp",
      endpoint,
      errorCode: "local_provider_unreachable",
      reason: `Peh tried to reach a llama-server at ${endpoint}, but it does not seem to be running. Start llama-server or check your endpoint.`,
      cloudUsed: false,
    };
  }

  if (!healthResponse.ok) {
    // llama-server returns non-200 from /health when model is loading
    const statusHint =
      healthResponse.status === 503
        ? " The model may still be loading."
        : "";
    return {
      ok: false,
      provider: "local",
      backendType: "llama-cpp",
      endpoint,
      errorCode: "local_provider_error",
      reason: `Your llama-server responded with HTTP ${healthResponse.status}.${statusHint}`,
      cloudUsed: false,
    };
  }

  // 2. Try /v1/models for model count
  let modelCount: number | undefined;
  try {
    const modelsResponse = await fetchImpl(llamaCppModelsUrl(args.config), {
      method: "GET",
    });
    if (modelsResponse.ok) {
      const body: unknown = await modelsResponse.json();
      modelCount = normalizeLlamaCppModels(body).length;
    }
  } catch {
    // /v1/models is optional; some builds don't expose it.
    // Health is still ok — we just can't count models.
  }

  return {
    ok: true,
    provider: "local",
    backendType: "llama-cpp",
    endpoint,
    modelCount,
    cloudUsed: false,
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible chat response parsing
// ---------------------------------------------------------------------------

export interface OpenAIChatChoice {
  message?: {
    role?: string;
    content?: string;
    /** Some servers emit reasoning/thinking content in a separate field. */
    reasoning_content?: string;
    reasoning?: string;
    thinking?: string;
  };
  finish_reason?: string;
}

export interface OpenAIChatResponse {
  choices?: OpenAIChatChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
}

/**
 * Extract assistant reply text from an OpenAI-compatible chat response.
 *
 * Some servers/models emit all output in a reasoning field (reasoning_content,
 * reasoning, or thinking) with empty content. When content is empty but
 * reasoning text exists, we do NOT silently substitute it — reasoning tokens
 * may be incomplete chain-of-thought. Instead we return empty string and let
 * the caller decide how to handle it (Peh reports "model did not return
 * a reply" which is honest).
 *
 * The `hasReasoningOnly` helper can be used to detect this case and show a
 * user-facing explanation.
 */
export function extractOpenAIReply(data: unknown): string {
  const response = data as OpenAIChatResponse | null;
  const choices = response?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const content = choices[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

/**
 * Check if the response contains only reasoning/thinking content with no
 * visible reply. Useful for showing honest "model produced reasoning but
 * no visible answer" messages.
 */
export function hasReasoningOnly(data: unknown): boolean {
  const response = data as OpenAIChatResponse | null;
  const choices = response?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return false;
  const msg = choices[0]?.message;
  if (!msg) return false;
  const content = typeof msg.content === "string" ? msg.content.trim() : "";
  if (content.length > 0) return false;
  const reasoning =
    (typeof msg.reasoning_content === "string" ? msg.reasoning_content : "") ||
    (typeof msg.reasoning === "string" ? msg.reasoning : "") ||
    (typeof msg.thinking === "string" ? msg.thinking : "");
  return reasoning.trim().length > 0;
}

/**
 * Extract token usage from an OpenAI-compatible chat response.
 */
export function extractOpenAIUsage(data: unknown): {
  promptTokens?: number;
  completionTokens?: number;
} {
  const response = data as OpenAIChatResponse | null;
  const usage = response?.usage;
  if (!usage) return {};
  return {
    promptTokens:
      typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
    completionTokens:
      typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible streaming chunk parsing
// ---------------------------------------------------------------------------

export interface ParsedOpenAIStreamChunk {
  content: string;
  done: boolean;
  promptTokens?: number;
  completionTokens?: number;
}

interface OpenAIStreamDelta {
  choices?: Array<{
    delta?: { content?: unknown; role?: unknown };
    finish_reason?: unknown;
  }>;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
  };
}

/**
 * Parse a single SSE data line from an OpenAI-compatible streaming response.
 * Lines arrive as "data: {...}" or "data: [DONE]".
 */
export function parseOpenAIStreamLine(line: string): ParsedOpenAIStreamChunk | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  // Strip "data: " prefix if present (SSE format)
  let jsonStr = trimmed;
  if (jsonStr.startsWith("data: ")) {
    jsonStr = jsonStr.slice(6);
  } else if (jsonStr.startsWith("data:")) {
    jsonStr = jsonStr.slice(5);
  }

  const stripped = jsonStr.trim();
  if (stripped === "[DONE]") {
    return { content: "", done: true };
  }
  if (stripped.length === 0) return null;

  let data: OpenAIStreamDelta;
  try {
    data = JSON.parse(stripped) as OpenAIStreamDelta;
  } catch {
    return null;
  }

  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    // Usage-only chunk at end of stream
    if (data.usage) {
      return {
        content: "",
        done: false,
        promptTokens:
          typeof data.usage.prompt_tokens === "number"
            ? data.usage.prompt_tokens
            : undefined,
        completionTokens:
          typeof data.usage.completion_tokens === "number"
            ? data.usage.completion_tokens
            : undefined,
      };
    }
    return null;
  }

  const choice = choices[0];
  const content =
    typeof choice.delta?.content === "string" ? choice.delta.content : "";
  const done = choice.finish_reason === "stop" || choice.finish_reason === "length";

  return {
    content,
    done,
    promptTokens:
      data.usage && typeof data.usage.prompt_tokens === "number"
        ? data.usage.prompt_tokens
        : undefined,
    completionTokens:
      data.usage && typeof data.usage.completion_tokens === "number"
        ? data.usage.completion_tokens
        : undefined,
  };
}
