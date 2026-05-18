/**
 * /api/chat — local-only chat proxy.
 *
 * Thin wrapper. All real logic lives in `src/lib/chat/handler.ts` so it can
 * be unit-tested without spinning up Next. This file exists only to expose
 * the handler over HTTP and to read the local provider config from the
 * server's process environment.
 *
 * Teacher Layer integration: beginner/system questions are detected and
 * answered deterministically from the concept registry before reaching
 * the local model. Teacher answers never call cloud or model.
 *
 * Important: this route never contacts anything other than the configured
 * local endpoint. There is no cloud fallback by design.
 */

import { NextResponse } from "next/server";
import { handleChatRequest } from "@/lib/chat/handler";
import { getLocalProviderConfig } from "@/lib/providers/local";
import { tryTeacherAnswer, teacherResultToPayload } from "@/lib/teacher/chatIntegration";
import { detectChatReliabilityIntent } from "@/lib/chat/reliabilityIntent";
import { runReliabilityForChat } from "@/lib/chat/reliabilityChat";
import { detectChatAnswerIntent } from "@/lib/chat/answerIntent";
import { wrapLocalAnswer } from "@/lib/chat/answerReliability";
import { detectInspectionIntent } from "@/lib/chat/inspectionIntent";
import { handleFileInspectionRequest } from "@/lib/chat/fileInspectionChat";
import type { ChatRequestBody } from "@/lib/chat/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  // Teacher Layer intercept: answer beginner questions deterministically
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string") {
      const teacherResult = tryTeacherAnswer(message);
      if (teacherResult.handled) {
        return NextResponse.json(teacherResultToPayload(teacherResult));
      }

      // Reliability Layer intercept: route narrow troubleshooting intents
      // through the bounded runner. Casual chat falls through to the model.
      const reliabilityIntent = detectChatReliabilityIntent(message);
      if (reliabilityIntent) {
        const config = getLocalProviderConfig();
        const startedAt = Date.now();
        const outcome = await runReliabilityForChat({
          intent: reliabilityIntent.intent,
          message,
          config,
        });
        const completedAt = Date.now();
        return NextResponse.json({
          ok: true,
          provider: "local",
          cloudUsed: false,
          toolsUsed: false,
          model: "reliability_layer",
          reply: outcome.reply,
          startedAt,
          completedAt,
          durationMs: Math.max(0, completedAt - startedAt),
          responseMode: "local_model",
          reliability: outcome.summary,
        });
      }

      // File-inspection intercept: "what does X.tsx do" / "inspect file"
      // — requires explicit approval, refuses without it. Reads
      // exactly one file, redacts secrets, returns a packed summary.
      const inspectionIntent = detectInspectionIntent(message);
      if (inspectionIntent) {
        const inspectionApproval = (body as { inspectionApproval?: unknown })
          .inspectionApproval;
        const startedAt = Date.now();
        const outcome = await handleFileInspectionRequest({
          message,
          path: inspectionIntent.path,
          approval: inspectionApproval,
        });
        const completedAt = Date.now();
        const base = {
          ok: outcome.ok,
          provider: "local" as const,
          cloudUsed: false as const,
          toolsUsed: false as const,
          model: "file_inspection_layer",
          reply: outcome.reply,
          startedAt,
          completedAt,
          durationMs: Math.max(0, completedAt - startedAt),
          responseMode: "local_model" as const,
        };
        if (outcome.status === "approval-required" && outcome.approvalRequest) {
          return NextResponse.json({
            ...base,
            ok: true,
            approvalRequired: outcome.approvalRequest,
          });
        }
        return NextResponse.json({
          ...base,
          ok: true,
          fileInspection: {
            status: outcome.status,
            ...(outcome.path ? { path: outcome.path } : {}),
            summary: outcome.summary,
            cloudUsed: false,
            localOnly: true,
          },
        });
      }

      // Answer-wrap intercept: code-explanation / debugging / "why did
      // this fail?" — calls the local model, then validates. On first-
      // try success the response shape is UNCHANGED (no reliability
      // field), so casual code chat is unaffected.
      const answerIntent = detectChatAnswerIntent(message);
      if (answerIntent) {
        const config = getLocalProviderConfig();
        const wrapped = await wrapLocalAnswer({
          body: body as ChatRequestBody,
          config,
        });
        return NextResponse.json(wrapped.payload, { status: wrapped.status });
      }
    }
  }

  const config = getLocalProviderConfig();
  const result = await handleChatRequest({ body, config });

  return NextResponse.json(result.payload, { status: result.status });
}
