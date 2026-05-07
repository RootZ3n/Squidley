import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COLLOQUIUM_CHAT_CAPABILITY_ID,
  buildColloquiumCapabilityDecisionReceiptInput,
  recordColloquiumCapabilityDecisionReceipt,
} from "./capabilityReceipts";
import { getCapabilityById } from "@/lib/capabilities/registry";
import {
  buildColloquiumChatCompletedReceipt,
  buildColloquiumChatFailedReceipt,
  buildColloquiumChatSentReceipt,
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

describe("Colloquium chat capability id", () => {
  it("matches a registered capability with moduleId=colloquium", () => {
    const cap = getCapabilityById(COLLOQUIUM_CHAT_CAPABILITY_ID);
    expect(cap).toBeDefined();
    expect(cap!.moduleId).toBe("colloquium");
    expect(cap!.tier).toBe("local-core");
  });
});

describe("buildColloquiumCapabilityDecisionReceiptInput", () => {
  it("returns a Tabularium-compatible input with capability metadata when local chat is ready", () => {
    const input = buildColloquiumCapabilityDecisionReceiptInput({
      createdAt: 1000,
      localChatReady: true,
      providerId: "ollama",
      modelId: "llama3.1:8b",
    });
    expect(input.module).toBe("colloquium");
    expect(input.action).toBe("capability.decision");
    expect(input.modelUsed).toBe(false);
    expect(input.title).toContain(COLLOQUIUM_CHAT_CAPABILITY_ID);

    const meta = input.metadata!;
    expect(meta.capabilityId).toBe(COLLOQUIUM_CHAT_CAPABILITY_ID);
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
    const input = buildColloquiumCapabilityDecisionReceiptInput({
      createdAt: 1,
      localChatReady: false,
    });
    expect(input.metadata!.capabilityState).not.toBe("LOCAL_READY");
    expect(input.metadata!.localAttemptAllowed).toBe(false);
    expect(input.metadata!.cloudAllowed).toBe(false);
  });

  it("does not include prompt/message/draft/history fields", () => {
    const input = buildColloquiumCapabilityDecisionReceiptInput({
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

describe("recordColloquiumCapabilityDecisionReceipt", () => {
  it("writes only via the supplied Tabularium storage and returns a receipt", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    const receipt = recordColloquiumCapabilityDecisionReceipt(storage, {
      createdAt: 50,
      receiptId: "colloquium-cap-1",
      localChatReady: true,
      providerId: "ollama",
      modelId: "llama3.1:8b",
    });
    expect(receipt).not.toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0][0]).toContain("tabularium");
    expect(receipt!.module).toBe("colloquium");
    expect(receipt!.metadata!.capabilityId).toBe(COLLOQUIUM_CHAT_CAPABILITY_ID);
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
      recordColloquiumCapabilityDecisionReceipt(storage, { createdAt: 1 }),
    ).not.toThrow();
  });

  it("does not include user prompt content in the persisted receipt JSON", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    // The capability adapter takes no body — there is no path for the user's
    // prompt to land in this receipt. The test exists to lock that contract.
    recordColloquiumCapabilityDecisionReceipt(storage, {
      createdAt: 2,
      localChatReady: true,
      providerId: "ollama",
      modelId: "llama3.1:8b",
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

describe("Colloquium capability receipt — purity and existing flow preserved", () => {
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
    buildColloquiumCapabilityDecisionReceiptInput({
      createdAt: 1,
      localChatReady: true,
    });
    recordColloquiumCapabilityDecisionReceipt(storage, {
      createdAt: 2,
      localChatReady: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("existing Colloquium content receipts (sent/failed/completed) still build correctly", () => {
    const sent = buildColloquiumChatSentReceipt({
      id: "r-1",
      createdAt: 1,
      model: "llama3.1:8b",
    });
    const failed = buildColloquiumChatFailedReceipt({
      id: "r-1-f",
      createdAt: 2,
      completedAt: 3,
      model: "llama3.1:8b",
      message: "stopped by user",
      receiptId: "r-1",
      interrupted: true,
    });
    const completed = buildColloquiumChatCompletedReceipt({
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
