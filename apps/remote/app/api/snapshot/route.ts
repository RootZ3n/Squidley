// apps/remote/app/api/snapshot/route.ts
import { getSnapshot } from "../../../lib/api";
import { NextResponse } from "next/server";

export async function GET() {
  const result = await getSnapshot();
  return NextResponse.json(result);
}
