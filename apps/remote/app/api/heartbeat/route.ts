// apps/remote/app/api/heartbeat/route.ts
import { runHeartbeat } from "../../../lib/api";
import { NextResponse } from "next/server";

export async function POST() {
  const result = await runHeartbeat();
  return NextResponse.json(result);
}
