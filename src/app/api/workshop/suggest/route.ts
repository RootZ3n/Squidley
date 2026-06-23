import { NextResponse } from "next/server";
import { buildWorkshopMessages, createWorkshopReceiptSummary, validateWorkshopRequest } from "@/lib/workshop/suggestion";
import { getLocalProviderConfig } from "@/lib/providers/local";
import { detectLocalBackend } from "@/lib/providers/detection";
import { llamaCppChatUrl, extractOpenAIReply } from "@/lib/providers/llamacpp";
import type { ResolvedBackendType } from "@/lib/chat/handler";
import {
  applyGatewayCautionToMessages,
  buildGatewayDecision,
  buildGatewayMetadata,
} from "@/lib/security/promptGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Workshop single-file suggestion endpoint.
 *
 * SCOPE ENFORCEMENT: Workshop is intentionally single-file in public mode.
 * - The frontend has no multi-file upload UI.
 * - validateWorkshopRequest() enforces a single originalContent field (max 24KB).
 * - The Assessment policy for "workshop.multi-file-build" is "future" status — not wired.
 * - If a multi-file build UI is added in the future, it must go through the
 *   Assessment decision engine and the "workshop.multi-file-build" action policy before
 *   calling this endpoint.
 *
 * To add multi-file support: wire "workshop.multi-file-build" in modulePolicies.ts,
 * implement a /api/workshop/build endpoint, and add the corresponding Assessment call site.
 */

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("invalid_input", "Workshop could not read the suggestion request.", 400);
  }

  const parsed = validateWorkshopRequest(body);
  if (!parsed.ok) return error("invalid_input", parsed.error, 400);

  const config = getLocalProviderConfig();
  const model = parsed.value.model || config.model;
  const startedAt = Date.now();

  // Resolve backend
  let backend: ResolvedBackendType = "ollama";
  if (config.backendType === "llama-cpp") {
    backend = "llama-cpp";
  } else if (config.backendType === "auto") {
    const detection = await detectLocalBackend({ config });
    if (detection.detected) backend = detection.detected;
  }

  const gateway = buildGatewayDecision({
    route: "/api/workshop/suggest",
    module: "workshop",
    fields: [
      {
        label: "workshop-request",
        source: "workshop-request",
        text: parsed.value.requestedChange,
      },
      {
        label: "workshop-source",
        source: "workshop-source-content",
        text: parsed.value.originalContent,
      },
    ],
  });
  if (!gateway.allowed) {
    return error("prompt_gateway_blocked", gateway.recommendedUserMessage, 400, gateway);
  }
  const messages = applyGatewayCautionToMessages(buildWorkshopMessages(parsed.value), gateway);

  // Build URL and body based on backend
  const { url, requestBody } = buildWorkshopUpstreamRequest({
    backend,
    config,
    model,
    messages,
  });

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch {
    const serverHint = backend === "llama-cpp"
      ? "Start llama-server or check PEH_LOCAL_ENDPOINT."
      : "Start Ollama or check PEH_LOCAL_ENDPOINT.";
    return error(
      "local_provider_unreachable",
      `Peh tried to reach your local model server at ${config.endpoint}, but couldn't connect. ${serverHint}`,
      503,
    );
  }

  if (!upstream.ok) {
    return error("local_provider_error", `The local model server could not create a Workshop suggestion (HTTP ${upstream.status}).`, 502);
  }

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return error("local_provider_error", "The local model replied, but Peh could not read the Workshop suggestion.", 502);
  }

  const suggestion = extractSuggestion(data, backend);

  if (!suggestion) {
    return error("local_provider_error", "The local model did not return a Workshop suggestion.", 502);
  }

  return NextResponse.json({
    ok: true,
    provider: "local",
    model,
    suggestion,
    summary: createWorkshopReceiptSummary({
      fileName: parsed.value.fileName,
      language: parsed.value.language,
      outputChars: suggestion.length,
    }),
    startedAt,
    completedAt: Date.now(),
    localOnly: true,
    cloudUsed: false,
    modelUsed: true,
    toolsUsed: false,
    fileSystemWrites: false,
    promptGateway: buildGatewayMetadata(gateway),
  });
}

// ---------------------------------------------------------------------------
// Backend-specific helpers
// ---------------------------------------------------------------------------

function buildWorkshopUpstreamRequest(args: {
  backend: ResolvedBackendType;
  config: { endpoint: string };
  model: string;
  messages: Array<{ role: string; content: string }>;
}): { url: string; requestBody: Record<string, unknown> } {
  if (args.backend === "llama-cpp") {
    return {
      url: llamaCppChatUrl(args.config as Parameters<typeof llamaCppChatUrl>[0]),
      requestBody: {
        model: args.model,
        stream: false,
        messages: args.messages,
      },
    };
  }

  // Ollama — disable extended thinking
  return {
    url: `${args.config.endpoint}/api/chat`,
    requestBody: {
      model: args.model,
      stream: false,
      think: false,
      messages: args.messages,
    },
  };
}

function extractSuggestion(data: unknown, backend: ResolvedBackendType): string {
  if (backend === "llama-cpp") {
    return extractOpenAIReply(data).trim();
  }

  // Ollama format
  const ollamaData = data as { message?: { content?: unknown }; response?: unknown } | null;
  const content =
    typeof ollamaData?.message?.content === "string"
      ? ollamaData.message.content.trim()
      : typeof ollamaData?.response === "string"
        ? (ollamaData.response as string).trim()
        : "";
  return content;
}

function error(
  code: string,
  message: string,
  status: number,
  gateway?: ReturnType<typeof buildGatewayDecision>,
): Response {
  return NextResponse.json({
    ok: false,
    provider: "local",
    localOnly: true,
    cloudUsed: false,
    modelUsed: false,
    toolsUsed: false,
    fileSystemWrites: false,
    ...(gateway ? { promptGateway: buildGatewayMetadata(gateway) } : {}),
    error: { code, message },
  }, { status });
}
