import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCapabilityPreflightReceiptInput,
  recordCapabilityPreflightReceipt,
} from "./preflight";
import { isCapabilityDecisionReceipt } from "./badges";
import {
  buildVelumCapabilityDecisionReceiptInput,
  VELUM_CAPABILITY_ID,
} from "@/lib/velum/capabilityReceipts";
import {
  buildChatCapabilityDecisionReceiptInput,
  COLLOQUIUM_CHAT_CAPABILITY_ID,
} from "@/lib/chat/capabilityReceipts";

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

describe("buildCapabilityPreflightReceiptInput", () => {
  it("creates a ActivityLog-compatible capability.decision receipt input", () => {
    const input = buildCapabilityPreflightReceiptInput({
      capabilityId: VELUM_CAPABILITY_ID,
      createdAt: 100,
    });
    expect(input.action).toBe("capability.decision");
    expect(input.module).toBe("velum");
    expect(input.modelUsed).toBe(false);
    expect(input.metadata).toBeDefined();
    expect(input.metadata!.capabilityId).toBe(VELUM_CAPABILITY_ID);
  });

  it("preserves capabilityId, moduleId, tier, state, providerMode in metadata", () => {
    const input = buildCapabilityPreflightReceiptInput({
      capabilityId: COLLOQUIUM_CHAT_CAPABILITY_ID,
      availableLocalProfiles: [{ providerId: "ollama", capabilityProfile: "chat" }],
      providerId: "ollama",
      modelId: "llama3.1:8b",
      createdAt: 200,
    });
    const meta = input.metadata!;
    expect(meta.capabilityId).toBe(COLLOQUIUM_CHAT_CAPABILITY_ID);
    expect(meta.moduleId).toBe("colloquium");
    expect(meta.capabilityTier).toBe("local-core");
    expect(meta.capabilityState).toBe("LOCAL_READY");
    expect(meta.providerMode).toBe("local");
    expect(meta.providerId).toBe("ollama");
    expect(meta.modelId).toBe("llama3.1:8b");
  });

  it("passes through optional status and receiptId", () => {
    const input = buildCapabilityPreflightReceiptInput({
      capabilityId: VELUM_CAPABILITY_ID,
      createdAt: 1,
      status: "succeeded",
      receiptId: "custom-id-1",
    });
    expect(input.status).toBe("succeeded");
    expect(input.id).toBe("custom-id-1");
  });

  it("does not include forbidden fields", () => {
    const input = buildCapabilityPreflightReceiptInput({
      capabilityId: COLLOQUIUM_CHAT_CAPABILITY_ID,
      availableLocalProfiles: [{ providerId: "ollama", capabilityProfile: "chat" }],
      providerId: "ollama",
      modelId: "llama3.1:8b",
      createdAt: 1,
    });
    assertNoForbiddenKeysDeep(input);
  });
});

describe("recordCapabilityPreflightReceipt", () => {
  it("writes only through the supplied storage", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    const receipt = recordCapabilityPreflightReceipt(storage, {
      capabilityId: VELUM_CAPABILITY_ID,
      createdAt: 50,
      receiptId: "preflight-1",
    });
    expect(receipt).not.toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0][0]).toContain("tabularium");
    expect(receipt!.localOnly).toBe(true);
    expect(receipt!.cloudUsed).toBe(false);
  });

  it("handles storage failure gracefully without throwing", () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error("unavailable"); }),
      setItem: vi.fn(() => { throw new Error("unavailable"); }),
    };
    // logActivityReceipt swallows storage errors internally and still
    // returns the created receipt object. The key contract is no throw.
    expect(() =>
      recordCapabilityPreflightReceipt(storage, {
        capabilityId: VELUM_CAPABILITY_ID,
        createdAt: 1,
      }),
    ).not.toThrow();
  });
});

describe("ActivityLog badge detection works for generic preflight receipts", () => {
  it("receipts from buildCapabilityPreflightReceiptInput are detected by isCapabilityDecisionReceipt", () => {
    const input = buildCapabilityPreflightReceiptInput({
      capabilityId: COLLOQUIUM_CHAT_CAPABILITY_ID,
      availableLocalProfiles: [{ providerId: "ollama", capabilityProfile: "chat" }],
      createdAt: 1,
    });
    expect(isCapabilityDecisionReceipt(input)).toBe(true);
  });
});

describe("Velum helper produces identical metadata after delegating", () => {
  it("Velum build helper output matches generic preflight for the same inputs", () => {
    const velumInput = buildVelumCapabilityDecisionReceiptInput({
      createdAt: 500,
      reviewCompleted: true,
    });
    const genericInput = buildCapabilityPreflightReceiptInput({
      capabilityId: VELUM_CAPABILITY_ID,
      velumReviewPassed: true,
      createdAt: 500,
    });
    expect(velumInput.module).toBe(genericInput.module);
    expect(velumInput.action).toBe(genericInput.action);
    expect(velumInput.modelUsed).toBe(genericInput.modelUsed);
    expect(velumInput.metadata!.capabilityId).toBe(genericInput.metadata!.capabilityId);
    expect(velumInput.metadata!.capabilityState).toBe(genericInput.metadata!.capabilityState);
    expect(velumInput.metadata!.providerMode).toBe(genericInput.metadata!.providerMode);
    expect(velumInput.metadata!.cloudAllowed).toBe(genericInput.metadata!.cloudAllowed);
    expect(velumInput.metadata!.localAttemptAllowed).toBe(genericInput.metadata!.localAttemptAllowed);
  });
});

describe("Chat helper produces identical metadata after delegating", () => {
  it("Chat build helper output matches generic preflight for the same inputs", () => {
    const colloquiumInput = buildChatCapabilityDecisionReceiptInput({
      createdAt: 500,
      localChatReady: true,
      providerId: "ollama",
      modelId: "llama3.1:8b",
    });
    const genericInput = buildCapabilityPreflightReceiptInput({
      capabilityId: COLLOQUIUM_CHAT_CAPABILITY_ID,
      availableLocalProfiles: [{ providerId: "ollama", capabilityProfile: "chat" }],
      providerId: "ollama",
      modelId: "llama3.1:8b",
      createdAt: 500,
    });
    expect(colloquiumInput.module).toBe(genericInput.module);
    expect(colloquiumInput.action).toBe(genericInput.action);
    expect(colloquiumInput.modelUsed).toBe(genericInput.modelUsed);
    expect(colloquiumInput.metadata!.capabilityId).toBe(genericInput.metadata!.capabilityId);
    expect(colloquiumInput.metadata!.capabilityState).toBe(genericInput.metadata!.capabilityState);
    expect(colloquiumInput.metadata!.providerMode).toBe(genericInput.metadata!.providerMode);
    expect(colloquiumInput.metadata!.cloudAllowed).toBe(genericInput.metadata!.cloudAllowed);
    expect(colloquiumInput.metadata!.localAttemptAllowed).toBe(genericInput.metadata!.localAttemptAllowed);
    expect(colloquiumInput.metadata!.providerId).toBe(genericInput.metadata!.providerId);
    expect(colloquiumInput.metadata!.modelId).toBe(genericInput.metadata!.modelId);
  });
});

describe("generic preflight — no fetch / no cloud calls", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("preflight helper attempted a network call");
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

  it("does not call fetch when building or recording", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    buildCapabilityPreflightReceiptInput({
      capabilityId: VELUM_CAPABILITY_ID,
      createdAt: 1,
    });
    recordCapabilityPreflightReceipt(storage, {
      capabilityId: COLLOQUIUM_CHAT_CAPABILITY_ID,
      availableLocalProfiles: [{ providerId: "ollama", capabilityProfile: "chat" }],
      createdAt: 2,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
