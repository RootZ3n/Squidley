import type { LocalModelInfo } from "@/lib/providers/ollama";

export const OCULUS_ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const OCULUS_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const VISION_MODEL_HINTS = [
  "llava",
  "bakllava",
  "minicpm-v",
  "minicpmv",
  "vision",
  "moondream",
  "gemma3",
  "qwen3-vl",
  "qwen3vl",
  "qwen2-vl",
  "qwen2.5vl",
  "qwen-vl",
];

export function isAcceptedVisionImageType(type: string): boolean {
  return OCULUS_ACCEPTED_IMAGE_TYPES.includes(type as (typeof OCULUS_ACCEPTED_IMAGE_TYPES)[number]);
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isLikelyVisionModel(modelName: string): boolean {
  const normalized = modelName.toLowerCase().replace(/[\s_:.-]+/g, "");
  return VISION_MODEL_HINTS.some((hint) => normalized.includes(hint.replace(/[\s_:.-]+/g, "")));
}

export function chooseVisionModel(args: {
  selectedModel?: string;
  configuredModel?: string;
  models: readonly LocalModelInfo[];
}): string {
  const candidates = [
    args.selectedModel,
    args.configuredModel,
    ...args.models.map((model) => model.name),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return candidates.find(isLikelyVisionModel) ?? candidates[0] ?? "";
}

export function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
