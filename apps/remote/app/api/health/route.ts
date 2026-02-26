// apps/remote/app/api/health/route.ts
import { getHealth } from "../../../lib/api";
import { NextResponse } from "next/server";

export async function GET() {
  const result = await getHealth();
  return NextResponse.json(result);
}
