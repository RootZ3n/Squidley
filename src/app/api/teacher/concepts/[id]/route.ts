/**
 * GET /api/teacher/concepts/:id — get a single concept by ID.
 * Read-only, local-only. Never calls cloud.
 */

import { NextResponse } from "next/server";
import { getConceptById } from "@/lib/teacher/concepts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const concept = getConceptById(params.id);
  if (!concept) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: `Concept "${params.id}" not found.` } },
      { status: 404 },
    );
  }
  return NextResponse.json({
    ok: true,
    provider: "local",
    cloudUsed: false,
    concept,
  });
}
