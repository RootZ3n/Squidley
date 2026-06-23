import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FABRICA_VELUM_HANDOFF_ACTION,
  FABRICA_VELUM_REVIEW_COMPLETED_ACTION,
  buildWorkshopVelumHandoffPreview,
  buildWorkshopVelumHandoffPreparedReceiptInput,
  recordWorkshopVelumHandoffPreparedReceipt,
  buildWorkshopVelumReviewCompletedPreview,
  buildWorkshopVelumReviewCompletedReceiptInput,
  recordWorkshopVelumReviewCompletedReceipt,
} from "./velumHandoff";
import { FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID } from "./cloudPreflight";

// ---------------------------------------------------------------------------
// Forbidden keys — must never appear in receipts or previews
// ---------------------------------------------------------------------------

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
  "code",
  "codeContent",
  "userMessage",
  "systemPrompt",
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

function mockStorage(): Pick<Storage, "getItem" | "setItem"> {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
}

// ---------------------------------------------------------------------------
// buildWorkshopVelumHandoffPreview
// ---------------------------------------------------------------------------

describe("buildWorkshopVelumHandoffPreview", () => {
  it("returns nothingSentYet=true and cloudUsed=false", () => {
    const preview = buildWorkshopVelumHandoffPreview();
    expect(preview.nothingSentYet).toBe(true);
    expect(preview.cloudUsed).toBe(false);
  });

  it("includes the workshop:workshop.multi-file-build capability id", () => {
    const preview = buildWorkshopVelumHandoffPreview();
    expect(preview.capabilityId).toBe(FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID);
    expect(preview.capabilityId).toBe("workshop:workshop.multi-file-build");
  });

  it("requires Velum review and has not passed it", () => {
    const preview = buildWorkshopVelumHandoffPreview();
    expect(preview.requiresVelumReview).toBe(true);
    expect(preview.velumReviewPassed).toBe(false);
  });

  it("sourceModule is workshop", () => {
    const preview = buildWorkshopVelumHandoffPreview();
    expect(preview.sourceModule).toBe("workshop");
  });

  it("dataCategories includes metadata-only", () => {
    const preview = buildWorkshopVelumHandoffPreview();
    expect(preview.dataCategories).toContain("metadata-only");
  });

  it("contains no forbidden keys", () => {
    const preview = buildWorkshopVelumHandoffPreview();
    assertNoForbiddenKeysDeep(preview);
  });

  it("does not contain raw prompt/code/user/document fields in serialized form", () => {
    const serialized = JSON.stringify(buildWorkshopVelumHandoffPreview());
    expect(serialized).not.toContain('"prompt"');
    expect(serialized).not.toContain('"rawText"');
    expect(serialized).not.toContain('"draftText"');
    expect(serialized).not.toContain('"codeContent"');
  });
});

// ---------------------------------------------------------------------------
// buildWorkshopVelumHandoffPreparedReceiptInput
// ---------------------------------------------------------------------------

describe("buildWorkshopVelumHandoffPreparedReceiptInput", () => {
  it("returns a ActivityLog-compatible input with correct module and action", () => {
    const input = buildWorkshopVelumHandoffPreparedReceiptInput();
    expect(input.module).toBe("workshop");
    expect(input.action).toBe(FABRICA_VELUM_HANDOFF_ACTION);
    expect(input.action).toBe("velum-handoff.preparation");
    expect(input.modelUsed).toBe(false);
    expect(input.status).toBe("info");
  });

  it("includes capabilityId in metadata", () => {
    const input = buildWorkshopVelumHandoffPreparedReceiptInput();
    expect(input.metadata!.capabilityId).toBe(
      FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID,
    );
  });

  it("metadata records nothingSentYet=true and cloudUsed=false", () => {
    const input = buildWorkshopVelumHandoffPreparedReceiptInput();
    expect(input.metadata!.nothingSentYet).toBe(true);
    expect(input.metadata!.cloudUsed).toBe(false);
  });

  it("metadata records requiresVelumReview=true and velumReviewPassed=false", () => {
    const input = buildWorkshopVelumHandoffPreparedReceiptInput();
    expect(input.metadata!.requiresVelumReview).toBe(true);
    expect(input.metadata!.velumReviewPassed).toBe(false);
  });

  it("summary says nothing has been sent", () => {
    const input = buildWorkshopVelumHandoffPreparedReceiptInput();
    expect(input.summary).toContain("Nothing has been sent");
  });

  it("does not contain forbidden keys", () => {
    const input = buildWorkshopVelumHandoffPreparedReceiptInput();
    assertNoForbiddenKeysDeep(input);
  });

  it("accepts optional createdAt and receiptId", () => {
    const input = buildWorkshopVelumHandoffPreparedReceiptInput({
      createdAt: 12345,
      receiptId: "test-receipt-1",
    });
    expect(input.createdAt).toBe(12345);
    expect(input.id).toBe("test-receipt-1");
  });
});

// ---------------------------------------------------------------------------
// recordWorkshopVelumHandoffPreparedReceipt
// ---------------------------------------------------------------------------

describe("recordWorkshopVelumHandoffPreparedReceipt", () => {
  it("writes only via the supplied storage and returns a receipt", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    const receipt = recordWorkshopVelumHandoffPreparedReceipt(storage);
    expect(receipt).not.toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0][0]).toContain("activity-log");
    expect(receipt!.module).toBe("workshop");
    expect(receipt!.localOnly).toBe(true);
    expect(receipt!.cloudUsed).toBe(false);
    expect(receipt!.modelUsed).toBe(false);
  });

  it("does not throw when storage throws (receipt is still built locally)", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
      setItem: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    };
    expect(() =>
      recordWorkshopVelumHandoffPreparedReceipt(storage),
    ).not.toThrow();
    // Receipt is still returned (built in memory) even if storage failed
    const result = recordWorkshopVelumHandoffPreparedReceipt(storage);
    expect(result).not.toBeNull();
    expect(result!.module).toBe("workshop");
    expect(result!.localOnly).toBe(true);
    expect(result!.cloudUsed).toBe(false);
  });

  it("receipt metadata includes capabilityId for chain grouping", () => {
    const storage = mockStorage();
    const receipt = recordWorkshopVelumHandoffPreparedReceipt(storage);
    expect(receipt!.metadata!.capabilityId).toBe(
      FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID,
    );
  });

  it("does not store raw prompt/code/user/document content in persisted data", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    recordWorkshopVelumHandoffPreparedReceipt(storage, { createdAt: 1 });
    const written = data.get(storage.setItem.mock.calls[0][0])!;
    // Ensure no typical user content patterns leak
    expect(written).not.toContain('"prompt"');
    expect(written).not.toContain('"rawText"');
    expect(written).not.toContain('"draftText"');
    expect(written).not.toContain('"codeContent"');
    expect(written).not.toContain('"userMessage"');
  });
});

// ---------------------------------------------------------------------------
// Purity — no fetch/provider/model/cloud calls
// ---------------------------------------------------------------------------

describe("Workshop Velum handoff preparation — purity", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCalled: boolean;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalled = false;
    globalThis.fetch = (() => {
      fetchCalled = true;
      return Promise.reject(new Error("fetch should not be called"));
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("no fetch/provider/model/cloud calls occur when building preview", () => {
    buildWorkshopVelumHandoffPreview();
    expect(fetchCalled).toBe(false);
  });

  it("no fetch/provider/model/cloud calls occur when building receipt input", () => {
    buildWorkshopVelumHandoffPreparedReceiptInput();
    expect(fetchCalled).toBe(false);
  });

  it("no fetch/provider/model/cloud calls occur when recording receipt", () => {
    const storage = mockStorage();
    recordWorkshopVelumHandoffPreparedReceipt(storage);
    expect(fetchCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Does not mark Velum as passed or enable cloud consent
// ---------------------------------------------------------------------------

describe("Workshop Velum handoff preparation — does not unlock gates", () => {
  it("preview does not mark velumReviewPassed=true", () => {
    const preview = buildWorkshopVelumHandoffPreview();
    expect(preview.velumReviewPassed).toBe(false);
  });

  it("receipt metadata does not mark velumReviewPassed=true", () => {
    const input = buildWorkshopVelumHandoffPreparedReceiptInput();
    expect(input.metadata!.velumReviewPassed).toBe(false);
  });

  it("receipt does not contain cloud consent actions", () => {
    const input = buildWorkshopVelumHandoffPreparedReceiptInput();
    expect(input.action).not.toContain("cloud-consent");
    expect(input.action).not.toContain("cloud-escalation");
  });
});

// ---------------------------------------------------------------------------
// buildWorkshopVelumReviewCompletedPreview
// ---------------------------------------------------------------------------

describe("buildWorkshopVelumReviewCompletedPreview", () => {
  it("returns velumReviewPassed=true", () => {
    const preview = buildWorkshopVelumReviewCompletedPreview();
    expect(preview.velumReviewPassed).toBe(true);
  });

  it("returns nothingSentYet=true and cloudUsed=false", () => {
    const preview = buildWorkshopVelumReviewCompletedPreview();
    expect(preview.nothingSentYet).toBe(true);
    expect(preview.cloudUsed).toBe(false);
  });

  it("includes the workshop capability id", () => {
    const preview = buildWorkshopVelumReviewCompletedPreview();
    expect(preview.capabilityId).toBe(FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID);
  });

  it("sourceModule is workshop", () => {
    const preview = buildWorkshopVelumReviewCompletedPreview();
    expect(preview.sourceModule).toBe("workshop");
  });

  it("still requires Velum review", () => {
    const preview = buildWorkshopVelumReviewCompletedPreview();
    expect(preview.requiresVelumReview).toBe(true);
  });

  it("contains no forbidden keys", () => {
    assertNoForbiddenKeysDeep(buildWorkshopVelumReviewCompletedPreview());
  });
});

// ---------------------------------------------------------------------------
// buildWorkshopVelumReviewCompletedReceiptInput
// ---------------------------------------------------------------------------

describe("buildWorkshopVelumReviewCompletedReceiptInput", () => {
  it("uses the velum-review.completed action", () => {
    const input = buildWorkshopVelumReviewCompletedReceiptInput();
    expect(input.action).toBe(FABRICA_VELUM_REVIEW_COMPLETED_ACTION);
    expect(input.action).toBe("velum-review.completed");
  });

  it("module is workshop and modelUsed is false", () => {
    const input = buildWorkshopVelumReviewCompletedReceiptInput();
    expect(input.module).toBe("workshop");
    expect(input.modelUsed).toBe(false);
  });

  it("metadata records velumReviewPassed=true", () => {
    const input = buildWorkshopVelumReviewCompletedReceiptInput();
    expect(input.metadata!.velumReviewPassed).toBe(true);
  });

  it("metadata records nothingSentYet=true and cloudUsed=false", () => {
    const input = buildWorkshopVelumReviewCompletedReceiptInput();
    expect(input.metadata!.nothingSentYet).toBe(true);
    expect(input.metadata!.cloudUsed).toBe(false);
  });

  it("summary says nothing has been sent", () => {
    const input = buildWorkshopVelumReviewCompletedReceiptInput();
    expect(input.summary).toContain("Nothing has been sent");
  });

  it("does not contain forbidden keys", () => {
    assertNoForbiddenKeysDeep(buildWorkshopVelumReviewCompletedReceiptInput());
  });

  it("accepts optional createdAt and receiptId", () => {
    const input = buildWorkshopVelumReviewCompletedReceiptInput({
      createdAt: 99999,
      receiptId: "review-complete-1",
    });
    expect(input.createdAt).toBe(99999);
    expect(input.id).toBe("review-complete-1");
  });
});

// ---------------------------------------------------------------------------
// recordWorkshopVelumReviewCompletedReceipt
// ---------------------------------------------------------------------------

describe("recordWorkshopVelumReviewCompletedReceipt", () => {
  it("writes to storage and returns a receipt with velumReviewPassed=true in metadata", () => {
    const storage = mockStorage();
    const receipt = recordWorkshopVelumReviewCompletedReceipt(storage);
    expect(receipt).not.toBeNull();
    expect(receipt!.module).toBe("workshop");
    expect(receipt!.localOnly).toBe(true);
    expect(receipt!.cloudUsed).toBe(false);
    expect(receipt!.modelUsed).toBe(false);
    expect(receipt!.metadata!.velumReviewPassed).toBe(true);
  });

  it("does not throw when storage throws", () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error("storage unavailable"); }),
      setItem: vi.fn(() => { throw new Error("storage unavailable"); }),
    };
    expect(() => recordWorkshopVelumReviewCompletedReceipt(storage)).not.toThrow();
    const result = recordWorkshopVelumReviewCompletedReceipt(storage);
    expect(result).not.toBeNull();
    expect(result!.module).toBe("workshop");
    expect(result!.localOnly).toBe(true);
    expect(result!.cloudUsed).toBe(false);
  });

  it("does not store raw prompt/code/user/document content in persisted data", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    recordWorkshopVelumReviewCompletedReceipt(storage, { createdAt: 1 });
    const written = data.get(storage.setItem.mock.calls[0][0])!;
    expect(written).not.toContain('"prompt"');
    expect(written).not.toContain('"rawText"');
    expect(written).not.toContain('"draftText"');
    expect(written).not.toContain('"codeContent"');
    expect(written).not.toContain('"userMessage"');
  });

  it("receipt metadata includes capabilityId for chain grouping", () => {
    const storage = mockStorage();
    const receipt = recordWorkshopVelumReviewCompletedReceipt(storage);
    expect(receipt!.metadata!.capabilityId).toBe(
      FABRICA_MULTI_FILE_BUILD_CAPABILITY_ID,
    );
  });
});

// ---------------------------------------------------------------------------
// Handoff prep still records velumReviewPassed=false
// ---------------------------------------------------------------------------

describe("Workshop Velum — prep vs review completion distinction", () => {
  it("handoff prep records velumReviewPassed=false", () => {
    const input = buildWorkshopVelumHandoffPreparedReceiptInput();
    expect(input.metadata!.velumReviewPassed).toBe(false);
  });

  it("review completion records velumReviewPassed=true", () => {
    const input = buildWorkshopVelumReviewCompletedReceiptInput();
    expect(input.metadata!.velumReviewPassed).toBe(true);
  });

  it("review completion does not use a cloud consent action", () => {
    const input = buildWorkshopVelumReviewCompletedReceiptInput();
    expect(input.action).not.toContain("cloud-consent");
    expect(input.action).not.toContain("cloud-escalation");
  });

  it("review completion does not enable cloud execution", () => {
    const preview = buildWorkshopVelumReviewCompletedPreview();
    expect(preview.cloudUsed).toBe(false);
    expect(preview.nothingSentYet).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Purity — review completion helpers must not call fetch
// ---------------------------------------------------------------------------

describe("Workshop Velum review completion — purity", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCalled: boolean;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalled = false;
    globalThis.fetch = (() => {
      fetchCalled = true;
      return Promise.reject(new Error("fetch should not be called"));
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("no fetch calls when building review completed preview", () => {
    buildWorkshopVelumReviewCompletedPreview();
    expect(fetchCalled).toBe(false);
  });

  it("no fetch calls when building review completed receipt input", () => {
    buildWorkshopVelumReviewCompletedReceiptInput();
    expect(fetchCalled).toBe(false);
  });

  it("no fetch calls when recording review completed receipt", () => {
    const storage = mockStorage();
    recordWorkshopVelumReviewCompletedReceipt(storage);
    expect(fetchCalled).toBe(false);
  });
});
