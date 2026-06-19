/**
 * Pure chat handler.
 *
 * Takes a parsed JSON body, a local provider config, and an injected fetch
 * implementation (defaults to the global). Calls the configured local
 * endpoint — either Ollama (/api/chat) or llama-server (/v1/chat/completions)
 * — non-streaming, and returns a structured result the API route can
 * serialize directly.
 *
 * Design constraints baked in here (so they can be unit-tested):
 *   - Only the configured local endpoint is contacted. No cloud fallback.
 *   - cloudUsed and toolsUsed are always false.
 *   - All errors carry beginner-friendly text.
 */

import type { LocalProviderConfig } from "@/lib/providers/local";
import { fetchLocalWithTimeout } from "@/lib/providers/local";
import {
  extractOpenAIReply,
  extractOpenAIUsage,
  llamaCppChatUrl,
} from "@/lib/providers/llamacpp";
import {
  applyGatewayCautionToMessages,
  buildGatewayDecision,
} from "@/lib/security/promptGateway";
import type {
  ChatErrorCode,
  ChatMessage,
  ChatResponseBody,
} from "./types";
import { buildLocalChatMessages } from "./localSystemPrompt";
import { validateChatRequest } from "./validate";
import { detectHallucinatedToolActions } from "./honestyAnnotation";

export interface HandlerResult {
  status: number;
  payload: ChatResponseBody;
}

interface OllamaChatResponse {
  message?: { role?: string; content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Resolve which backend type to use for a chat request. For "auto" backend,
 * the caller should have already detected the backend and passed a resolved
 * type. If still "auto" at call time, default to "ollama" for compatibility.
 */
export type ResolvedBackendType = "ollama" | "llama-cpp";

export async function handleChatRequest(args: {
  body: unknown;
  config: LocalProviderConfig;
  /** Override backend type. When config.backendType is "auto", the API
   *  route should resolve this before calling the handler. */
  resolvedBackend?: ResolvedBackendType;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}): Promise<HandlerResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const now = args.now ?? Date.now;
  const backend: ResolvedBackendType =
    args.resolvedBackend ??
    (args.config.backendType === "llama-cpp" ? "llama-cpp" : "ollama");

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
  const gateway = buildGatewayDecision({
    route: "/api/chat",
    module: "chat",
    fields: messages
      .filter((item) => item.role === "user")
      .map((item, index) => ({
        label: index === 0 ? "user-draft" : `history-user-${index}`,
        source: "user-draft",
        text: item.content,
      })),
  });
  if (!gateway.allowed) {
    return error(400, "prompt_gateway_blocked", gateway.recommendedUserMessage, gateway);
  }
  const upstreamMessages = applyGatewayCautionToMessages(buildLocalChatMessages(messages), gateway);

  // 3. Build URL and body based on backend type.
  const { url, body } = buildUpstreamRequest({
    backend,
    config: args.config,
    model,
    messages: upstreamMessages,
  });

  const startedAt = now();

  let upstream: Response;
  try {
    upstream = await fetchLocalWithTimeout(fetchImpl, url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, args.timeoutMs);
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "AbortError";
    const serverHint = backend === "llama-cpp"
      ? "Start llama-server or check PEH_LOCAL_ENDPOINT."
      : "Start Ollama or check PEH_LOCAL_ENDPOINT. See docs/LOCAL_CHAT.md.";
    return error(
      503,
      "local_provider_unreachable",
      timedOut
        ? `Peh's local model call to ${args.config.endpoint} timed out. ${serverHint}`
        : `Awe nuts — Peh tried to reach your local model server at ${args.config.endpoint}, but couldn't connect. ${serverHint}`,
    );
  }

  // 4. Translate non-2xx into beginner-friendly errors.
  if (!upstream.ok) {
    if (upstream.status === 404) {
      const pullHint = backend === "ollama"
        ? `Try \`ollama pull ${model}\`, or pick a different model.`
        : "Check that llama-server was started with the correct model file.";
      return error(
        404,
        "local_provider_model_missing",
        `The local server is running, but the model "${model}" isn't available. ${pullHint}`,
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

  // 5. Parse upstream JSON.
  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return error(
      502,
      "local_provider_error",
      "Your local model server replied, but the response wasn't valid JSON.",
    );
  }

  const completedAt = now();

  // 6. Extract reply based on backend type.
  if (backend === "llama-cpp") {
    const reply = extractOpenAIReply(data);
    const usage = extractOpenAIUsage(data);
    const honesty = detectHallucinatedToolActions(reply);
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
        promptEvalCount: usage.promptTokens,
        evalCount: usage.completionTokens,
        responseMode: "local_model",
        ...(honesty.userVisibleHonestyMessage
          ? { honestyMessage: honesty.userVisibleHonestyMessage }
          : {}),
        ...(honesty.unavailableTools.length > 0
          ? { unavailableTools: honesty.unavailableTools }
          : {}),
      },
    };
  }

  // Ollama format
  const ollamaData = data as OllamaChatResponse;
  const reply = typeof ollamaData?.message?.content === "string" ? ollamaData.message.content : "";
  const honesty = detectHallucinatedToolActions(reply);

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
        typeof ollamaData.prompt_eval_count === "number" ? ollamaData.prompt_eval_count : undefined,
      evalCount: typeof ollamaData.eval_count === "number" ? ollamaData.eval_count : undefined,
      responseMode: "local_model",
      ...(honesty.userVisibleHonestyMessage
        ? { honestyMessage: honesty.userVisibleHonestyMessage }
        : {}),
      ...(honesty.unavailableTools.length > 0
        ? { unavailableTools: honesty.unavailableTools }
        : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Upstream request building
// ---------------------------------------------------------------------------

function buildUpstreamRequest(args: {
  backend: ResolvedBackendType;
  config: LocalProviderConfig;
  model: string;
  messages: ChatMessage[];
}): { url: string; body: Record<string, unknown> } {
  if (args.backend === "llama-cpp") {
    return {
      url: llamaCppChatUrl(args.config),
      body: {
        model: args.model,
        messages: args.messages,
        stream: false,
      },
    };
  }

  // Ollama — disable extended thinking so content appears in message.content
  // rather than message.thinking (which Peh does not surface).
  return {
    url: `${args.config.endpoint}/api/chat`,
    body: {
      model: args.model,
      messages: args.messages,
      stream: false,
      think: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function error(
  status: number,
  code: ChatErrorCode,
  message: string,
  gateway?: ReturnType<typeof buildGatewayDecision>,
): HandlerResult {
  return {
    status,
    payload: {
      ok: false,
      provider: "local",
      cloudUsed: false,
      toolsUsed: false,
      ...(gateway
        ? {
            promptGateway: {
              risk: gateway.risk,
              allowed: gateway.allowed,
              findingCategories: Array.from(new Set(gateway.findings.map((finding) => finding.category))),
              safeSummary: gateway.safeSummary,
            },
          }
        : {}),
      error: { code, message },
    },
  };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "\u2026";
}
