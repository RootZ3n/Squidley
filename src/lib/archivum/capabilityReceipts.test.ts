import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ARCHIVUM_LOCAL_STORAGE_CAPABILITY_ID,
  ARCHIVUM_SUMMARIZE_CAPABILITY_ID,
  MORE_INPUT_LOCAL_STORAGE_CAPABILITY_ID,
  MORE_INPUT_SUMMARIZE_CAPABILITY_ID,
  buildArchivumLocalStorageCapabilityReceiptInput,
  buildArchivumSummarizeCapabilityReceiptInput,
  buildMoreInputLocalStorageCapabilityReceiptInput,
  buildMoreInputSummarizeCapabilityReceiptInput,
  recordArchivumLocalStorageCapabilityReceipt,
  recordArchivumSummarizeCapabilityReceipt,
  recordMoreInputLocalStorageCapabilityReceipt,
} from "./capabilityReceipts";
import { getCapabilityById } from "@/lib/capabilities/registry";
import { isCapabilityDecisionReceipt } from "@/lib/capabilities/badges";
import {
  buildArchivumEntryCreatedReceipt,
  buildArchivumEntryDeletedReceipt,
} from "./receipts";
import { createArchivumEntry } from "./storage";

// "summary" is intentionally omitted — it is a standard Tabularium receipt
// field name. The forbidden list targets note/document *content* fields that
// must never appear in capability receipt metadata.
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
  "noteText",
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

// ---------------------------------------------------------------------------
// Capability registration
// ---------------------------------------------------------------------------

describe("Archivum / More Input capability ids are registered", () => {
  it("archivum:archivum.local-storage is registered with moduleId=archivum, tier=local-core", () => {
    const cap = getCapabilityById(ARCHIVUM_LOCAL_STORAGE_CAPABILITY_ID);
    expect(cap).toBeDefined();
    expect(cap!.moduleId).toBe("archivum");
    expect(cap!.tier).toBe("local-core");
  });

  it("archivum:archivum.summarize is registered with moduleId=archivum, tier=local-limited", () => {
    const cap = getCapabilityById(ARCHIVUM_SUMMARIZE_CAPABILITY_ID);
    expect(cap).toBeDefined();
    expect(cap!.moduleId).toBe("archivum");
    expect(cap!.tier).toBe("local-limited");
  });

  it("more-input:archivum.local-storage is registered with moduleId=more-input, tier=local-core", () => {
    const cap = getCapabilityById(MORE_INPUT_LOCAL_STORAGE_CAPABILITY_ID);
    expect(cap).toBeDefined();
    expect(cap!.moduleId).toBe("more-input");
    expect(cap!.tier).toBe("local-core");
  });

  it("more-input:archivum.summarize is registered with moduleId=more-input, tier=local-limited", () => {
    const cap = getCapabilityById(MORE_INPUT_SUMMARIZE_CAPABILITY_ID);
    expect(cap).toBeDefined();
    expect(cap!.moduleId).toBe("more-input");
    expect(cap!.tier).toBe("local-limited");
  });
});

// ---------------------------------------------------------------------------
// Build helpers — local-storage
// ---------------------------------------------------------------------------

describe("buildArchivumLocalStorageCapabilityReceiptInput", () => {
  it("returns a Tabularium-compatible capability.decision receipt input", () => {
    const input = buildArchivumLocalStorageCapabilityReceiptInput({ createdAt: 100 });
    expect(input.action).toBe("capability.decision");
    expect(input.module).toBe("archivum");
    expect(input.modelUsed).toBe(false);

    const meta = input.metadata!;
    expect(meta.capabilityId).toBe(ARCHIVUM_LOCAL_STORAGE_CAPABILITY_ID);
    expect(meta.moduleId).toBe("archivum");
    expect(meta.capabilityTier).toBe("local-core");
    expect(meta.capabilityState).toBe("LOCAL_READY");
    expect(meta.providerMode).toBe("local");
    expect(meta.localAttemptAllowed).toBe(true);
    expect(meta.cloudAllowed).toBe(false);
    expect(meta.requiresCloudConsent).toBe(false);
    expect(meta.requiresVelumReview).toBe(false);
  });

  it("does not include forbidden content fields", () => {
    const input = buildArchivumLocalStorageCapabilityReceiptInput({ createdAt: 1 });
    assertNoForbiddenKeysDeep(input);
  });

  it("local-storage receipts omit providerId/modelId (no model involved)", () => {
    const input = buildArchivumLocalStorageCapabilityReceiptInput({ createdAt: 1 });
    expect(input.metadata!.providerId).toBeUndefined();
    expect(input.metadata!.modelId).toBeUndefined();
  });
});

describe("buildMoreInputLocalStorageCapabilityReceiptInput", () => {
  it("returns capability.decision for more-input module mapped to archivum Tabularium module", () => {
    const input = buildMoreInputLocalStorageCapabilityReceiptInput({ createdAt: 200 });
    expect(input.action).toBe("capability.decision");
    expect(input.module).toBe("archivum");

    const meta = input.metadata!;
    expect(meta.capabilityId).toBe(MORE_INPUT_LOCAL_STORAGE_CAPABILITY_ID);
    expect(meta.moduleId).toBe("more-input");
    expect(meta.capabilityState).toBe("LOCAL_READY");
    expect(meta.localAttemptAllowed).toBe(true);
    expect(meta.cloudAllowed).toBe(false);
  });

  it("local-storage receipts omit providerId/modelId", () => {
    const input = buildMoreInputLocalStorageCapabilityReceiptInput({ createdAt: 1 });
    expect(input.metadata!.providerId).toBeUndefined();
    expect(input.metadata!.modelId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Build helpers — summarize (real readiness)
// ---------------------------------------------------------------------------

describe("buildArchivumSummarizeCapabilityReceiptInput — real readiness", () => {
  it("selected generative model with full localModels resolves LOCAL_LIMITED", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({
      localModels: [{ name: "llama3.2:latest" }, { name: "qwen2.5:3b" }],
      selectedModel: "llama3.2:latest",
      createdAt: 300,
    });
    const meta = input.metadata!;
    expect(meta.capabilityId).toBe(ARCHIVUM_SUMMARIZE_CAPABILITY_ID);
    expect(meta.capabilityState).toBe("LOCAL_LIMITED");
    expect(meta.localAttemptAllowed).toBe(true);
    expect(meta.providerId).toBe("ollama");
    expect(meta.modelId).toBe("llama3.2:latest");
  });

  it("selectedModel-only fallback with generative model resolves LOCAL_LIMITED", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({
      selectedModel: "llama3.1:8b",
      createdAt: 301,
    });
    const meta = input.metadata!;
    expect(meta.capabilityState).toBe("LOCAL_LIMITED");
    expect(meta.localAttemptAllowed).toBe(true);
    expect(meta.providerId).toBe("ollama");
    expect(meta.modelId).toBe("llama3.1:8b");
  });

  it("selected embedding model does NOT resolve LOCAL_LIMITED", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({
      localModels: [{ name: "all-minilm:latest" }],
      selectedModel: "all-minilm:latest",
      createdAt: 302,
    });
    const meta = input.metadata!;
    expect(meta.capabilityState).not.toBe("LOCAL_LIMITED");
    expect(meta.localAttemptAllowed).toBe(false);
  });

  it("selectedModel-only with embedding name does NOT resolve LOCAL_LIMITED", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({
      selectedModel: "nomic-embed-text:latest",
      createdAt: 303,
    });
    const meta = input.metadata!;
    expect(meta.capabilityState).not.toBe("LOCAL_LIMITED");
    expect(meta.localAttemptAllowed).toBe(false);
  });

  it("no selected model and no usable model does not claim local readiness", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({ createdAt: 304 });
    const meta = input.metadata!;
    expect(meta.capabilityState).not.toBe("LOCAL_LIMITED");
    expect(meta.localAttemptAllowed).toBe(false);
  });

  it("empty localModels with no selectedModel does not claim local readiness", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({
      localModels: [],
      createdAt: 305,
    });
    const meta = input.metadata!;
    expect(meta.capabilityState).not.toBe("LOCAL_LIMITED");
    expect(meta.localAttemptAllowed).toBe(false);
  });

  it("providerId/modelId are included only when selectedModel exists", () => {
    const withModel = buildArchivumSummarizeCapabilityReceiptInput({
      selectedModel: "llama3.2:3b",
      createdAt: 1,
    });
    expect(withModel.metadata!.providerId).toBe("ollama");
    expect(withModel.metadata!.modelId).toBe("llama3.2:3b");

    const withoutModel = buildArchivumSummarizeCapabilityReceiptInput({ createdAt: 1 });
    expect(withoutModel.metadata!.providerId).toBeUndefined();
    expect(withoutModel.metadata!.modelId).toBeUndefined();
  });

  it("does not include forbidden content fields", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({
      localModels: [{ name: "llama3.2:latest" }],
      selectedModel: "llama3.2:latest",
      createdAt: 1,
    });
    assertNoForbiddenKeysDeep(input);
  });
});

// ---------------------------------------------------------------------------
// Build helpers — summarize (legacy localModelReady boolean)
// ---------------------------------------------------------------------------

describe("buildArchivumSummarizeCapabilityReceiptInput — legacy localModelReady", () => {
  it("reports LOCAL_LIMITED when legacy flag is true", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({
      localModelReady: true,
      providerId: "ollama",
      modelId: "llama3.2:3b",
      createdAt: 300,
    });
    expect(input.action).toBe("capability.decision");
    const meta = input.metadata!;
    expect(meta.capabilityId).toBe(ARCHIVUM_SUMMARIZE_CAPABILITY_ID);
    expect(meta.capabilityState).toBe("LOCAL_LIMITED");
    expect(meta.localAttemptAllowed).toBe(true);
    expect(meta.providerId).toBe("ollama");
    expect(meta.modelId).toBe("llama3.2:3b");
  });

  it("reports BLOCKED when legacy flag is false and no model info", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({
      localModelReady: false,
      createdAt: 301,
    });
    const meta = input.metadata!;
    expect(meta.capabilityState).toBe("BLOCKED");
    expect(meta.localAttemptAllowed).toBe(false);
  });
});

describe("buildMoreInputSummarizeCapabilityReceiptInput — real readiness", () => {
  it("selected generative model resolves LOCAL_LIMITED", () => {
    const input = buildMoreInputSummarizeCapabilityReceiptInput({
      selectedModel: "llama3.2:latest",
      createdAt: 400,
    });
    const meta = input.metadata!;
    expect(meta.capabilityId).toBe(MORE_INPUT_SUMMARIZE_CAPABILITY_ID);
    expect(meta.moduleId).toBe("more-input");
    expect(meta.capabilityState).toBe("LOCAL_LIMITED");
    expect(meta.providerId).toBe("ollama");
    expect(meta.modelId).toBe("llama3.2:latest");
  });

  it("reports LOCAL_LIMITED with legacy flag (backward compat)", () => {
    const input = buildMoreInputSummarizeCapabilityReceiptInput({
      localModelReady: true,
      createdAt: 401,
    });
    const meta = input.metadata!;
    expect(meta.capabilityState).toBe("LOCAL_LIMITED");
  });
});

// ---------------------------------------------------------------------------
// Record helpers
// ---------------------------------------------------------------------------

describe("recordArchivumLocalStorageCapabilityReceipt", () => {
  it("writes only via the supplied storage and returns a receipt", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    const receipt = recordArchivumLocalStorageCapabilityReceipt(storage, {
      createdAt: 50,
      receiptId: "arch-cap-1",
    });
    expect(receipt).not.toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0][0]).toContain("tabularium");
    expect(receipt!.metadata!.capabilityId).toBe(ARCHIVUM_LOCAL_STORAGE_CAPABILITY_ID);
    expect(receipt!.localOnly).toBe(true);
    expect(receipt!.cloudUsed).toBe(false);
    expect(receipt!.modelUsed).toBe(false);
  });

  it("handles storage failure gracefully without throwing", () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error("unavailable"); }),
      setItem: vi.fn(() => { throw new Error("unavailable"); }),
    };
    expect(() =>
      recordArchivumLocalStorageCapabilityReceipt(storage, { createdAt: 1 }),
    ).not.toThrow();
  });
});

describe("recordMoreInputLocalStorageCapabilityReceipt", () => {
  it("writes and returns a receipt with more-input capability id", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    const receipt = recordMoreInputLocalStorageCapabilityReceipt(storage, {
      createdAt: 60,
    });
    expect(receipt).not.toBeNull();
    expect(receipt!.metadata!.capabilityId).toBe(MORE_INPUT_LOCAL_STORAGE_CAPABILITY_ID);
  });
});

describe("recordArchivumSummarizeCapabilityReceipt", () => {
  it("writes via supplied storage with real model readiness", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    const receipt = recordArchivumSummarizeCapabilityReceipt(storage, {
      selectedModel: "llama3.2:latest",
      createdAt: 70,
    });
    expect(receipt).not.toBeNull();
    expect(receipt!.metadata!.capabilityId).toBe(ARCHIVUM_SUMMARIZE_CAPABILITY_ID);
    expect(receipt!.metadata!.capabilityState).toBe("LOCAL_LIMITED");
    expect(receipt!.localOnly).toBe(true);
    expect(receipt!.cloudUsed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tabularium badge detection
// ---------------------------------------------------------------------------

describe("Tabularium badge detection", () => {
  it("receipts produced by Archivum helpers are detected by isCapabilityDecisionReceipt", () => {
    const input = buildArchivumLocalStorageCapabilityReceiptInput({ createdAt: 1 });
    expect(isCapabilityDecisionReceipt(input)).toBe(true);
  });

  it("receipts produced by More Input helpers are detected by isCapabilityDecisionReceipt", () => {
    const input = buildMoreInputLocalStorageCapabilityReceiptInput({ createdAt: 1 });
    expect(isCapabilityDecisionReceipt(input)).toBe(true);
  });

  it("receipts produced by summarize helpers are detected", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({
      selectedModel: "llama3.2:latest",
      createdAt: 1,
    });
    expect(isCapabilityDecisionReceipt(input)).toBe(true);
  });

  it("summarize receipts without a model are also detected", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({ createdAt: 1 });
    expect(isCapabilityDecisionReceipt(input)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Existing Archivum receipt behavior remains intact
// ---------------------------------------------------------------------------

describe("existing Archivum receipt builders still work", () => {
  it("buildArchivumEntryCreatedReceipt still works", () => {
    const entry = createArchivumEntry({
      id: "e-1",
      title: "Test",
      type: "note",
      text: "hello",
      now: 1,
    });
    const receipt = buildArchivumEntryCreatedReceipt(entry);
    expect(receipt.module).toBe("archivum");
    expect(receipt.action).toBe("entry.created");
    expect(receipt.changedLocalStorage).toBe(true);
  });

  it("buildArchivumEntryDeletedReceipt still works", () => {
    const receipt = buildArchivumEntryDeletedReceipt("e-1");
    expect(receipt.module).toBe("archivum");
    expect(receipt.action).toBe("entry.deleted");
  });
});

// ---------------------------------------------------------------------------
// No fetch / no cloud calls
// ---------------------------------------------------------------------------

describe("Archivum capability receipts — no fetch / no cloud", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("archivum capability receipt attempted a network call");
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

  it("does not call fetch when building or recording receipts", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    buildArchivumLocalStorageCapabilityReceiptInput({ createdAt: 1 });
    buildMoreInputLocalStorageCapabilityReceiptInput({ createdAt: 2 });
    buildArchivumSummarizeCapabilityReceiptInput({ selectedModel: "llama3.2:latest", createdAt: 3 });
    buildArchivumSummarizeCapabilityReceiptInput({ localModelReady: true, createdAt: 4 });
    buildMoreInputSummarizeCapabilityReceiptInput({ createdAt: 5 });
    recordArchivumLocalStorageCapabilityReceipt(storage, { createdAt: 6 });
    recordMoreInputLocalStorageCapabilityReceipt(storage, { createdAt: 7 });
    recordArchivumSummarizeCapabilityReceipt(storage, { selectedModel: "llama3.2:latest", createdAt: 8 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// No note/document content in metadata
// ---------------------------------------------------------------------------

describe("capability receipt metadata does not include note content", () => {
  it("local-storage receipt serialization does not contain note-like text", () => {
    const input = buildArchivumLocalStorageCapabilityReceiptInput({ createdAt: 1 });
    const serialized = JSON.stringify(input);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it("summarize receipt with real readiness does not contain note-like text", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({
      localModels: [{ name: "llama3.2:latest" }],
      selectedModel: "llama3.2:latest",
      createdAt: 1,
    });
    assertNoForbiddenKeysDeep(input);
  });

  it("summarize receipt with legacy flag does not contain note-like text", () => {
    const input = buildArchivumSummarizeCapabilityReceiptInput({
      localModelReady: true,
      providerId: "ollama",
      modelId: "llama3.2:3b",
      createdAt: 1,
    });
    assertNoForbiddenKeysDeep(input);
  });
});
