/**
 * /api/chat — local-only chat proxy.
 *
 * Thin wrapper. All real logic lives in `src/lib/chat/handler.ts` so it can
 * be unit-tested without spinning up Next. This file exists only to expose
 * the handler over HTTP and to read the local provider config from the
 * server's process environment.
 *
 * Important: this route never contacts anything other than the configured
 * local endpoint. There is no cloud fallback by design.
 */

import { NextResponse } from "next/server";
import { handleChatRequest } from "@/lib/chat/handler";
import { getLocalProviderConfig } from "@/lib/providers/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const config = getLocalProviderConfig();
  const result = await handleChatRequest({ body, config });

  return NextResponse.json(result.payload, { status: result.status });
}
