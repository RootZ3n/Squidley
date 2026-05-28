/**
 * GET /api/teacher/concepts — list all teacher concepts.
 * Read-only, local-only. Never calls cloud.
 */

import { NextResponse } from "next/server";
import { TEACHER_CONCEPTS } from "@/lib/teacher/concepts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return NextResponse.json({
    ok: true,
    provider: "local",
    cloudUsed: false,
    count: TEACHER_CONCEPTS.length,
    concepts: TEACHER_CONCEPTS.map((c) => ({
      id: c.id,
      title: c.title,
      plainLanguageDefinition: c.plainLanguageDefinition,
      relatedConcepts: c.relatedConcepts,
      linkedDocs: c.linkedDocs,
    })),
  });
}
