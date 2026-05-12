import { NextResponse } from "next/server";
import { getLocalProviderConfig } from "@/lib/providers/local";
import { detectLocalBackend } from "@/lib/providers/detection";
import type { ResolvedBackendType } from "@/lib/chat/handler";
import {
  encodeStreamEvent,
  openLocalChatStream,
  parseUpstreamStreamLine,
} from "@/lib/chat/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const config = getLocalProviderConfig();

  // Resolve backend before opening the stream
  let resolvedBackend: ResolvedBackendType | undefined;
  if (config.backendType === "llama-cpp") {
    resolvedBackend = "llama-cpp";
  } else if (config.backendType === "auto") {
    const detection = await detectLocalBackend({ config });
    if (detection.detected) {
      resolvedBackend = detection.detected;
    }
  }

  const opened = await openLocalChatStream({
    body,
    config,
    resolvedBackend,
  });

  if (!opened.ok) {
    if (opened.payload.error.code === "prompt_gateway_blocked") {
      return new Response(encodeStreamEvent({ type: "error", ...opened.payload }), {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(opened.payload, { status: opened.status });
  }

  const backend = opened.backend;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let evalCount: number | undefined;
  let promptEvalCount: number | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          encodeStreamEvent({
            type: "meta",
            ok: true,
            provider: "local",
            cloudUsed: false,
            toolsUsed: false,
            model: opened.model,
            startedAt: opened.startedAt,
            backendType: backend,
            ...(opened.promptGateway ? { promptGateway: opened.promptGateway } : {}),
          }),
        ),
      );

      const reader = opened.upstream.body!.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // OpenAI SSE uses \n\n between events; Ollama uses \n.
          // Split on \n and handle both.
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const parsed = parseUpstreamStreamLine(line, backend);
            if (!parsed) continue;
            if (typeof parsed.promptEvalCount === "number") {
              promptEvalCount = parsed.promptEvalCount;
            }
            if (typeof parsed.evalCount === "number") {
              evalCount = parsed.evalCount;
            }
            if (parsed.content.length > 0) {
              controller.enqueue(
                encoder.encode(encodeStreamEvent({ type: "delta", text: parsed.content })),
              );
            }
          }
        }

        if (buffer.trim().length > 0) {
          const parsed = parseUpstreamStreamLine(buffer, backend);
          if (parsed?.content) {
            controller.enqueue(
              encoder.encode(encodeStreamEvent({ type: "delta", text: parsed.content })),
            );
          }
          if (typeof parsed?.promptEvalCount === "number") {
            promptEvalCount = parsed.promptEvalCount;
          }
          if (typeof parsed?.evalCount === "number") {
            evalCount = parsed.evalCount;
          }
        }

        const completedAt = Date.now();
        controller.enqueue(
          encoder.encode(
            encodeStreamEvent({
              type: "done",
              completedAt,
              durationMs: Math.max(0, completedAt - opened.startedAt),
              promptEvalCount,
              evalCount,
            }),
          ),
        );
        controller.close();
      } catch {
        controller.enqueue(
          encoder.encode(
            encodeStreamEvent({
              type: "error",
              ok: false,
              provider: "local",
              cloudUsed: false,
              toolsUsed: false,
              error: {
                code: "local_provider_error",
                message: "The local model stream stopped before Squidley could finish the reply.",
              },
            }),
          ),
        );
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
