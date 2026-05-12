import type { LocalModelInfo } from "./ollama";
import { chooseDefaultModel } from "./ollama";

export type LocalHealthStatus = "checking" | "ready" | "unavailable";

export type ModelReadinessKind =
  | "checking"
  | "refreshing"
  | "streaming"
  | "server-unavailable"
  | "no-models"
  | "selected-model-missing"
  | "ready";

export interface ModelReadiness {
  kind: ModelReadinessKind;
  canSend: boolean;
  message: string;
}

export function resolveModelSelection(args: {
  models: readonly LocalModelInfo[];
  currentModel: string;
  preferredModel: string;
}): { selectedModel: string; note?: string } {
  const current = args.currentModel.trim();
  const preferred = args.preferredModel.trim();

  if (current.length > 0 && args.models.some((m) => m.name === current)) {
    return { selectedModel: current };
  }

  const fallback = chooseDefaultModel({
    configuredModel: preferred,
    models: args.models,
  });

  if (fallback.length === 0) {
    return current.length > 0
      ? {
          selectedModel: "",
          note: `The selected model "${current}" is no longer available.`,
        }
      : { selectedModel: "" };
  }

  if (current.length > 0 && current !== fallback) {
    return {
      selectedModel: fallback,
      note: `The selected model "${current}" is no longer available, so Squidley selected "${fallback}".`,
    };
  }

  return { selectedModel: fallback };
}

export function getModelReadiness(args: {
  healthStatus: LocalHealthStatus;
  models: readonly LocalModelInfo[];
  selectedModel: string;
  refreshInProgress: boolean;
  streamingInProgress: boolean;
}): ModelReadiness {
  if (args.streamingInProgress) {
    return {
      kind: "streaming",
      canSend: false,
      message: "Squidley is streaming a local reply.",
    };
  }

  if (args.refreshInProgress) {
    return {
      kind: "refreshing",
      canSend: false,
      message: "Squidley is refreshing local models.",
    };
  }

  if (args.healthStatus === "checking") {
    return {
      kind: "checking",
      canSend: false,
      message: "Squidley is checking your local model server.",
    };
  }

  if (args.healthStatus === "unavailable") {
    return {
      kind: "server-unavailable",
      canSend: false,
      message: "Your local model server is not reachable yet.",
    };
  }

  if (args.models.length === 0) {
    return {
      kind: "no-models",
      canSend: false,
      message: "Your local model server is running, but no models are loaded. For Ollama: `ollama pull llama3.2`. For llama-server: start it with a GGUF model file.",
    };
  }

  if (!args.models.some((m) => m.name === args.selectedModel)) {
    return {
      kind: "selected-model-missing",
      canSend: false,
      message: `The selected model "${args.selectedModel || "llama3.2"}" is not available locally. For Ollama: \`ollama pull ${args.selectedModel || "llama3.2"}\`. For llama-server: start with the correct model file.`,
    };
  }

  return {
    kind: "ready",
    canSend: true,
    message: "Local model ready.",
  };
}
