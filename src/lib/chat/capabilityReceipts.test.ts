import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_CAPABILITY_ID,
  buildChatCapabilityDecisionReceiptInput,
  recordChatCapabilityDecisionReceipt,
} from "./capabilityReceipts";
import { getCapabilityById } from "@/lib/capabilities/registry";
import {
  buildChatCompletedReceipt,
  buildChatFailedReceipt,
  buildChatSentReceipt,
} from "./receipts";

const FORBIDDEN_KEYS = [
  "prompt",
  "promptText",
  "body",
  "content",
  "message",
  "messages",
  "document",
  "documents",
  "rawText",
  "redactedText",
  "secret",
  "secrets",
  "apiKey",
  "token",
  "userText",
  "assistantText",
  "draft",
  "draftText",
  "history",
];

function assertNoForbiddenKeysDeep(value: unknown, path = "<root>"): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoForbiddenKeysDeep(item, `${path}[${i}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    expect(
      FORBIDDEN_KEYS.includes(key),
      `forbidden key "${key}" found at ${path}`,
    ).toBe(false);
    assertNoForbiddenKeysDeep(child, `${path}.${key}`);
  }
}

describe("Chat chat capability id", () => {
  it("matches a registered capability with moduleId=colloquium", () => {
    const cap = getCapabilityById(CHAT_CAPABILITY_ID);
    expect(cap).toBeDefined();
    expect(cap!.moduleId).toBe("colloquium");
    expect(cap!.tier).toBe("local-core");
  });
});

// ---------------------------------------------------------------------------
// Real local readiness (localModels / selectedModel)
// ---------------------------------------------------------------------------

describe("buildChatCapabilityDecisionReceiptInput — real readiness", () => {
  it("selected generative model produces LOCAL_READY", () => {
    const input = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1000,
      localModels: [{ name: "llama3.2:latest" }, { name: "qwen2.5:3b" }],
      selectedModel: "llama3.2:latest",
    });
    const meta = input.metadata!;
    expect(meta.capabilityState).toBe("LOCAL_READY");
    expect(meta.localAttemptAllowed).toBe(true);
    expect(meta.providerId).toBe("ollama");
    expect(meta.modelId).toBe("llama3.2:latest");
  });

  it("selectedModel-only fallback also produces LOCAL_READY for generative model", () => {
    const input = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
      selectedModel: "llama3.1:8b",
    });
    const meta = input.metadata!;
    expect(meta.capabilityState).toBe("LOCAL_READY");
    expect(meta.localAttemptAllowed).toBe(true);
    expect(meta.providerId).toBe("ollama");
    expect(meta.modelId).toBe("llama3.1:8b");
  });

  it("selected embedding model does NOT produce LOCAL_READY for chat", () => {
    const input = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
      localModels: [{ name: "all-minilm:latest" }],
      selectedModel: "all-minilm:latest",
    });
    const meta = input.metadata!;
    expect(meta.capabilityState).not.toBe("LOCAL_READY");
    expect(meta.localAttemptAllowed).toBe(false);
  });

  it("selectedModel-only with embedding name does NOT produce LOCAL_READY", () => {
    const input = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
      selectedModel: "nomic-embed-text:latest",
    });
    const meta = input.metadata!;
    expect(meta.capabilityState).not.toBe("LOCAL_READY");
    expect(meta.localAttemptAllowed).toBe(false);
  });

  it("no selected model does not silently claim LOCAL_READY", () => {
    const input = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
    });
    const meta = input.metadata!;
    expect(meta.capabilityState).not.toBe("LOCAL_READY");
    expect(meta.localAttemptAllowed).toBe(false);
  });

  it("empty localModels with no selectedModel does not claim LOCAL_READY", () => {
    const input = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
      localModels: [],
    });
    const meta = input.metadata!;
    expect(meta.capabilityState).not.toBe("LOCAL_READY");
    expect(meta.localAttemptAllowed).toBe(false);
  });

  it("providerId/modelId are included only when selectedModel exists", () => {
    const withModel = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
      selectedModel: "llama3.2:latest",
    });
    expect(withModel.metadata!.providerId).toBe("ollama");
    expect(withModel.metadata!.modelId).toBe("llama3.2:latest");

    const withoutModel = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
    });
    expect(withoutModel.metadata!.providerId).toBeUndefined();
    expect(withoutModel.metadata!.modelId).toBeUndefined();
  });

  it("does not include forbidden content fields", () => {
    const input = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
      localModels: [{ name: "llama3.2:latest" }],
      selectedModel: "llama3.2:latest",
    });
    assertNoForbiddenKeysDeep(input);
  });
});

// ---------------------------------------------------------------------------
// Legacy localChatReady boolean (backward compat)
// ---------------------------------------------------------------------------

describe("buildChatCapabilityDecisionReceiptInput — legacy localChatReady", () => {
  it("returns a ActivityLog-compatible input with capability metadata when local chat is ready", () => {
    const input = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1000,
      localChatReady: true,
      providerId: "ollama",
      modelId: "llama3.1:8b",
    });
    expect(input.module).toBe("colloquium");
    expect(input.action).toBe("capability.decision");
    expect(input.modelUsed).toBe(false);
    expect(input.title).toContain(CHAT_CAPABILITY_ID);

    const meta = input.metadata!;
    expect(meta.capabilityId).toBe(CHAT_CAPABILITY_ID);
    expect(meta.moduleId).toBe("colloquium");
    expect(meta.capabilityTier).toBe("local-core");
    expect(meta.capabilityState).toBe("LOCAL_READY");
    expect(meta.providerMode).toBe("local");
    expect(meta.localAttemptAllowed).toBe(true);
    expect(meta.cloudAllowed).toBe(false);
    expect(meta.requiresCloudConsent).toBe(false);
    expect(meta.requiresVelumReview).toBe(true);
    expect(meta.providerId).toBe("ollama");
    expect(meta.modelId).toBe("llama3.1:8b");
  });

  it("does not silently claim ready when no local chat profile is supplied", () => {
    const input = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
      localChatReady: false,
    });
    expect(input.metadata!.capabilityState).not.toBe("LOCAL_READY");
    expect(input.metadata!.localAttemptAllowed).toBe(false);
    expect(input.metadata!.cloudAllowed).toBe(false);
  });

  it("does not include prompt/message/draft/history fields", () => {
    const input = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
      localChatReady: true,
      providerId: "ollama",
      modelId: "llama3.1:8b",
    });
    assertNoForbiddenKeysDeep(input);
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain("user message");
    expect(serialized).not.toContain("assistant reply");
  });
});

// ---------------------------------------------------------------------------
// Record helper
// ---------------------------------------------------------------------------

describe("recordChatCapabilityDecisionReceipt", () => {
  it("writes only via the supplied ActivityLog storage and returns a receipt", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    const receipt = recordChatCapabilityDecisionReceipt(storage, {
      createdAt: 50,
      receiptId: "colloquium-cap-1",
      localModels: [{ name: "llama3.1:8b" }],
      selectedModel: "llama3.1:8b",
    });
    expect(receipt).not.toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0][0]).toContain("activity-log");
    expect(receipt!.module).toBe("colloquium");
    expect(receipt!.metadata!.capabilityId).toBe(CHAT_CAPABILITY_ID);
    expect(receipt!.localOnly).toBe(true);
    expect(receipt!.cloudUsed).toBe(false);
    expect(receipt!.modelUsed).toBe(false);
  });

  it("returns gracefully without throwing when storage throws", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
      setItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    };
    expect(() =>
      recordChatCapabilityDecisionReceipt(storage, { createdAt: 1 }),
    ).not.toThrow();
  });

  it("does not include user prompt content in the persisted receipt JSON", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    recordChatCapabilityDecisionReceipt(storage, {
      createdAt: 2,
      selectedModel: "llama3.1:8b",
    });
    const written = data.get(storage.setItem.mock.calls[0][0])!;
    for (const probe of [
      "summarize this document",
      "ignore previous instructions",
      "user typed text",
      "draftText",
      "messages",
    ]) {
      expect(written.toLowerCase()).not.toContain(probe.toLowerCase());
    }
  });
});

// ---------------------------------------------------------------------------
// Purity and existing flow
// ---------------------------------------------------------------------------

describe("Chat capability receipt — purity and existing flow preserved", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("colloquium capability receipt attempted a network call");
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

  it("does not call fetch when building or recording the receipt", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
      localModels: [{ name: "llama3.2:latest" }],
      selectedModel: "llama3.2:latest",
    });
    buildChatCapabilityDecisionReceiptInput({
      createdAt: 2,
      localChatReady: true,
    });
    recordChatCapabilityDecisionReceipt(storage, {
      createdAt: 3,
      selectedModel: "llama3.2:latest",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("existing Chat content receipts (sent/failed/completed) still build correctly", () => {
    const sent = buildChatSentReceipt({
      id: "r-1",
      createdAt: 1,
      model: "llama3.1:8b",
    });
    const failed = buildChatFailedReceipt({
      id: "r-1-f",
      createdAt: 2,
      completedAt: 3,
      model: "llama3.1:8b",
      message: "stopped by user",
      receiptId: "r-1",
      interrupted: true,
    });
    const completed = buildChatCompletedReceipt({
      id: "r-1-c",
      createdAt: 1,
      completedAt: 4,
      receiptId: "r-1",
      model: "llama3.1:8b",
      durationMs: 3,
      characterCount: 100,
      tokenEstimate: 25,
    });
    expect(sent.module).toBe("colloquium");
    expect(failed.module).toBe("colloquium");
    expect(completed.module).toBe("colloquium");
  });
});
