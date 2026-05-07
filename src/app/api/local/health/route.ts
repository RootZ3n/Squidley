import { NextResponse } from "next/server";
import { getLocalProviderConfig } from "@/lib/providers/local";
import { probeLocalHealth } from "@/lib/providers/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const payload = await probeLocalHealth({ config: getLocalProviderConfig() });
  return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
}
