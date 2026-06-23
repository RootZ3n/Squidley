import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLocalCapabilityRuntimeContext,
  inferLocalModelCapabilityProfiles,
  inferParamsB,
  isLikelyCodeModel,
  isLikelyEmbeddingModel,
  isLikelyVisionModel,
  localModelsToCapabilityProfiles,
  type LocalModelSnapshot,
} from "./localReadiness";
import { resolveCapabilityRuntimeForId } from "./runtime";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHAT_MODEL: LocalModelSnapshot = { name: "llama3.2:latest" };
const CHAT_7B: LocalModelSnapshot = { name: "llama3.1:7b" };
const CHAT_14B: LocalModelSnapshot = { name: "qwen2.5:14b" };
const CHAT_HALF_B: LocalModelSnapshot = { name: "qwen2.5:0.5b" };
const CODE_MODEL: LocalModelSnapshot = { name: "deepseek-coder:6.7b" };
const QWEN_CODER: LocalModelSnapshot = { name: "qwen2.5-coder:7b" };
const VISION_MODEL: LocalModelSnapshot = { name: "llava:13b" };
const VISION_EXPLICIT: LocalModelSnapshot = {
  name: "custom-vision:latest",
  supportsVision: true,
};
const GEMMA3: LocalModelSnapshot = { name: "gemma3:12b" };
const EMBED_MINILM: LocalModelSnapshot = { name: "all-minilm:latest" };
const EMBED_NOMIC: LocalModelSnapshot = { name: "nomic-embed-text:latest" };
const EMBED_EXPLICIT: LocalModelSnapshot = {
  name: "custom-embed",
  isEmbedding: true,
};
const LONG_CTX: LocalModelSnapshot = {
  name: "llama3.1:8b",
  contextLength: 131_072,
};
const SHORT_CTX: LocalModelSnapshot = {
  name: "llama3.2:3b",
  contextLength: 4096,
};
const GENERIC_MODEL: LocalModelSnapshot = { name: "mystery-model:latest" };
const PARAMS_EXPLICIT: LocalModelSnapshot = {
  name: "custom:latest",
  paramsB: 32,
};

// ---------------------------------------------------------------------------
// Embedding detection
// ---------------------------------------------------------------------------

describe("isLikelyEmbeddingModel", () => {
  it("detects common embedding model names", () => {
    expect(isLikelyEmbeddingModel(EMBED_MINILM)).toBe(true);
    expect(isLikelyEmbeddingModel(EMBED_NOMIC)).toBe(true);
    expect(isLikelyEmbeddingModel({ name: "bge-small-en-v1.5" })).toBe(true);
    expect(isLikelyEmbeddingModel({ name: "mxbai-embed-large" })).toBe(true);
  });

  it("respects explicit isEmbedding flag", () => {
    expect(isLikelyEmbeddingModel(EMBED_EXPLICIT)).toBe(true);
  });

  it("does not classify chat models as embedding", () => {
    expect(isLikelyEmbeddingModel(CHAT_MODEL)).toBe(false);
    expect(isLikelyEmbeddingModel(CODE_MODEL)).toBe(false);
    expect(isLikelyEmbeddingModel(VISION_MODEL)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Code detection
// ---------------------------------------------------------------------------

describe("isLikelyCodeModel", () => {
  it("detects code-oriented model names", () => {
    expect(isLikelyCodeModel(CODE_MODEL)).toBe(true);
    expect(isLikelyCodeModel(QWEN_CODER)).toBe(true);
    expect(isLikelyCodeModel({ name: "codellama:7b" })).toBe(true);
    expect(isLikelyCodeModel({ name: "starcoder2:3b" })).toBe(true);
    expect(isLikelyCodeModel({ name: "granite-code:8b" })).toBe(true);
  });

  it("does not classify generic chat models as code", () => {
    expect(isLikelyCodeModel(CHAT_MODEL)).toBe(false);
    expect(isLikelyCodeModel(GENERIC_MODEL)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Vision detection
// ---------------------------------------------------------------------------

describe("isLikelyVisionModel", () => {
  it("detects vision model names", () => {
    expect(isLikelyVisionModel(VISION_MODEL)).toBe(true);
    expect(isLikelyVisionModel({ name: "minicpm-v:latest" })).toBe(true);
    expect(isLikelyVisionModel({ name: "moondream:1.8b" })).toBe(true);
    expect(isLikelyVisionModel(GEMMA3)).toBe(true);
  });

  it("respects explicit supportsVision flag", () => {
    expect(isLikelyVisionModel(VISION_EXPLICIT)).toBe(true);
  });

  it("does not classify generic chat models as vision", () => {
    expect(isLikelyVisionModel(CHAT_MODEL)).toBe(false);
    expect(isLikelyVisionModel(CODE_MODEL)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Parameter size inference
// ---------------------------------------------------------------------------

describe("inferParamsB", () => {
  it("parses common parameter sizes from model names", () => {
    expect(inferParamsB({ name: "llama3.1:7b" })).toBe(7);
    expect(inferParamsB({ name: "qwen2.5:14b" })).toBe(14);
    expect(inferParamsB({ name: "deepseek-coder:6.7b" })).toBe(6.7);
    expect(inferParamsB({ name: "qwen2.5:0.5b" })).toBe(0.5);
    expect(inferParamsB({ name: "llama3.2:1.5b" })).toBe(1.5);
    expect(inferParamsB({ name: "llama3.2:3b" })).toBe(3);
    expect(inferParamsB({ name: "codestral:32b" })).toBe(32);
  });

  it("prefers explicit paramsB when provided", () => {
    expect(inferParamsB(PARAMS_EXPLICIT)).toBe(32);
  });

  it("returns undefined when size cannot be inferred", () => {
    expect(inferParamsB({ name: "llama3.2:latest" })).toBeUndefined();
    expect(inferParamsB({ name: "mystery-model" })).toBeUndefined();
  });

  it("does not fake params for ambiguous names", () => {
    expect(inferParamsB({ name: "all-minilm:latest" })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Profile inference for individual models
// ---------------------------------------------------------------------------

describe("inferLocalModelCapabilityProfiles", () => {
  it("maps a basic chat model to chat profile", () => {
    const profiles = inferLocalModelCapabilityProfiles(CHAT_MODEL);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].capabilityProfile).toBe("chat");
    expect(profiles[0].providerId).toBe("ollama");
  });

  it("maps a code model to both chat and code profiles", () => {
    const profiles = inferLocalModelCapabilityProfiles(CODE_MODEL);
    const caps = profiles.map((p) => p.capabilityProfile);
    expect(caps).toContain("chat");
    expect(caps).toContain("code");
  });

  it("maps a vision model to both chat and vision profiles", () => {
    const profiles = inferLocalModelCapabilityProfiles(VISION_MODEL);
    const caps = profiles.map((p) => p.capabilityProfile);
    expect(caps).toContain("chat");
    expect(caps).toContain("vision");
  });

  it("maps gemma3 to chat and vision profiles", () => {
    const profiles = inferLocalModelCapabilityProfiles(GEMMA3);
    const caps = profiles.map((p) => p.capabilityProfile);
    expect(caps).toContain("chat");
    expect(caps).toContain("vision");
  });

  it("maps an embedding model to embeddings only, not chat", () => {
    const profiles = inferLocalModelCapabilityProfiles(EMBED_MINILM);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].capabilityProfile).toBe("embeddings");
  });

  it("maps explicitly-flagged embedding model to embeddings only", () => {
    const profiles = inferLocalModelCapabilityProfiles(EMBED_EXPLICIT);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].capabilityProfile).toBe("embeddings");
  });

  it("includes long-context profile when contextLength >= 32768", () => {
    const profiles = inferLocalModelCapabilityProfiles(LONG_CTX);
    const caps = profiles.map((p) => p.capabilityProfile);
    expect(caps).toContain("chat");
    expect(caps).toContain("long-context");
  });

  it("does not include long-context for short context windows", () => {
    const profiles = inferLocalModelCapabilityProfiles(SHORT_CTX);
    const caps = profiles.map((p) => p.capabilityProfile);
    expect(caps).not.toContain("long-context");
  });

  it("does not infer tool-use from any model name", () => {
    for (const model of [CHAT_MODEL, CODE_MODEL, VISION_MODEL, GENERIC_MODEL]) {
      const profiles = inferLocalModelCapabilityProfiles(model);
      const caps = profiles.map((p) => p.capabilityProfile);
      expect(caps).not.toContain("tool-use");
    }
  });

  it("does not overclaim code/vision for unknown model", () => {
    const profiles = inferLocalModelCapabilityProfiles(GENERIC_MODEL);
    const caps = profiles.map((p) => p.capabilityProfile);
    expect(caps).toEqual(["chat"]);
  });

  it("includes paramsB when inferable from model name", () => {
    const profiles = inferLocalModelCapabilityProfiles(CHAT_7B);
    expect(profiles[0].paramsB).toBe(7);
  });

  it("omits paramsB when not inferable", () => {
    const profiles = inferLocalModelCapabilityProfiles(CHAT_MODEL);
    expect(profiles[0].paramsB).toBeUndefined();
  });

  it("uses explicit providerId when supplied", () => {
    const profiles = inferLocalModelCapabilityProfiles({
      name: "test:7b",
      providerId: "custom-local",
    });
    expect(profiles[0].providerId).toBe("custom-local");
  });
});

// ---------------------------------------------------------------------------
// Batch mapping with deduplication
// ---------------------------------------------------------------------------

describe("localModelsToCapabilityProfiles", () => {
  it("deduplicates profiles by providerId + capabilityProfile", () => {
    const profiles = localModelsToCapabilityProfiles([CHAT_MODEL, CHAT_7B]);
    const chatProfiles = profiles.filter((p) => p.capabilityProfile === "chat");
    expect(chatProfiles).toHaveLength(1);
  });

  it("keeps the largest paramsB when deduplicating", () => {
    const profiles = localModelsToCapabilityProfiles([CHAT_7B, CHAT_14B]);
    const chat = profiles.find((p) => p.capabilityProfile === "chat");
    expect(chat?.paramsB).toBe(14);
  });

  it("produces both chat and embeddings from a mixed model list", () => {
    const profiles = localModelsToCapabilityProfiles([CHAT_MODEL, EMBED_MINILM]);
    const caps = profiles.map((p) => p.capabilityProfile).sort();
    expect(caps).toEqual(["chat", "embeddings"]);
  });

  it("does not include modelName in output (only AvailableProfile fields)", () => {
    const profiles = localModelsToCapabilityProfiles([CHAT_MODEL]);
    for (const profile of profiles) {
      expect("modelName" in profile).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Runtime context builder
// ---------------------------------------------------------------------------

describe("buildLocalCapabilityRuntimeContext", () => {
  it("produces a context with local profiles and locked cloud", () => {
    const ctx = buildLocalCapabilityRuntimeContext([CHAT_MODEL]);
    expect(ctx.availableLocalProfiles.length).toBeGreaterThan(0);
    expect(ctx.availableCloudProfiles).toEqual([]);
    expect(ctx.cloudUnlocked).toBe(false);
    expect(ctx.cloudConsentGranted).toBe(false);
    expect(ctx.velumReviewPassed).toBe(false);
  });

  it("passes through velumReviewPassed option", () => {
    const ctx = buildLocalCapabilityRuntimeContext([CHAT_MODEL], {
      velumReviewPassed: true,
    });
    expect(ctx.velumReviewPassed).toBe(true);
  });

  it("passes through blockedReason option", () => {
    const ctx = buildLocalCapabilityRuntimeContext([], {
      blockedReason: "test block",
    });
    expect(ctx.blockedReason).toBe("test block");
  });
});

// ---------------------------------------------------------------------------
// Integration with capability runtime resolver
// ---------------------------------------------------------------------------

describe("integration with resolveCapabilityRuntimeForId", () => {
  it("resolves chat:chat.basic as LOCAL_READY when a chat model exists", () => {
    const ctx = buildLocalCapabilityRuntimeContext([CHAT_MODEL]);
    const decision = resolveCapabilityRuntimeForId(
      "chat:chat.basic",
      ctx,
    );
    expect(decision.state).toBe("LOCAL_READY");
    expect(decision.canAttemptLocally).toBe(true);
    expect(decision.canUseCloud).toBe(false);
  });

  it("resolves chat:chat.basic as BLOCKED when no models exist", () => {
    const ctx = buildLocalCapabilityRuntimeContext([]);
    const decision = resolveCapabilityRuntimeForId(
      "chat:chat.basic",
      ctx,
    );
    expect(decision.state).toBe("BLOCKED");
    expect(decision.canAttemptLocally).toBe(false);
  });

  it("resolves chat:chat.basic as BLOCKED when only embedding models exist", () => {
    const ctx = buildLocalCapabilityRuntimeContext([EMBED_MINILM, EMBED_NOMIC]);
    const decision = resolveCapabilityRuntimeForId(
      "chat:chat.basic",
      ctx,
    );
    expect(decision.state).toBe("BLOCKED");
    expect(decision.canAttemptLocally).toBe(false);
  });

  it("resolves notebook:notebook.summarize as LOCAL_LIMITED when a chat model exists", () => {
    const ctx = buildLocalCapabilityRuntimeContext([CHAT_MODEL]);
    const decision = resolveCapabilityRuntimeForId(
      "notebook:notebook.summarize",
      ctx,
    );
    expect(decision.state).toBe("LOCAL_LIMITED");
    expect(decision.canAttemptLocally).toBe(true);
  });

  it("does not claim summarize readiness for embedding-only models", () => {
    const ctx = buildLocalCapabilityRuntimeContext([EMBED_MINILM]);
    const decision = resolveCapabilityRuntimeForId(
      "notebook:notebook.summarize",
      ctx,
    );
    expect(decision.state).toBe("BLOCKED");
  });

  it("resolves velum:velum.deterministic-review as LOCAL_READY regardless of models", () => {
    const ctx = buildLocalCapabilityRuntimeContext([]);
    const decision = resolveCapabilityRuntimeForId(
      "velum:velum.deterministic-review",
      ctx,
    );
    expect(decision.state).toBe("LOCAL_READY");
  });
});

// ---------------------------------------------------------------------------
// Purity: no fetch, no localStorage
// ---------------------------------------------------------------------------

describe("local readiness helpers — purity", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("localReadiness attempted a network call");
    });
    (globalThis as unknown as { fetch: typeof globalThis.fetch }).fetch =
      fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      (globalThis as unknown as { fetch: typeof globalThis.fetch }).fetch =
        originalFetch;
    }
  });

  it("does not call fetch for any mapping or context-building operation", () => {
    inferLocalModelCapabilityProfiles(CHAT_MODEL);
    inferLocalModelCapabilityProfiles(CODE_MODEL);
    inferLocalModelCapabilityProfiles(VISION_MODEL);
    inferLocalModelCapabilityProfiles(EMBED_MINILM);
    localModelsToCapabilityProfiles([CHAT_MODEL, CODE_MODEL, EMBED_MINILM]);
    buildLocalCapabilityRuntimeContext([CHAT_MODEL, VISION_MODEL]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not write to localStorage (no global side effects)", () => {
    // Vitest does not have a real localStorage in node. Verify that the
    // functions are pure by checking they do not reference window/localStorage.
    const source = inferLocalModelCapabilityProfiles.toString();
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });
});
