/**
 * GET /api/teacher/lessons — list all teacher lessons.
 * Read-only, local-only. Never calls cloud.
 */

import { NextResponse } from "next/server";
import { TEACHER_LESSONS, TEACHER_PATHS } from "@/lib/teacher/lessonRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return NextResponse.json({
    ok: true,
    provider: "local",
    cloudUsed: false,
    count: TEACHER_LESSONS.length,
    lessons: TEACHER_LESSONS.map((l) => ({
      id: l.id,
      title: l.title,
      level: l.level,
      module: l.module,
      objectives: l.objectives,
      concepts: l.concepts,
      prerequisites: l.prerequisites,
      estimatedMinutes: l.estimatedMinutes,
      markdownPath: l.markdownPath,
      requiredForRelease: l.requiredForRelease,
    })),
    paths: TEACHER_PATHS.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      targetAudience: p.targetAudience,
      lessons: p.lessons,
    })),
  });
}
