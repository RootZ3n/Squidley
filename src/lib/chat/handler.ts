/**
 * Pure chat handler.
 *
 * Takes a parsed JSON body, a local provider config, and an injected fetch
 * implementation (defaults to the global). Calls the configured local
 * Ollama-compatible /api/chat endpoint, non-streaming, and returns a
 * structured result the API route can serialize directly.
 *
 * Design constraints baked in here (so they can be unit-tested):
 *   - Only the configured local endpoint is contacted. No cloud fallback.
 *   - cloudUsed and toolsUsed are always false.
 *   - All errors carry beginner-friendly text.
 */

import type { LocalProviderConfig } from "@/lib/providers/local";
import type {
  ChatErrorCode,
  ChatMessage,
  ChatResponseBody,
} from "./types";
import { validateChatRequest } from "./validate";

export interface HandlerResult {
  status: number;
  payload: ChatResponseBody;
}

interface OllamaChatResponse {
  message?: { role?: string; content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

export async function handleChatRequest(args: {
  body: unknown;
  config: LocalProviderConfig;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<HandlerResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const now = args.now ?? Date.now;

  // 1. Validate.
  const validation = validateChatRequest(args.body);
  if (!validation.ok) {
    return error(400, "invalid_input", validation.error);
  }

  const { message, history, model: requested } = validation.value;
  const model = requested ?? args.config.model;

  // 2. Build the upstream payload. Local endpoint only.
  const messages: ChatMessage[] = [
    ...(history ?? []),
    { role: "user", content: message },
  ];
  const url = `${args.config.endpoint}/api/chat`;
  const startedAt = now();

  let upstream: Response;
  try {
    upstream = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false }),
    });
  } catch (e) {
    return error(
      503,
      "local_provider_unreachable",
      `Squidley tried to reach your local model server at ${args.config.endpoint}, but couldn't connect. You may need to start a local Ollama-compatible server, or change SQUIDLEY_LOCAL_ENDPOINT. See docs/LOCAL_CHAT.md.`,
    );
  }

  // 3. Translate non-2xx into beginner-friendly errors.
  if (!upstream.ok) {
    if (upstream.status === 404) {
      return error(
        404,
        "local_provider_model_missing",
        `The local server is running, but the model "${model}" isn't installed there. Try \`ollama pull ${model}\`, or pick a different model.`,
      );
    }
    let bodyText = "";
    try {
      bodyText = await upstream.text();
    } catch {
      // ignore — we only wanted the text for context
    }
    return error(
      502,
      "local_provider_error",
      `Your local model server responded with an error (HTTP ${upstream.status}). ${truncate(bodyText, 240) || "No details available."}`,
    );
  }

  // 4. Parse upstream JSON.
  let data: OllamaChatResponse;
  try {
    data = (await upstream.json()) as OllamaChatResponse;
  } catch {
    return error(
      502,
      "local_provider_error",
      "Your local model server replied, but the response wasn't valid JSON.",
    );
  }

  const reply = typeof data?.message?.content === "string" ? data.message.content : "";
  const completedAt = now();

  return {
    status: 200,
    payload: {
      ok: true,
      provider: "local",
      cloudUsed: false,
      toolsUsed: false,
      model,
      reply,
      startedAt,
      completedAt,
      durationMs: Math.max(0, completedAt - startedAt),
      promptEvalCount:
        typeof data.prompt_eval_count === "number" ? data.prompt_eval_count : undefined,
      evalCount: typeof data.eval_count === "number" ? data.eval_count : undefined,
    },
  };
}

function error(status: number, code: ChatErrorCode, message: string): HandlerResult {
  return {
    status,
    payload: {
      ok: false,
      provider: "local",
      cloudUsed: false,
      toolsUsed: false,
      error: { code, message },
    },
  };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
