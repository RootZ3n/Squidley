/**
 * Tests for llama-cpp models integrated with the capability readiness system.
 *
 * Verifies that models discovered via llama-server are correctly classified
 * and satisfy capability requirements, just like Ollama-discovered models.
 */
import { describe, expect, it } from "vitest";
import {
  buildLocalCapabilityRuntimeContext,
  inferLocalModelCapabilityProfiles,
  inferParamsB,
  isLikelyCodeModel,
  isLikelyEmbeddingModel,
  isLikelyVisionModel,
  type LocalModelSnapshot,
} from "./localReadiness";
import { resolveCapabilityRuntimeForId } from "./runtime";

// llama-server model names are typically file-based or path-based
const LLAMACPP_CHAT: LocalModelSnapshot = { name: "llama-3.2-3b-q4_k_m.gguf" };
const LLAMACPP_CODE: LocalModelSnapshot = { name: "deepseek-coder-6.7b-q4_k_m.gguf" };
const LLAMACPP_VISION: LocalModelSnapshot = { name: "llava-v1.6-7b-q4_k_m.gguf" };
const LLAMACPP_LARGE: LocalModelSnapshot = { name: "qwen2.5-14b-q4_k_m.gguf" };
const LLAMACPP_CLEAN: LocalModelSnapshot = { name: "llama-3.2-3b" }; // no extension

describe("llama-cpp model classification", () => {
  it("classifies llama-cpp chat models correctly", () => {
    expect(isLikelyEmbeddingModel(LLAMACPP_CHAT)).toBe(false);
    expect(isLikelyCodeModel(LLAMACPP_CHAT)).toBe(false);
    expect(isLikelyVisionModel(LLAMACPP_CHAT)).toBe(false);
  });

  it("classifies llama-cpp code models correctly", () => {
    expect(isLikelyCodeModel(LLAMACPP_CODE)).toBe(true);
    expect(isLikelyEmbeddingModel(LLAMACPP_CODE)).toBe(false);
  });

  it("classifies llama-cpp vision models correctly", () => {
    expect(isLikelyVisionModel(LLAMACPP_VISION)).toBe(true);
    expect(isLikelyEmbeddingModel(LLAMACPP_VISION)).toBe(false);
  });

  it("infers parameter sizes from llama-cpp naming conventions", () => {
    expect(inferParamsB(LLAMACPP_CHAT)).toBe(3);
    expect(inferParamsB(LLAMACPP_CODE)).toBe(6.7);
    expect(inferParamsB(LLAMACPP_VISION)).toBe(7);
    expect(inferParamsB(LLAMACPP_LARGE)).toBe(14);
  });
});

describe("llama-cpp models produce correct capability profiles", () => {
  it("uses 'ollama' as providerId by default (capability registry compat)", () => {
    const profiles = inferLocalModelCapabilityProfiles(LLAMACPP_CHAT);
    expect(profiles[0].providerId).toBe("ollama");
  });

  it("maps a llama-cpp chat model to chat profile with paramsB", () => {
    const profiles = inferLocalModelCapabilityProfiles(LLAMACPP_CHAT);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].capabilityProfile).toBe("chat");
    expect(profiles[0].paramsB).toBe(3);
  });

  it("maps a llama-cpp code model to both chat and code profiles", () => {
    const profiles = inferLocalModelCapabilityProfiles(LLAMACPP_CODE);
    const caps = profiles.map((p) => p.capabilityProfile);
    expect(caps).toContain("chat");
    expect(caps).toContain("code");
  });

  it("maps a llama-cpp vision model to both chat and vision profiles", () => {
    const profiles = inferLocalModelCapabilityProfiles(LLAMACPP_VISION);
    const caps = profiles.map((p) => p.capabilityProfile);
    expect(caps).toContain("chat");
    expect(caps).toContain("vision");
  });
});

describe("llama-cpp models satisfy capability requirements", () => {
  it("resolves colloquium:chat.basic as LOCAL_READY with llama-cpp chat model", () => {
    const ctx = buildLocalCapabilityRuntimeContext([LLAMACPP_CHAT]);
    const decision = resolveCapabilityRuntimeForId("colloquium:chat.basic", ctx);
    expect(decision.state).toBe("LOCAL_READY");
    expect(decision.canAttemptLocally).toBe(true);
    expect(decision.canUseCloud).toBe(false);
  });

  it("resolves fabrica:fabrica.single-file-suggestion as LOCAL_READY with code model", () => {
    const ctx = buildLocalCapabilityRuntimeContext([LLAMACPP_CODE]);
    const decision = resolveCapabilityRuntimeForId("fabrica:fabrica.single-file-suggestion", ctx);
    expect(decision.state).toBe("LOCAL_READY");
    expect(decision.canAttemptLocally).toBe(true);
  });

  it("resolves oculus:oculus.local-image-analysis as LOCAL_LIMITED with vision model", () => {
    const ctx = buildLocalCapabilityRuntimeContext([LLAMACPP_VISION]);
    const decision = resolveCapabilityRuntimeForId("oculus:oculus.local-image-analysis", ctx);
    expect(decision.state).toBe("LOCAL_LIMITED");
    expect(decision.canAttemptLocally).toBe(true);
  });

  it("resolves chat.advanced-planning as LOCAL_LIMITED with 14B model", () => {
    const ctx = buildLocalCapabilityRuntimeContext([LLAMACPP_LARGE]);
    const decision = resolveCapabilityRuntimeForId("colloquium:chat.advanced-planning", ctx);
    expect(decision.state).toBe("LOCAL_LIMITED");
    expect(decision.canAttemptLocally).toBe(true);
  });

  it("resolves chat.advanced-planning as BLOCKED with small 3B model", () => {
    const ctx = buildLocalCapabilityRuntimeContext([LLAMACPP_CHAT]);
    const decision = resolveCapabilityRuntimeForId("colloquium:chat.advanced-planning", ctx);
    expect(decision.state).toBe("BLOCKED");
    expect(decision.canAttemptLocally).toBe(false);
  });

  it("resolves archivum:archivum.summarize as LOCAL_LIMITED with any chat model", () => {
    const ctx = buildLocalCapabilityRuntimeContext([LLAMACPP_CHAT]);
    const decision = resolveCapabilityRuntimeForId("archivum:archivum.summarize", ctx);
    expect(decision.state).toBe("LOCAL_LIMITED");
    expect(decision.canAttemptLocally).toBe(true);
  });

  it("resolves velum:velum.deterministic-review as LOCAL_READY even without models", () => {
    const ctx = buildLocalCapabilityRuntimeContext([]);
    const decision = resolveCapabilityRuntimeForId("velum:velum.deterministic-review", ctx);
    expect(decision.state).toBe("LOCAL_READY");
  });
});

describe("receipt data from llama-cpp capability decisions", () => {
  it("includes correct receipt hints for llama-cpp model decisions", () => {
    const ctx = buildLocalCapabilityRuntimeContext([LLAMACPP_CHAT]);
    const decision = resolveCapabilityRuntimeForId("colloquium:chat.basic", ctx);
    expect(decision.receiptHint.capabilityId).toBe("colloquium:chat.basic");
    expect(decision.receiptHint.state).toBe("LOCAL_READY");
    expect(decision.receiptHint.localAttemptAllowed).toBe(true);
    expect(decision.receiptHint.cloudAllowed).toBe(false);
  });
});

describe("no cloud escalation from llama-cpp models", () => {
  it("never allows cloud when only llama-cpp models are available", () => {
    const ctx = buildLocalCapabilityRuntimeContext([LLAMACPP_CHAT, LLAMACPP_CODE]);
    const chatDecision = resolveCapabilityRuntimeForId("colloquium:chat.basic", ctx);
    const codeDecision = resolveCapabilityRuntimeForId("fabrica:fabrica.single-file-suggestion", ctx);

    expect(chatDecision.canUseCloud).toBe(false);
    expect(codeDecision.canUseCloud).toBe(false);
  });
});
