import type { LocalProviderConfig } from "@/lib/providers/local";
import { fetchLocalWithTimeout } from "@/lib/providers/local";
import { llamaCppChatUrl, parseOpenAIStreamLine } from "@/lib/providers/llamacpp";
import type { ResolvedBackendType } from "./handler";
import {
  applyGatewayCautionToMessages,
  buildGatewayDecision,
  buildGatewayMetadata,
} from "@/lib/security/promptGateway";
import type { ChatErrorBody, ChatErrorCode, ChatMessage } from "./types";
import { buildLocalChatMessages } from "./localSystemPrompt";
import { validateChatRequest } from "./validate";

export type StreamEvent =
  | {
      type: "meta";
      ok: true;
      provider: "local";
      cloudUsed: false;
      toolsUsed: false;
      model: string;
      startedAt: number;
      backendType?: "ollama" | "llama-cpp";
      promptGateway?: Record<string, string | boolean | number>;
      /** Provenance for this answer. Always "local_model" in this build —
       *  no tool execution surface exists. */
      responseMode?: "local_model";
    }
  | { type: "delta"; text: string }
  | {
      /** Emitted before `done` when the accumulated model reply implied a
       *  tool action that this build cannot actually perform. The original
       *  reply is preserved; this event carries Squidley's user-visible
       *  correction. */
      type: "honesty";
      message: string;
      hallucinatedActions: readonly string[];
      unavailableTools: readonly string[];
    }
  | {
      type: "done";
      completedAt: number;
      durationMs: number;
      promptEvalCount?: number;
      evalCount?: number;
    }
  | {
      /** Emitted (instead of meta/delta/done) when a request was handled
       *  by the Small Model Reliability Layer, OR emitted AFTER a stream
       *  that did not produce a valid answer (intent="wrap"). The full
       *  beginner-readable reply travels in `reply`; the structured
       *  `summary` mirrors the non-stream `reliability` field on
       *  ChatSuccessBody. */
      type: "reliability";
      intent: "summarize_error" | "health_check" | "wrap";
      reply: string;
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
    }
  | (ChatErrorBody & { type: "error" });

export interface ParsedOllamaStreamChunk {
  content: string;
  done: boolean;
  promptEvalCount?: number;
  evalCount?: number;
}

interface OllamaStreamChunk {
  message?: { content?: unknown };
  response?: unknown;
  done?: unknown;
  prompt_eval_count?: unknown;
  eval_count?: unknown;
}

export function encodeStreamEvent(event: StreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function parseStreamEventLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  return JSON.parse(trimmed) as StreamEvent;
}

export function parseOllamaStreamLine(line: string): ParsedOllamaStreamChunk | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  const data = JSON.parse(trimmed) as OllamaStreamChunk;
  const messageContent =
    typeof data.message?.content === "string" ? data.message.content : "";
  const generateContent = typeof data.response === "string" ? data.response : "";
  return {
    content: messageContent || generateContent,
    done: data.done === true,
    promptEvalCount:
      typeof data.prompt_eval_count === "number" ? data.prompt_eval_count : undefined,
    evalCount: typeof data.eval_count === "number" ? data.eval_count : undefined,
  };
}

/**
 * Unified stream line parser. Dispatches to Ollama or OpenAI parser
 * based on the resolved backend type.
 *
 * Returns a normalized chunk with `content`, `done`, `promptEvalCount`,
 * and `evalCount` regardless of which backend format was used.
 */
export function parseUpstreamStreamLine(
  line: string,
  backend: ResolvedBackendType,
): ParsedOllamaStreamChunk | null {
  if (backend === "llama-cpp") {
    const chunk = parseOpenAIStreamLine(line);
    if (!chunk) return null;
    return {
      content: chunk.content,
      done: chunk.done,
      promptEvalCount: chunk.promptTokens,
      evalCount: chunk.completionTokens,
    };
  }
  return parseOllamaStreamLine(line);
}

export async function openLocalChatStream(args: {
  body: unknown;
  config: LocalProviderConfig;
  resolvedBackend?: ResolvedBackendType;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}): Promise<
  | { ok: true; model: string; startedAt: number; upstream: Response; backend: ResolvedBackendType; promptGateway?: Record<string, string | boolean | number> }
  | { ok: false; status: number; payload: ChatErrorBody }
> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const now = args.now ?? Date.now;
  const backend: ResolvedBackendType =
    args.resolvedBackend ??
    (args.config.backendType === "llama-cpp" ? "llama-cpp" : "ollama");

  const validation = validateChatRequest(args.body);
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      payload: error("invalid_input", validation.error),
    };
  }

  const { message, history, model: requested } = validation.value;
  const model = requested ?? args.config.model;
  const messages: ChatMessage[] = [
    ...(history ?? []),
    { role: "user", content: message },
  ];
  const gateway = buildGatewayDecision({
    route: "/api/chat/stream",
    module: "colloquium",
    fields: [
      ...messages
        .filter((item) => item.role === "user")
        .map((item, index) => ({
          label: index === messages.length - 1 ? "user-draft" : `history-user-${index}`,
          source: "user-draft",
          text: item.content,
        })),
    ],
  });
  if (!gateway.allowed) {
    return {
      ok: false,
      status: 400,
      payload: error("prompt_gateway_blocked", gateway.recommendedUserMessage, gateway),
    };
  }
  const upstreamMessages = applyGatewayCautionToMessages(buildLocalChatMessages(messages), gateway);

  // Build URL and body based on backend type
  const { url, body } = buildStreamUpstreamRequest({
    backend,
    config: args.config,
    model,
    messages: upstreamMessages,
  });

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
      ? "Start llama-server or check SQUIDLEY_LOCAL_ENDPOINT, then try again."
      : "Start Ollama or check SQUIDLEY_LOCAL_ENDPOINT, then try again.";
    return {
      ok: false,
      status: 503,
      payload: error(
        "local_provider_unreachable",
        timedOut
          ? `Squidley's local model stream to ${args.config.endpoint} timed out. ${serverHint}`
          : `Squidley tried to reach your local model server at ${args.config.endpoint}, but couldn't connect. ${serverHint}`,
      ),
    };
  }

  if (!upstream.ok || !upstream.body) {
    if (upstream.status === 404) {
      const pullHint = backend === "ollama"
        ? `Try \`ollama pull ${model}\`, or pick a different model.`
        : "Check that llama-server was started with the correct model file.";
      return {
        ok: false,
        status: 404,
        payload: error(
          "local_provider_model_missing",
          `The local server is running, but the model "${model}" isn't available. ${pullHint}`,
        ),
      };
    }
    return {
      ok: false,
      status: 502,
      payload: error(
        "local_provider_error",
        `Your local model server could not start a stream (HTTP ${upstream.status}).`,
      ),
    };
  }

  return {
    ok: true,
    model,
    startedAt: now(),
    upstream,
    backend,
    ...(gateway.risk !== "low" ? { promptGateway: buildGatewayMetadata(gateway) } : {}),
  };
}

function buildStreamUpstreamRequest(args: {
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
        stream: true,
      },
    };
  }

  // Ollama — disable extended thinking so content arrives in message.content
  // rather than message.thinking (which Squidley does not surface).
  return {
    url: `${args.config.endpoint}/api/chat`,
    body: {
      model: args.model,
      messages: args.messages,
      stream: true,
      think: false,
    },
  };
}

function error(
  code: ChatErrorCode,
  message: string,
  gateway?: ReturnType<typeof buildGatewayDecision>,
): ChatErrorBody {
  return {
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
  };
}
