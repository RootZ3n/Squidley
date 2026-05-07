import { NextResponse } from "next/server";
import { getLocalProviderConfig } from "@/lib/providers/local";
import {
  chooseDefaultModel,
  normalizeOllamaTags,
  ollamaTagsUrl,
} from "@/lib/providers/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = getLocalProviderConfig();

  try {
    const response = await fetch(ollamaTagsUrl(config));
    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          provider: "local",
          endpoint: config.endpoint,
          models: [],
          defaultModel: "",
          configuredModel: config.model,
          cloudUsed: false,
          errorCode: "local_provider_error",
          reason: `Your local model server responded with HTTP ${response.status}.`,
        },
        { status: 502 },
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          provider: "local",
          endpoint: config.endpoint,
          models: [],
          defaultModel: "",
          cloudUsed: false,
          errorCode: "local_provider_error",
          reason: "Your local model server replied, but Squidley could not read the model list.",
        },
        { status: 502 },
      );
    }

    const models = normalizeOllamaTags(body);
    return NextResponse.json({
      ok: true,
      provider: "local",
      endpoint: config.endpoint,
      models,
      defaultModel: chooseDefaultModel({ configuredModel: config.model, models }),
      configuredModel: config.model,
      empty: models.length === 0,
      reason:
        models.length === 0
          ? `Your local model server is running, but no models are installed yet. Try \`ollama pull ${config.model}\`, then refresh models.`
          : undefined,
      cloudUsed: false,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        provider: "local",
        endpoint: config.endpoint,
        models: [],
        defaultModel: "",
        configuredModel: config.model,
        cloudUsed: false,
        errorCode: "local_provider_unreachable",
        reason: `Squidley tried to reach your local model server at ${config.endpoint}, but it does not seem to be running.`,
      },
      { status: 503 },
    );
  }
}
