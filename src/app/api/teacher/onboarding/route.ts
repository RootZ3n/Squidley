/**
 * GET /api/teacher/onboarding — list onboarding stages.
 * Read-only, local-only. Never calls cloud.
 */

import { NextResponse } from "next/server";
import { ONBOARDING_STAGES, getStagesInOrder } from "@/lib/teacher/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ordered = getStagesInOrder();
  return NextResponse.json({
    ok: true,
    provider: "local",
    cloudUsed: false,
    count: ONBOARDING_STAGES.length,
    stages: ordered.map((s) => ({
      id: s.id,
      title: s.title,
      objective: s.objective,
      requiredConcepts: s.requiredConcepts,
      userAction: s.userAction,
      squidleyExplanation: s.squidleyExplanation,
      completionCriteria: s.completionCriteria,
      nextStage: s.nextStage,
    })),
  });
}
