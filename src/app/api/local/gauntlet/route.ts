import { NextResponse } from "next/server";
import { readLocalGauntletReportIndex } from "@/lib/localGauntlet/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const index = await readLocalGauntletReportIndex();
  return NextResponse.json({
    ok: true,
    provider: "local",
    cloudUsed: false,
    ...index,
  });
}
