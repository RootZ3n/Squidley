import { NextResponse } from "next/server";
import { getLocalProviderConfig } from "@/lib/providers/local";
import { detectLocalBackend } from "@/lib/providers/detection";
import type { ResolvedBackendType } from "@/lib/chat/handler";
import {
  encodeStreamEvent,
  openLocalChatStream,
  parseUpstreamStreamLine,
} from "@/lib/chat/stream";
import { detectHallucinatedToolActions } from "@/lib/chat/honestyAnnotation";
import { detectChatReliabilityIntent } from "@/lib/chat/reliabilityIntent";
import { runReliabilityForChat } from "@/lib/chat/reliabilityChat";
import { detectChatAnswerIntent } from "@/lib/chat/answerIntent";
import { validateLocalAnswer } from "@/lib/chat/answerValidator";
import { buildStreamFallback } from "@/lib/chat/answerReliability";

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

  // Detect whether this is a wrap-intent (code-explanation, debugging).
  // The wrap path streams as usual but validates AFTER the upstream
  // `done`. No retry in stream mode — keeps event ordering deterministic.
  let wrapAnswer = false;

  // Reliability Layer intercept: respond with a single reliability event
  // (no upstream model call) for narrow troubleshooting intents.
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string") {
      wrapAnswer = detectChatAnswerIntent(message) !== null;
      const intentMatch = detectChatReliabilityIntent(message);
      if (intentMatch) {
        const startedAt = Date.now();
        const outcome = await runReliabilityForChat({
          intent: intentMatch.intent,
          message,
          config,
        });
        const completedAt = Date.now();
        const lines = [
          encodeStreamEvent({
            type: "reliability",
            intent: outcome.summary.intent,
            reply: outcome.reply,
            summary: outcome.summary.summary,
            stepCount: outcome.summary.stepCount,
            cloudSuggested: outcome.summary.cloudSuggested,
            cloudUsed: false,
            localOnly: true,
            ok: outcome.summary.ok,
          }),
          encodeStreamEvent({
            type: "done",
            completedAt,
            durationMs: Math.max(0, completedAt - startedAt),
          }),
        ].join("");
        return new Response(lines, {
          status: 200,
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }
    }
  }

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
  // Accumulate the model's reply so we can run the honesty annotator before
  // emitting the `done` event. The original reply is NOT modified.
  let accumulatedReply = "";

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
            responseMode: "local_model",
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
              accumulatedReply += parsed.content;
              controller.enqueue(
                encoder.encode(encodeStreamEvent({ type: "delta", text: parsed.content })),
              );
            }
          }
        }

        if (buffer.trim().length > 0) {
          const parsed = parseUpstreamStreamLine(buffer, backend);
          if (parsed?.content) {
            accumulatedReply += parsed.content;
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

        // Run honesty annotator on the accumulated reply. If the model
        // claimed a tool action this build cannot perform, emit a
        // user-visible correction BEFORE the `done` event. The reply
        // text itself was not modified.
        const honesty = detectHallucinatedToolActions(accumulatedReply);
        if (honesty.userVisibleHonestyMessage) {
          controller.enqueue(
            encoder.encode(
              encodeStreamEvent({
                type: "honesty",
                message: honesty.userVisibleHonestyMessage,
                hallucinatedActions: honesty.hallucinatedActions,
                unavailableTools: honesty.unavailableTools,
              }),
            ),
          );
        }

        // Wrap-intent validation: code-explanation/debugging requests
        // get checked for empty / refusal / fake-success / tool-noise.
        // If validation fails, emit a `reliability` event with an
        // honest fallback and decomposition. No retry in stream mode —
        // event ordering stays deterministic (meta → 0..n delta →
        // honesty? → reliability? → done).
        if (wrapAnswer) {
          const validation = validateLocalAnswer(accumulatedReply);
          if (!validation.ok && validation.reason) {
            const fallback = buildStreamFallback({ reason: validation.reason });
            controller.enqueue(
              encoder.encode(encodeStreamEvent(fallback.reliabilityPayload)),
            );
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
