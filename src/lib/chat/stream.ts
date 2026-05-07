import type { LocalProviderConfig } from "@/lib/providers/local";
import {
  applyGatewayCautionToMessages,
  buildGatewayDecision,
  buildGatewayMetadata,
} from "@/lib/security/promptGateway";
import type { ChatErrorBody, ChatErrorCode, ChatMessage } from "./types";
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
      promptGateway?: Record<string, string | boolean | number>;
    }
  | { type: "delta"; text: string }
  | {
      type: "done";
      completedAt: number;
      durationMs: number;
      promptEvalCount?: number;
      evalCount?: number;
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

export async function openLocalChatStream(args: {
  body: unknown;
  config: LocalProviderConfig;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<
  | { ok: true; model: string; startedAt: number; upstream: Response; promptGateway?: Record<string, string | boolean | number> }
  | { ok: false; status: number; payload: ChatErrorBody }
> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const now = args.now ?? Date.now;
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
  const upstreamMessages = applyGatewayCautionToMessages(messages, gateway);

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${args.config.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: upstreamMessages, stream: true }),
    });
  } catch {
    return {
      ok: false,
      status: 503,
      payload: error(
        "local_provider_unreachable",
        `Squidley tried to reach your local model server at ${args.config.endpoint}, but couldn't connect. Start Ollama or check SQUIDLEY_LOCAL_ENDPOINT, then try again.`,
      ),
    };
  }

  if (!upstream.ok || !upstream.body) {
    if (upstream.status === 404) {
      return {
        ok: false,
        status: 404,
        payload: error(
          "local_provider_model_missing",
          `The local server is running, but the model "${model}" isn't installed there. Try \`ollama pull ${model}\`, or pick a different model.`,
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
    ...(gateway.risk !== "low" ? { promptGateway: buildGatewayMetadata(gateway) } : {}),
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
