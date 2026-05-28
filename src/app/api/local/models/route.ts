import { NextResponse } from "next/server";
import { getLocalProviderConfig } from "@/lib/providers/local";
import {
  chooseDefaultModel,
  normalizeOllamaTags,
  ollamaTagsUrl,
} from "@/lib/providers/ollama";
import {
  llamaCppModelsUrl,
  normalizeLlamaCppModels,
} from "@/lib/providers/llamacpp";
import { detectLocalBackend } from "@/lib/providers/detection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = getLocalProviderConfig();

  // Resolve backend type
  let backend: "ollama" | "llama-cpp" = "ollama";
  if (config.backendType === "llama-cpp") {
    backend = "llama-cpp";
  } else if (config.backendType === "auto") {
    const detection = await detectLocalBackend({ config });
    if (detection.detected) {
      backend = detection.detected;
    }
  }

  if (backend === "llama-cpp") {
    return fetchLlamaCppModels(config);
  }
  return fetchOllamaModels(config);
}

async function fetchOllamaModels(
  config: ReturnType<typeof getLocalProviderConfig>,
): Promise<Response> {
  try {
    const response = await fetch(ollamaTagsUrl(config));
    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          provider: "local",
          backendType: "ollama",
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
          backendType: "ollama",
          endpoint: config.endpoint,
          models: [],
          defaultModel: "",
          cloudUsed: false,
          errorCode: "local_provider_error",
          reason: "Your local model server replied, but Peh could not read the model list.",
        },
        { status: 502 },
      );
    }

    const models = normalizeOllamaTags(body);
    return NextResponse.json({
      ok: true,
      provider: "local",
      backendType: "ollama",
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
        backendType: "ollama",
        endpoint: config.endpoint,
        models: [],
        defaultModel: "",
        configuredModel: config.model,
        cloudUsed: false,
        errorCode: "local_provider_unreachable",
        reason: `Peh tried to reach your local model server at ${config.endpoint}, but it does not seem to be running.`,
      },
      { status: 503 },
    );
  }
}

async function fetchLlamaCppModels(
  config: ReturnType<typeof getLocalProviderConfig>,
): Promise<Response> {
  try {
    const response = await fetch(llamaCppModelsUrl(config));
    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          provider: "local",
          backendType: "llama-cpp",
          endpoint: config.endpoint,
          models: [],
          defaultModel: "",
          configuredModel: config.model,
          cloudUsed: false,
          errorCode: "local_provider_error",
          reason: `Your llama-server responded with HTTP ${response.status}.`,
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
          backendType: "llama-cpp",
          endpoint: config.endpoint,
          models: [],
          defaultModel: "",
          cloudUsed: false,
          errorCode: "local_provider_error",
          reason: "Your llama-server replied, but Peh could not read the model list.",
        },
        { status: 502 },
      );
    }

    const models = normalizeLlamaCppModels(body);
    const defaultModel = models.length > 0 ? models[0].name : "";
    return NextResponse.json({
      ok: true,
      provider: "local",
      backendType: "llama-cpp",
      endpoint: config.endpoint,
      models,
      defaultModel,
      configuredModel: config.model,
      empty: models.length === 0,
      reason:
        models.length === 0
          ? "Your llama-server is running, but no models were found. Start llama-server with a model file: `llama-server -m model.gguf`."
          : undefined,
      cloudUsed: false,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        provider: "local",
        backendType: "llama-cpp",
        endpoint: config.endpoint,
        models: [],
        defaultModel: "",
        configuredModel: config.model,
        cloudUsed: false,
        errorCode: "local_provider_unreachable",
        reason: `Peh tried to reach llama-server at ${config.endpoint}, but it does not seem to be running.`,
      },
      { status: 503 },
    );
  }
}
