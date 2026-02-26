// apps/remote/app/api/autonomy/run/route.ts
import { runAutonomy } from "../../../../lib/api";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await runAutonomy(body);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? "bad request") }, { status: 400 });
  }
}
