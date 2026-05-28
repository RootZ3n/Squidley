import {
  inferParamsB,
  isLikelyCodeModel,
  isLikelyEmbeddingModel,
  isLikelyVisionModel,
  type LocalModelSnapshot,
} from "@/lib/capabilities/localReadiness";

export type LocalModelBackend = "ollama" | "llama-cpp" | "unknown";

export type LocalTaskId =
  | "chat.basic"
  | "chat.summarize"
  | "chat.advanced-planning"
  | "fabrica.single-file-code"
  | "fabrica.multi-file-build"
  | "oculus.image-analysis"
  | "archivum.local-storage"
  | "velum.deterministic-review"
  | "tabularium.local-receipts"
  | "agent.tool-use";

export type LocalTaskSuitabilityStatus =
  | "no-model-needed"
  | "can-do-locally"
  | "try-locally-verify"
  | "needs-stronger-local-model"
  | "needs-cloud-unlock"
  | "blocked";

export interface LocalTaskSuitability {
  taskId: LocalTaskId;
  status: LocalTaskSuitabilityStatus;
  confidence: "low" | "medium" | "high";
  beginnerLabel: string;
  beginnerMessage: string;
  minimumLocalModel?: string;
}

const NO_MODEL_TASKS = new Set<LocalTaskId>([
  "archivum.local-storage",
  "velum.deterministic-review",
  "tabularium.local-receipts",
]);

export const LOCAL_TASKS: readonly LocalTaskId[] = [
  "chat.basic",
  "chat.summarize",
  "chat.advanced-planning",
  "fabrica.single-file-code",
  "fabrica.multi-file-build",
  "oculus.image-analysis",
  "archivum.local-storage",
  "velum.deterministic-review",
  "tabularium.local-receipts",
  "agent.tool-use",
];

export function evaluateLocalModelForTask(args: {
  model?: LocalModelSnapshot | null;
  taskId: LocalTaskId;
  backend?: LocalModelBackend;
}): LocalTaskSuitability {
  const backend = args.backend ?? "unknown";
  const taskId = args.taskId;

  if (NO_MODEL_TASKS.has(taskId)) {
    return decision(taskId, "no-model-needed", "high", "Works without a model", "This task is deterministic or browser-local. No local model and no cloud provider are needed.");
  }

  if (taskId === "fabrica.multi-file-build" || taskId === "agent.tool-use") {
    return decision(taskId, "needs-cloud-unlock", "high", "Cloud/tool mode required", "Peh does not run autonomous tools or multi-file repo agents locally. Keep this locked unless a future cloud/tool mode is explicitly enabled.");
  }

  const model = args.model;
  if (!model) {
    return decision(taskId, "blocked", "high", "No local model selected", "Install or start a local model first. Peh will not fall back to the cloud.");
  }

  if (isLikelyEmbeddingModel(model)) {
    return decision(taskId, "blocked", "high", "Embedding model only", "This model is for embeddings/search metadata, not chat, code, planning, or vision.");
  }

  const paramsB = inferParamsB(model);
  const params = paramsB ?? 0;
  const code = isLikelyCodeModel(model);
  const vision = isLikelyVisionModel(model);

  if (taskId === "oculus.image-analysis") {
    if (backend === "llama-cpp") {
      return decision(taskId, "blocked", "high", "llama.cpp vision not validated", "Peh blocks llama.cpp vision until real local vision support is validated. Use an Ollama vision model such as LLaVA, Moondream, MiniCPM-V, or Qwen-VL.");
    }
    if (vision) {
      return decision(taskId, "try-locally-verify", "medium", "Try local vision, verify", "This looks like a local vision model. Image analysis can run locally, but small vision models may miss details.");
    }
    return decision(taskId, "blocked", "high", "Not a vision model", "Choose a local vision model before using Oculus.");
  }

  if (taskId === "fabrica.single-file-code") {
    if (!code) {
      return decision(taskId, "needs-stronger-local-model", "medium", "Use a code model", "This model does not look code-specialized. Try a local code model before trusting code suggestions.", "7B+ code model; 30B+ preferred");
    }
    if (paramsB !== undefined && params < 7) {
      return decision(taskId, "try-locally-verify", "medium", "Tiny code model", "This code model may handle tiny snippets, but every suggestion needs review.", "7B+ code model; 30B+ preferred");
    }
    if (paramsB !== undefined && params >= 30) {
      return decision(taskId, "can-do-locally", "medium", "Good local code candidate", "This looks like a strong local code model for reviewed single-file suggestions. It is still not an autonomous repo editor.");
    }
    return decision(taskId, "try-locally-verify", "medium", "Review local code output", "This local code model can be tried for single-file suggestions, but the user should review before applying.", "30B+ code model preferred");
  }

  if (taskId === "chat.advanced-planning") {
    if (paramsB === undefined) {
      return decision(taskId, "try-locally-verify", "low", "Unknown model size", "Peh cannot infer this model's size, so advanced planning should be treated as experimental and verified.", "7B+ general model; 14B+ preferred");
    }
    if (params < 7) {
      return decision(taskId, "needs-stronger-local-model", "high", "Too small for planning", "Small local models are fine for simple chat, but they are not reliable for multi-step planning.", "7B+ general model; 14B+ preferred");
    }
    return decision(taskId, "try-locally-verify", "medium", "Plan locally, verify", "This model can try local planning, but plans should be reviewed before acting.", "14B+ preferred");
  }

  if (taskId === "chat.summarize") {
    if (paramsB !== undefined && params < 1) {
      return decision(taskId, "try-locally-verify", "medium", "Tiny summaries need review", "This tiny model may summarize short notes, but it can miss or distort facts.", "7B+ preferred for reliable summaries");
    }
    if (paramsB !== undefined && params >= 7) {
      return decision(taskId, "can-do-locally", "medium", "Good local summary candidate", "This model is a reasonable local choice for normal summaries. Verify important facts.");
    }
    return decision(taskId, "try-locally-verify", "medium", "Summarize locally, verify", "This local model can try short summaries, but important facts need review.", "7B+ preferred");
  }

  // chat.basic
  if (paramsB !== undefined && params < 1) {
    return decision(taskId, "try-locally-verify", "medium", "Tiny chat model", "This model can answer simple prompts locally, but replies may be shallow or wrong.");
  }
  return decision(taskId, "can-do-locally", paramsB === undefined ? "low" : "medium", "Local chat ready", "This model can be used for basic local chat. Verify important information.");
}

export function summarizeModelSuitability(args: {
  model: LocalModelSnapshot;
  backend?: LocalModelBackend;
}): LocalTaskSuitability[] {
  return LOCAL_TASKS.map((taskId) => evaluateLocalModelForTask({ model: args.model, backend: args.backend, taskId }));
}

function decision(
  taskId: LocalTaskId,
  status: LocalTaskSuitabilityStatus,
  confidence: LocalTaskSuitability["confidence"],
  beginnerLabel: string,
  beginnerMessage: string,
  minimumLocalModel?: string,
): LocalTaskSuitability {
  return {
    taskId,
    status,
    confidence,
    beginnerLabel,
    beginnerMessage,
    ...(minimumLocalModel ? { minimumLocalModel } : {}),
  };
}
