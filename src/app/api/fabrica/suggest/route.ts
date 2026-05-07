import { NextResponse } from "next/server";
import { buildFabricaMessages, createFabricaReceiptSummary, validateFabricaRequest } from "@/lib/fabrica/suggestion";
import { getLocalProviderConfig } from "@/lib/providers/local";
import {
  applyGatewayCautionToMessages,
  buildGatewayDecision,
  buildGatewayMetadata,
} from "@/lib/security/promptGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fabrica single-file suggestion endpoint.
 *
 * SCOPE ENFORCEMENT: Fabrica is intentionally single-file in public mode.
 * - The frontend has no multi-file upload UI.
 * - validateFabricaRequest() enforces a single originalContent field (max 24KB).
 * - The Ratio policy for "fabrica.multi-file-build" is "future" status — not wired.
 * - If a multi-file build UI is added in the future, it must go through the
 *   Ratio decision engine and the "fabrica.multi-file-build" action policy before
 *   calling this endpoint.
 *
 * To add multi-file support: wire "fabrica.multi-file-build" in modulePolicies.ts,
 * implement a /api/fabrica/build endpoint, and add the corresponding Ratio call site.
 */

interface OllamaChatResponse {
  message?: { content?: unknown };
  response?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("invalid_input", "Fabrica could not read the suggestion request.", 400);
  }

  const parsed = validateFabricaRequest(body);
  if (!parsed.ok) return error("invalid_input", parsed.error, 400);

  const config = getLocalProviderConfig();
  const model = parsed.value.model || config.model;
  const startedAt = Date.now();
  const gateway = buildGatewayDecision({
    route: "/api/fabrica/suggest",
    module: "fabrica",
    fields: [
      {
        label: "fabrica-request",
        source: "fabrica-request",
        text: parsed.value.requestedChange,
      },
      {
        label: "fabrica-source",
        source: "fabrica-source-content",
        text: parsed.value.originalContent,
      },
    ],
  });
  if (!gateway.allowed) {
    return error("prompt_gateway_blocked", gateway.recommendedUserMessage, 400, gateway);
  }
  const messages = applyGatewayCautionToMessages(buildFabricaMessages(parsed.value), gateway);

  let upstream: Response;
  try {
    upstream = await fetch(`${config.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages,
      }),
    });
  } catch {
    return error(
      "local_provider_unreachable",
      `Squidley tried to reach your local model server at ${config.endpoint}, but couldn't connect.`,
      503,
    );
  }

  if (!upstream.ok) {
    return error("local_provider_error", `The local model server could not create a Fabrica suggestion (HTTP ${upstream.status}).`, 502);
  }

  let data: OllamaChatResponse;
  try {
    data = (await upstream.json()) as OllamaChatResponse;
  } catch {
    return error("local_provider_error", "The local model replied, but Squidley could not read the Fabrica suggestion.", 502);
  }

  const suggestion =
    typeof data.message?.content === "string"
      ? data.message.content.trim()
      : typeof data.response === "string"
        ? data.response.trim()
        : "";

  if (!suggestion) {
    return error("local_provider_error", "The local model did not return a Fabrica suggestion.", 502);
  }

  return NextResponse.json({
    ok: true,
    provider: "local",
    model,
    suggestion,
    summary: createFabricaReceiptSummary({
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
