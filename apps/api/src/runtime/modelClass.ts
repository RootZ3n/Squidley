// apps/api/src/runtime/modelClass.ts

export type ModelClass = "S" | "M" | "L" | "XL";

export type ClassifiedModel = {
  provider: string;
  model: string;
  model_class: ModelClass;
  param_b: number | null;
  source: "registry" | "parsed" | "provider-default";
};

// Simple thresholds (keep deterministic)
function classFromParams(param_b: number): ModelClass {
  if (param_b <= 4) return "S";
  if (param_b <= 14) return "M";
  if (param_b <= 35) return "L";
  return "XL";
}

// A tiny registry for known names (optional but reliable)
const MODEL_REGISTRY: Record<string, { param_b?: number; model_class?: ModelClass }> = {
  // Your known locals (examples)
  "qwen2.5:14b-instruct": { param_b: 14 },
  "qwen3-coder:30b": { param_b: 30 },
  "gpt-oss:20b": { param_b: 20 },
  "phi3:3.8b": { param_b: 3.8 },
  "phi4-mini-reasoning:3.8b": { param_b: 3.8 },
  "llama3.2:3b": { param_b: 3 },

  // Cloud-ish naming (force XL)
  "qwen-plus-us": { model_class: "XL" },
  "qwen-flash-us": { model_class: "XL" },
  "qwen-plus-2025-12-01-us": { model_class: "XL" }
};

function parseParamBFromModelName(model: string): number | null {
  // Try to catch ":14b", ":3.8b", "-30b", "_7b", etc.
  const m = model.toLowerCase().match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)\s*b(?:$|[^a-z0-9])/i);
  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function classifyModel(provider: string, model: string): ClassifiedModel {
  const p = String(provider ?? "").trim().toLowerCase();
  const m = String(model ?? "").trim();

  // 1) Provider-first: cloud providers are XL by default
  if (p && p !== "ollama") {
    // If you later add "openai"/"anthropic"/etc, they should all default XL.
    return {
      provider: p,
      model: m,
      model_class: "XL",
      param_b: null,
      source: "provider-default"
    };
  }

  // 2) Registry match
  const reg = MODEL_REGISTRY[m];
  if (reg?.model_class) {
    return { provider: p || "ollama", model: m, model_class: reg.model_class, param_b: reg.param_b ?? null, source: "registry" };
  }
  if (typeof reg?.param_b === "number") {
    return {
      provider: p || "ollama",
      model: m,
      model_class: classFromParams(reg.param_b),
      param_b: reg.param_b,
      source: "registry"
    };
  }

  // 3) Parse fallback for local model names
  const parsed = parseParamBFromModelName(m);
  if (typeof parsed === "number") {
    return {
      provider: p || "ollama",
      model: m,
      model_class: classFromParams(parsed),
      param_b: parsed,
      source: "parsed"
    };
  }

  // 4) Fail-safe default: treat unknown locals as S
  return {
    provider: p || "ollama",
    model: m,
    model_class: "S",
    param_b: null,
    source: "provider-default"
  };
}