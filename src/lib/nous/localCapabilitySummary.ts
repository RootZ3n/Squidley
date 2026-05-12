/**
 * Local capability readiness summary for Nous.
 *
 * Pure helper that turns local model snapshots into a beginner-friendly
 * readiness summary. No fetch, no provider calls, no cloud calls, no
 * localStorage writes.
 *
 * This is a conservative heuristic estimate based on installed model
 * names/metadata. It does not benchmark quality.
 */

import {
  inferLocalModelCapabilityProfiles,
  isLikelyCodeModel,
  isLikelyEmbeddingModel,
  isLikelyVisionModel,
  type LocalModelSnapshot,
} from "@/lib/capabilities/localReadiness";

export interface LocalCapabilitySummary {
  hasChat: boolean;
  hasCode: boolean;
  hasVision: boolean;
  hasEmbeddings: boolean;
  hasLongContext: boolean;
  hasToolUse: boolean;
  modelCount: number;
  chatModelCount: number;
  codeModelCount: number;
  visionModelCount: number;
  embeddingModelCount: number;
  longContextModelCount: number;
  beginnerSummaryLines: readonly string[];
}

export function summarizeLocalCapabilities(
  models: readonly LocalModelSnapshot[],
): LocalCapabilitySummary {
  let chatModelCount = 0;
  let codeModelCount = 0;
  let visionModelCount = 0;
  let embeddingModelCount = 0;
  let longContextModelCount = 0;

  for (const model of models) {
    const profiles = inferLocalModelCapabilityProfiles(model);
    const caps = new Set(profiles.map((p) => p.capabilityProfile));
    if (caps.has("chat")) chatModelCount++;
    if (caps.has("code")) codeModelCount++;
    if (caps.has("vision")) visionModelCount++;
    if (caps.has("embeddings")) embeddingModelCount++;
    if (caps.has("long-context")) longContextModelCount++;
  }

  const hasChat = chatModelCount > 0;
  const hasCode = codeModelCount > 0;
  const hasVision = visionModelCount > 0;
  const hasEmbeddings = embeddingModelCount > 0;
  const hasLongContext = longContextModelCount > 0;
  // tool-use is never assumed from local model metadata alone.
  const hasToolUse = false;

  const lines: string[] = [];

  if (models.length === 0) {
    lines.push("No local models detected. Install a model with Ollama (ollama pull llama3.2) or start llama-server with a GGUF model file.");
  } else {
    lines.push(
      hasChat
        ? `Chat: Available locally (${chatModelCount} model${chatModelCount !== 1 ? "s" : ""} detected)`
        : "Chat: Not detected locally",
    );
    lines.push(
      hasCode
        ? `Code help: Likely available locally (${codeModelCount} code model${codeModelCount !== 1 ? "s" : ""} detected)`
        : "Code help: Not detected among installed models",
    );
    lines.push(
      hasVision
        ? `Vision: Likely available locally (${visionModelCount} vision model${visionModelCount !== 1 ? "s" : ""} detected)`
        : "Vision: Not detected among installed models",
    );
    lines.push(
      hasEmbeddings
        ? `Embeddings: Available locally (${embeddingModelCount} embedding model${embeddingModelCount !== 1 ? "s" : ""} detected)`
        : "Embeddings: Not detected among installed models",
    );
    lines.push(
      hasLongContext
        ? `Long context: Available locally (${longContextModelCount} model${longContextModelCount !== 1 ? "s" : ""} detected)`
        : "Long context: Not detected",
    );
    lines.push("Tool-use: Not assumed locally");
  }

  return {
    hasChat,
    hasCode,
    hasVision,
    hasEmbeddings,
    hasLongContext,
    hasToolUse,
    modelCount: models.length,
    chatModelCount,
    codeModelCount,
    visionModelCount,
    embeddingModelCount,
    longContextModelCount,
    beginnerSummaryLines: lines,
  };
}
