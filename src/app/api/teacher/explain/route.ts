/**
 * POST /api/teacher/explain — explain a concept or answer a question.
 * Read-only, local-only. Never calls cloud. Never calls a model.
 *
 * Body: { question: string, currentMode?: "local" | "cloud" }
 */

import { NextResponse } from "next/server";
import { explainSquidleyConcept } from "@/lib/teacher/explain";
import { resolveMode } from "@/lib/mode/resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_body", message: "Could not parse request body." } },
      { status: 400 },
    );
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_input", message: "Question is required." } },
      { status: 400 },
    );
  }

  const modeResolution = resolveMode();
  const currentMode =
    (body.currentMode === "cloud" || body.currentMode === "local")
      ? body.currentMode
      : modeResolution.state.mode;

  const result = explainSquidleyConcept({
    userQuestion: question,
    currentMode,
    includeExamples: true,
    includeRisks: true,
    includeNextStep: true,
  });

  return NextResponse.json({
    ok: true,
    provider: "local",
    cloudUsed: false,
    toolsUsed: false,
    source: "teacher_layer",
    ...result,
  });
}
