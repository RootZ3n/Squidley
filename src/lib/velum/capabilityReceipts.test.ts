import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VELUM_CAPABILITY_ID,
  buildVelumCapabilityDecisionReceiptInput,
  recordVelumCapabilityDecisionReceipt,
} from "./capabilityReceipts";
import { reviewVelumText } from "./review";
import { getCapabilityById } from "@/lib/capabilities/registry";
import {
  buildVelumHandoffFromChatReceipt,
  buildVelumRedactionCreatedReceipt,
  buildVelumReviewReceipt,
} from "./receipts";

const FORBIDDEN_KEYS = [
  "prompt",
  "promptText",
  "body",
  "content",
  "messages",
  "document",
  "documents",
  "rawText",
  "redactedText",
  "secret",
  "secrets",
  "apiKey",
  "token",
  "draftText",
  "findings",
  "matchedPreview",
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

describe("Velum capability id", () => {
  it("matches a registered capability with moduleId=velum and tier=local-core", () => {
    const cap = getCapabilityById(VELUM_CAPABILITY_ID);
    expect(cap).toBeDefined();
    expect(cap!.moduleId).toBe("velum");
    expect(cap!.tier).toBe("local-core");
    expect(cap!.velumGated).toBe(false);
  });
});

describe("buildVelumCapabilityDecisionReceiptInput", () => {
  it("returns a ActivityLog-compatible input with capability metadata", () => {
    const input = buildVelumCapabilityDecisionReceiptInput({
      createdAt: 1000,
      reviewCompleted: true,
    });
    expect(input.module).toBe("velum");
    expect(input.action).toBe("capability.decision");
    expect(input.modelUsed).toBe(false);
    expect(input.title).toContain(VELUM_CAPABILITY_ID);

    const meta = input.metadata!;
    expect(meta.capabilityId).toBe(VELUM_CAPABILITY_ID);
    expect(meta.moduleId).toBe("velum");
    expect(meta.capabilityTier).toBe("local-core");
    expect(meta.capabilityState).toBe("LOCAL_READY");
    expect(meta.providerMode).toBe("local");
    expect(meta.localAttemptAllowed).toBe(true);
    expect(meta.cloudAllowed).toBe(false);
    expect(meta.requiresCloudConsent).toBe(false);
    expect(meta.requiresVelumReview).toBe(false);
  });

  it("does not include reviewed text, draft text, or finding previews", () => {
    const input = buildVelumCapabilityDecisionReceiptInput({
      createdAt: 1,
      reviewCompleted: true,
    });
    assertNoForbiddenKeysDeep(input);
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain("findings");
    expect(serialized).not.toContain("matchedPreview");
  });

  it("produces the same structure regardless of reviewCompleted (Velum is local-core with no reqs)", () => {
    const before = buildVelumCapabilityDecisionReceiptInput({
      createdAt: 1,
      reviewCompleted: false,
    });
    const after = buildVelumCapabilityDecisionReceiptInput({
      createdAt: 1,
      reviewCompleted: true,
    });
    expect(after.metadata!.capabilityState).toBe(before.metadata!.capabilityState);
    expect(after.metadata!.providerMode).toBe(before.metadata!.providerMode);
  });
});

describe("recordVelumCapabilityDecisionReceipt", () => {
  it("writes only via the supplied ActivityLog storage and returns a receipt", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    const receipt = recordVelumCapabilityDecisionReceipt(storage, {
      createdAt: 50,
      receiptId: "velum-cap-1",
      reviewCompleted: true,
    });
    expect(receipt).not.toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0][0]).toContain("activity-log");
    expect(receipt!.metadata!.capabilityId).toBe(VELUM_CAPABILITY_ID);
    expect(receipt!.module).toBe("velum");
    expect(receipt!.localOnly).toBe(true);
    expect(receipt!.cloudUsed).toBe(false);
    expect(receipt!.modelUsed).toBe(false);
  });

  it("returns null gracefully when storage throws (does not propagate)", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
      setItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    };
    expect(() =>
      recordVelumCapabilityDecisionReceipt(storage, { createdAt: 1 }),
    ).not.toThrow();
  });

  it("does not include reviewed text from a completed review in the persisted receipt", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    const sensitive =
      "email me@example.com api_key=ABCDEFGH12345678 ghp_abcdefghijklmnopqrstuvwxyz";
    // Sanity: the deterministic reviewer DOES surface findings for that text.
    const result = reviewVelumText(sensitive);
    expect(result.findings.length).toBeGreaterThan(0);

    recordVelumCapabilityDecisionReceipt(storage, {
      createdAt: 2,
      reviewCompleted: true,
    });
    const written = data.get(storage.setItem.mock.calls[0][0])!;
    expect(written).not.toContain("me@example.com");
    expect(written).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
    expect(written).not.toContain("ABCDEFGH12345678");
    expect(written).not.toContain("matchedPreview");
  });
});

describe("Velum capability receipt — purity and existing flow preserved", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("velum capability receipt attempted a network call");
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
    buildVelumCapabilityDecisionReceiptInput({ createdAt: 1 });
    recordVelumCapabilityDecisionReceipt(storage, { createdAt: 2 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("existing Velum content receipts (review, handoff, redaction) still build correctly", () => {
    const result = reviewVelumText("nothing notable");
    expect(buildVelumReviewReceipt(result).module).toBe("velum");
    expect(buildVelumHandoffFromChatReceipt().module).toBe("velum");
    expect(buildVelumRedactionCreatedReceipt().module).toBe("velum");
  });
});
