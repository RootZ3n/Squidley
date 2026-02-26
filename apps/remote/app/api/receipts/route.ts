// apps/remote/app/api/receipts/route.ts
import { getReceipts } from "../../../lib/api";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "15");
  const result = await getReceipts(limit);
  return NextResponse.json(result);
}
