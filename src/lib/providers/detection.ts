/**
 * Local provider auto-detection.
 *
 * When PEH_LOCAL_BACKEND is "auto" (or unset), Peh probes both
 * Ollama and llama-server endpoints to figure out which one is running.
 *
 * Detection order:
 *   1. If backend is explicitly set, use that.
 *   2. Probe Ollama endpoint first (most common for beginners).
 *   3. If Ollama fails, probe llama-server.
 *   4. If both fail, report both as unavailable.
 *
 * Hard constraints:
 *   - No cloud calls. Local probes only.
 *   - Beginner-friendly error messages.
 *   - Pure result type — no side effects.
 */

import type { LocalProviderConfig } from "./local";
import type { LocalHealthPayload } from "./ollama";
import { probeLocalHealth as probeOllamaHealth } from "./ollama";
import {
  probeLlamaCppHealth,
  type LlamaCppHealthPayload,
} from "./llamacpp";

export type DetectedBackend = "ollama" | "llama-cpp";

export interface DetectionResult {
  detected: DetectedBackend | null;
  ollamaAvailable: boolean;
  llamaCppAvailable: boolean;
  ollamaHealth?: LocalHealthPayload;
  llamaCppHealth?: LlamaCppHealthPayload;
  message: string;
}

/**
 * Detect which local backend is available. If the config specifies a
 * backend explicitly, only that one is probed.
 */
export async function detectLocalBackend(args: {
  config: LocalProviderConfig;
  /** Optional separate endpoint for llama-cpp when auto-detecting with
   *  different ports. Defaults to config.endpoint. */
  llamaCppEndpoint?: string;
  fetchImpl?: typeof fetch;
}): Promise<DetectionResult> {
  const { config, fetchImpl } = args;

  if (config.backendType === "ollama") {
    const health = await probeOllamaHealth({ config, fetchImpl });
    return {
      detected: health.ok ? "ollama" : null,
      ollamaAvailable: health.ok,
      llamaCppAvailable: false,
      ollamaHealth: health,
      message: health.ok
        ? "Ollama is running and ready."
        : health.reason ?? "Ollama is not reachable.",
    };
  }

  if (config.backendType === "llama-cpp") {
    const health = await probeLlamaCppHealth({ config, fetchImpl });
    return {
      detected: health.ok ? "llama-cpp" : null,
      ollamaAvailable: false,
      llamaCppAvailable: health.ok,
      llamaCppHealth: health,
      message: health.ok
        ? "OpenAI-compatible local backend detected."
        : health.reason ?? "llama-server is not reachable.",
    };
  }

  // Auto-detect: probe Ollama first, then llama-cpp
  const ollamaHealth = await probeOllamaHealth({ config, fetchImpl });
  if (ollamaHealth.ok) {
    return {
      detected: "ollama",
      ollamaAvailable: true,
      llamaCppAvailable: false,
      ollamaHealth,
      message: "Ollama detected and ready.",
    };
  }

  // Try llama-cpp at the same endpoint (user may have llama-server on :11434)
  const llamaCppHealth = await probeLlamaCppHealth({ config, fetchImpl });
  if (llamaCppHealth.ok) {
    return {
      detected: "llama-cpp",
      ollamaAvailable: false,
      llamaCppAvailable: true,
      llamaCppHealth,
      message: "OpenAI-compatible local backend detected.",
    };
  }

  // If a separate llama-cpp endpoint was given, try that too
  if (args.llamaCppEndpoint && args.llamaCppEndpoint !== config.endpoint) {
    const altConfig = { ...config, endpoint: args.llamaCppEndpoint };
    const altHealth = await probeLlamaCppHealth({
      config: altConfig,
      fetchImpl,
    });
    if (altHealth.ok) {
      return {
        detected: "llama-cpp",
        ollamaAvailable: false,
        llamaCppAvailable: true,
        llamaCppHealth: altHealth,
        message: `llama-server detected at ${args.llamaCppEndpoint}.`,
      };
    }
  }

  return {
    detected: null,
    ollamaAvailable: false,
    llamaCppAvailable: false,
    ollamaHealth,
    llamaCppHealth,
    message:
      "No local model server found. Peh needs either Ollama or llama-server running locally.",
  };
}
