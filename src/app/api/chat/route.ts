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
import { detectPlanningIntent } from "@/lib/planning";
import { runPlanningForChat } from "@/lib/chat/planningChat";
import { detectEditIntent } from "@/lib/chat/editIntent";
import { handleEditingChatRequest } from "@/lib/chat/editingChat";
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

      // Tiny-edit intercept: structured editProposal supplied by the
      // UI (or a natural-language "make a tiny edit" message) triggers
      // a Phase A approval request or, with editApproval, a Phase B
      // apply+verify+rollback. NEVER falls through to the model.
      const bodyTyped = body as {
        editProposal?: {
          path: string;
          originalSnippet: string;
          proposedSnippet: string;
          reason?: string;
        };
        editApproval?: unknown;
        inspectedFiles?: readonly { path: string; packedContent: string }[];
      };
      const editIntent = detectEditIntent(message);
      const editProposal =
        bodyTyped.editProposal ?? editIntent?.parsed
          ? bodyTyped.editProposal ??
            (editIntent && editIntent.parsed
              ? {
                  path: editIntent.parsed.path,
                  originalSnippet: editIntent.parsed.originalSnippet,
                  proposedSnippet: editIntent.parsed.proposedSnippet,
                }
              : undefined)
          : undefined;
      if (editProposal) {
        const inspectedPaths = (bodyTyped.inspectedFiles ?? []).map(
          (f) => f.path,
        );
        const startedAt = Date.now();
        const outcome = await handleEditingChatRequest({
          message,
          editProposal,
          approval: bodyTyped.editApproval,
          inspectedPaths,
        });
        const completedAt = Date.now();
        const base = {
          ok: outcome.ok,
          provider: "local" as const,
          cloudUsed: false as const,
          toolsUsed: false as const,
          model: "tiny_edit_layer",
          reply: outcome.reply,
          startedAt,
          completedAt,
          durationMs: Math.max(0, completedAt - startedAt),
          responseMode: "local_model" as const,
        };
        if (
          outcome.status === "approval-required" &&
          outcome.approvalRequest &&
          outcome.diffPreview
        ) {
          return NextResponse.json({
            ...base,
            ok: true,
            editApprovalRequired: {
              action: "tiny_edit" as const,
              path: outcome.approvalRequest.path,
              originalSnippet: outcome.approvalRequest.originalSnippet,
              proposedSnippet: outcome.approvalRequest.proposedSnippet,
              originalHash: outcome.approvalRequest.originalHash,
              proposedHash: outcome.approvalRequest.proposedHash,
              fileHash: outcome.approvalRequest.fileHash,
              summary: outcome.approvalRequest.summary,
              reason: outcome.approvalRequest.reason,
              confidence: outcome.approvalRequest.confidence,
              riskLevel: outcome.approvalRequest.riskLevel,
              expiresInMs: outcome.approvalRequest.expiresInMs,
              limitations: outcome.approvalRequest.limitations,
              diffPreview: {
                path: outcome.diffPreview.path,
                lines: outcome.diffPreview.lines,
                bytesRemoved: outcome.diffPreview.bytesRemoved,
                bytesAdded: outcome.diffPreview.bytesAdded,
                linesChanged: outcome.diffPreview.linesChanged,
              },
            },
          });
        }
        return NextResponse.json({
          ...base,
          ok: outcome.ok,
          edit: {
            status: outcome.status,
            path: outcome.path,
            applied: outcome.applied,
            rolledBack: outcome.rolledBack,
            summary: outcome.summary,
            ...(outcome.failureReason ? { failureReason: outcome.failureReason } : {}),
            ...(outcome.verification
              ? {
                  verification: {
                    verificationStatus: outcome.verification.verificationStatus,
                    ...(outcome.verification.failureReason
                      ? { failureReason: outcome.verification.failureReason }
                      : {}),
                    checks: outcome.verification.checks.map((c) => ({
                      id: c.id,
                      description: c.description,
                      passed: c.passed,
                    })),
                  },
                }
              : {}),
            receiptActions: outcome.receiptActions,
            cloudUsed: false,
            localOnly: true,
          },
        });
      }

      // Structured planning intercept: "make a plan", "how would you
      // fix this?", "what files are involved?" — produces a
      // deterministic, evidence-backed plan with provenance. Never
      // reads files itself; only consumes prior inspected evidence.
      const planningIntent = detectPlanningIntent(message);
      if (planningIntent) {
        const inspectedFiles =
          (body as { inspectedFiles?: readonly { path: string; packedContent: string }[] })
            .inspectedFiles ?? [];
        const startedAt = Date.now();
        const outcome = runPlanningForChat({
          message,
          inspectedFiles,
        });
        const completedAt = Date.now();
        return NextResponse.json({
          ok: outcome.ok,
          provider: "local" as const,
          cloudUsed: false as const,
          toolsUsed: false as const,
          model: "planning_layer",
          reply: outcome.reply,
          startedAt,
          completedAt,
          durationMs: Math.max(0, completedAt - startedAt),
          responseMode: "local_model" as const,
          plan: outcome.summary,
          planProvenance: {
            known: outcome.provenance.known,
            inferred: outcome.provenance.inferred,
            assumed: outcome.provenance.assumed,
            missing: outcome.provenance.missing,
            suggestedNextInspections: outcome.provenance.suggestedNextInspections,
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
