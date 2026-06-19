import { NextResponse } from "next/server";
import { getLocalProviderConfig } from "@/lib/providers/local";
import { probeLocalHealth } from "@/lib/providers/ollama";
import { probeLlamaCppHealth } from "@/lib/providers/llamacpp";
import { detectLocalBackend } from "@/lib/providers/detection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = getLocalProviderConfig();

  if (config.backendType === "llama-cpp") {
    const payload = await probeLlamaCppHealth({ config });
    return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
  }

  if (config.backendType === "ollama") {
    const payload = await probeLocalHealth({ config });
    return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
  }

  // Auto-detect
  const detection = await detectLocalBackend({ config });
  if (detection.detected === "llama-cpp" && detection.llamaCppHealth) {
    return NextResponse.json(detection.llamaCppHealth, {
      status: detection.llamaCppHealth.ok ? 200 : 503,
    });
  }
  if (detection.ollamaHealth) {
    return NextResponse.json(detection.ollamaHealth, {
      status: detection.ollamaHealth.ok ? 200 : 503,
    });
  }

  // Neither available
  return NextResponse.json(
    {
      ok: false,
      provider: "local",
      endpoint: config.endpoint,
      errorCode: "local_provider_unreachable",
      reason: detection.message,
      cloudUsed: false,
    },
    { status: 503 },
  );
}
