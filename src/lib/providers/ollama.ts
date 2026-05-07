import type { LocalProviderConfig } from "./local";

export interface LocalModelInfo {
  name: string;
  displayName: string;
  size?: number;
  modifiedAt?: string;
}

export interface LocalHealthPayload {
  ok: boolean;
  provider: "local";
  endpoint: string;
  modelCount?: number;
  errorCode?: "local_provider_unreachable" | "local_provider_error";
  reason?: string;
  cloudUsed: false;
}

interface OllamaTag {
  name?: unknown;
  model?: unknown;
  size?: unknown;
  modified_at?: unknown;
}

interface OllamaTagsResponse {
  models?: unknown;
}

export function ollamaTagsUrl(config: LocalProviderConfig): string {
  return `${config.endpoint}/api/tags`;
}

export function normalizeOllamaModelName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return trimmed;
  const [base, tag] = trimmed.split(":", 2);
  if (!tag) return base;
  return `${base} ${tag}`;
}

export function normalizeOllamaTags(body: unknown): LocalModelInfo[] {
  const models = (body as OllamaTagsResponse | null)?.models;
  if (!Array.isArray(models)) return [];

  return models
    .map((raw): LocalModelInfo | null => {
      const tag = raw as OllamaTag;
      const rawName = typeof tag.name === "string"
        ? tag.name
        : typeof tag.model === "string"
          ? tag.model
          : "";
      const name = rawName.trim();
      if (name.length === 0) return null;

      return {
        name,
        displayName: normalizeOllamaModelName(name),
        ...(typeof tag.size === "number" && tag.size >= 0 ? { size: tag.size } : {}),
        ...(typeof tag.modified_at === "string" && tag.modified_at.trim().length > 0
          ? { modifiedAt: tag.modified_at }
          : {}),
      };
    })
    .filter((m): m is LocalModelInfo => m !== null);
}

export function chooseDefaultModel(args: {
  configuredModel: string;
  models: readonly LocalModelInfo[];
}): string {
  const configured = args.configuredModel.trim();
  const firstGenerative = args.models.find((model) => isLikelyGenerativeLocalModel(model.name));
  if (configured.length === 0) return firstGenerative?.name ?? args.models[0]?.name ?? "";
  const exact = args.models.find((m) => m.name === configured);
  if (exact) return exact.name;
  const variant = args.models.find((m) => m.name.startsWith(`${configured}:`));
  if (variant) return variant.name;
  return firstGenerative?.name ?? args.models[0]?.name ?? "";
}

export function isLikelyGenerativeLocalModel(modelName: string): boolean {
  const normalized = modelName.toLowerCase();
  return ![
    "all-minilm",
    "minilm",
    "nomic-embed",
    "embed",
    "embedding",
    "bge-",
    "e5-",
  ].some((pattern) => normalized.includes(pattern));
}

export async function probeLocalHealth(args: {
  config: LocalProviderConfig;
  fetchImpl?: typeof fetch;
}): Promise<LocalHealthPayload> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const endpoint = args.config.endpoint;

  let response: Response;
  try {
    response = await fetchImpl(ollamaTagsUrl(args.config), { method: "GET" });
  } catch {
    return {
      ok: false,
      provider: "local",
      endpoint,
      errorCode: "local_provider_unreachable",
      reason: `Squidley tried to reach your local model server at ${endpoint}, but it does not seem to be running.`,
      cloudUsed: false,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      provider: "local",
      endpoint,
      errorCode: "local_provider_error",
      reason: `Your local model server responded with HTTP ${response.status}.`,
      cloudUsed: false,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      provider: "local",
      endpoint,
      errorCode: "local_provider_error",
      reason: "Your local model server replied, but Squidley could not read the model list.",
      cloudUsed: false,
    };
  }

  return {
    ok: true,
    provider: "local",
    endpoint,
    modelCount: normalizeOllamaTags(body).length,
    cloudUsed: false,
  };
}
