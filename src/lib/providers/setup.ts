/**
 * Beginner-friendly local model setup guidance.
 *
 * Pure functions that produce OS-aware setup instructions and "verify
 * setup" check results. No I/O, no fetch, no side effects.
 *
 * These are text generators for the UI, not system commands.
 */

import type { DetectionResult, DetectedBackend } from "./detection";

export type OsHint = "macos" | "linux" | "windows" | "unknown";

export interface ProviderDescription {
  id: DetectedBackend;
  name: string;
  what: string;
  bestFor: string;
  defaultEndpoint: string;
  learnMoreUrl: string;
}

export const PROVIDER_DESCRIPTIONS: Record<DetectedBackend, ProviderDescription> = {
  ollama: {
    id: "ollama",
    name: "Ollama",
    what: "A desktop app that downloads and runs AI models locally. Easiest way to get started.",
    bestFor: "Beginners. One-command install, one-command model pull.",
    defaultEndpoint: "http://localhost:11434",
    learnMoreUrl: "https://ollama.com",
  },
  "llama-cpp": {
    id: "llama-cpp",
    name: "llama-server (llama.cpp)",
    what: "A lightweight inference server from the llama.cpp project. Peh supports its OpenAI-compatible local text API; real llama-server binary validation is still pending for this public release.",
    bestFor: "Users who want fine-grained control over model loading, quantization, and GPU layers.",
    defaultEndpoint: "http://localhost:8080",
    learnMoreUrl: "https://github.com/ggerganov/llama.cpp",
  },
};

export interface SetupInstruction {
  step: number;
  title: string;
  command?: string;
  detail: string;
}

export interface SetupGuide {
  provider: ProviderDescription;
  os: OsHint;
  steps: SetupInstruction[];
  verifyHint: string;
}

/**
 * Get OS-aware setup instructions for Ollama.
 */
export function getOllamaSetupGuide(os: OsHint): SetupGuide {
  const provider = PROVIDER_DESCRIPTIONS.ollama;
  const steps: SetupInstruction[] = [];

  if (os === "macos") {
    steps.push({
      step: 1,
      title: "Install Ollama",
      command: "brew install ollama",
      detail: "Or download from ollama.com. The installer adds Ollama to your menu bar.",
    });
  } else if (os === "linux") {
    steps.push({
      step: 1,
      title: "Install Ollama",
      command: "curl -fsSL https://ollama.com/install.sh | sh",
      detail: "This installs Ollama and starts it as a service.",
    });
  } else if (os === "windows") {
    steps.push({
      step: 1,
      title: "Install Ollama",
      detail: "Download the installer from ollama.com and run it. Ollama starts automatically.",
    });
  } else {
    steps.push({
      step: 1,
      title: "Install Ollama",
      detail: "Visit ollama.com for install instructions for your platform.",
    });
  }

  steps.push({
    step: 2,
    title: "Start Ollama (if not auto-started)",
    command: "ollama serve",
    detail: "On macOS it auto-starts from the menu bar. On Linux it runs as a service. You only need this if it didn't start automatically.",
  });

  steps.push({
    step: 3,
    title: "Pull a model",
    command: "ollama pull llama3.2",
    detail: "This downloads a small, capable chat model (~2GB). Good starting point for local chat.",
  });

  steps.push({
    step: 4,
    title: "Verify it works",
    command: "ollama list",
    detail: "You should see llama3.2 (or your chosen model) in the list. Then refresh Peh.",
  });

  return {
    provider,
    os,
    steps,
    verifyHint: "After setup, Peh will auto-detect Ollama and show your models.",
  };
}

/**
 * Get OS-aware setup instructions for llama-server.
 */
export function getLlamaCppSetupGuide(os: OsHint): SetupGuide {
  const provider = PROVIDER_DESCRIPTIONS["llama-cpp"];
  const steps: SetupInstruction[] = [];

  if (os === "macos") {
    steps.push({
      step: 1,
      title: "Install llama.cpp",
      command: "brew install llama.cpp",
      detail: "Or build from source: git clone https://github.com/ggerganov/llama.cpp && cd llama.cpp && make",
    });
  } else if (os === "linux") {
    steps.push({
      step: 1,
      title: "Build llama.cpp",
      command: "git clone https://github.com/ggerganov/llama.cpp && cd llama.cpp && make",
      detail: "For GPU support, use make GGML_CUDA=1 (NVIDIA) or make GGML_METAL=1 (Apple Silicon via Linux).",
    });
  } else {
    steps.push({
      step: 1,
      title: "Get llama.cpp",
      detail: "Download a release from github.com/ggerganov/llama.cpp/releases or build from source.",
    });
  }

  steps.push({
    step: 2,
    title: "Download a GGUF model",
    detail: "Get a GGUF model file from huggingface.co. For beginners, try a Q4_K_M quantization of Llama 3.2 3B or Qwen 2.5 3B. Smaller quantizations use less RAM.",
  });

  steps.push({
    step: 3,
    title: "Start llama-server",
    command: "llama-server -m your-model.gguf --port 8080",
    detail: "This starts an OpenAI-compatible API at http://localhost:8080. Add -ngl 99 to offload layers to GPU.",
  });

  steps.push({
    step: 4,
    title: "Tell Peh to use llama-server",
    detail: "Set PEH_LOCAL_BACKEND=llama-cpp and PEH_LOCAL_ENDPOINT=http://localhost:8080 in your .env.local file, then restart Peh.",
  });

  steps.push({
    step: 5,
    title: "Verify it works",
    command: "curl http://localhost:8080/health",
    detail: 'You should see {"status":"ok"} or similar. Then refresh Peh.',
  });

  return {
    provider,
    os,
    steps,
    verifyHint: "After setup, run npm run smoke:llama-server. If it passes, set PEH_LOCAL_BACKEND=llama-cpp in .env.local. Peh will detect the server and show your model.",
  };
}

// ---------------------------------------------------------------------------
// Model recommendations
// ---------------------------------------------------------------------------

export interface ModelRecommendation {
  name: string;
  size: string;
  good: string;
  limitations: string;
}

export const RECOMMENDED_MODELS: readonly ModelRecommendation[] = [
  {
    name: "llama3.2 (3B)",
    size: "~2GB",
    good: "Basic chat, simple questions, light code help",
    limitations: "Weak at complex reasoning, multi-step planning, and long context. May hallucinate on factual questions.",
  },
  {
    name: "qwen2.5 (3B)",
    size: "~2GB",
    good: "Chat, basic code, multilingual",
    limitations: "Same small-model limits. Better at code than llama3.2 at same size.",
  },
  {
    name: "deepseek-coder (6.7B)",
    size: "~4GB",
    good: "Code generation, code review, single-file editing",
    limitations: "Code-focused. General chat quality is lower than general-purpose models of the same size.",
  },
  {
    name: "llava (7B)",
    size: "~5GB",
    good: "Describing images, basic vision tasks",
    limitations: "Vision quality is limited. May miss details or describe images vaguely. Needs Ollama.",
  },
];

// ---------------------------------------------------------------------------
// Verify setup result
// ---------------------------------------------------------------------------

export interface VerifySetupResult {
  serverReachable: boolean;
  detectedBackend: DetectedBackend | null;
  modelsAvailable: boolean;
  modelCount: number;
  summary: string;
  suggestions: string[];
}

/**
 * Build a beginner-friendly verification summary from detection results.
 */
export function buildVerifySetupResult(detection: DetectionResult): VerifySetupResult {
  const suggestions: string[] = [];

  if (!detection.detected) {
    suggestions.push(
      "Install Ollama (easiest): visit ollama.com, then run `ollama pull llama3.2`.",
    );
    suggestions.push(
      "Or install llama.cpp and start llama-server with a GGUF model file.",
    );
    return {
      serverReachable: false,
      detectedBackend: null,
      modelsAvailable: false,
      modelCount: 0,
      summary: "No local model server found.",
      suggestions,
    };
  }

  const modelCount =
    detection.ollamaHealth?.modelCount ??
    detection.llamaCppHealth?.modelCount ??
    0;

  if (modelCount === 0) {
    if (detection.detected === "ollama") {
      suggestions.push(
        "Run `ollama pull llama3.2` to download a starter model.",
      );
    } else {
      suggestions.push(
        "Start llama-server with a GGUF model file: `llama-server -m model.gguf`",
      );
    }
    return {
      serverReachable: true,
      detectedBackend: detection.detected,
      modelsAvailable: false,
      modelCount: 0,
      summary: `${detection.detected === "ollama" ? "Ollama" : "llama-server"} is running, but no models are loaded.`,
      suggestions,
    };
  }

  return {
    serverReachable: true,
    detectedBackend: detection.detected,
    modelsAvailable: true,
    modelCount,
    summary: `${detection.detected === "ollama" ? "Ollama" : "llama-server"} is running with ${modelCount} model${modelCount === 1 ? "" : "s"}.`,
    suggestions,
  };
}
