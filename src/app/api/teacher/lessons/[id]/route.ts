/**
 * GET /api/teacher/lessons/:id — get a single lesson by ID.
 * Read-only, local-only. Never calls cloud.
 */

import { NextResponse } from "next/server";
import { getLessonById } from "@/lib/teacher/lessonRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const lesson = getLessonById(params.id);
  if (!lesson) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: `Lesson "${params.id}" not found.` } },
      { status: 404 },
    );
  }
  return NextResponse.json({
    ok: true,
    provider: "local",
    cloudUsed: false,
    lesson,
  });
}
