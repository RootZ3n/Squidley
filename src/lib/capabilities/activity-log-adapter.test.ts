import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAPABILITY_DECISION_TABULARIUM_ACTION,
  capabilityDecisionToActivityReceiptInput,
  createCapabilityDecisionActivityReceipt,
  moduleIdToActivityModule,
} from "./activity-log-adapter";
import {
  createCapabilityBlockedReceipt,
  createCapabilityCloudAllowedReceipt,
  createCapabilityDecisionReceipt,
  createCapabilityEscalationOfferedReceipt,
  type CapabilityDecisionReceiptEvent,
} from "./receipts";
import {
  resolveCapabilityRuntime,
  resolveCapabilityRuntimeForId,
  type CapabilityRuntimeInput,
} from "./runtime";
import { createActivityReceipt } from "@/lib/activity-log/receipts";

const baseContext: Omit<CapabilityRuntimeInput, "capabilityId"> = {
  availableLocalProfiles: [],
  availableCloudProfiles: [],
  cloudUnlocked: false,
  cloudConsentGranted: false,
  velumReviewPassed: false,
};

function localReadyEvent(): CapabilityDecisionReceiptEvent {
  const decision = resolveCapabilityRuntime({
    capabilityId: "chat:chat.basic",
    ...baseContext,
    availableLocalProfiles: [
      { providerId: "ollama", capabilityProfile: "chat" },
    ],
  });
  return createCapabilityDecisionReceipt(decision, {
    createdAt: 1000,
    providerId: "ollama",
    modelId: "llama3.1:8b",
  });
}

function cloudRequiredPendingEvent(): CapabilityDecisionReceiptEvent {
  const decision = resolveCapabilityRuntimeForId(
    "workshop:workshop.multi-file-build",
    baseContext,
  );
  return createCapabilityEscalationOfferedReceipt(decision, { createdAt: 2000 });
}

function cloudAllowedEvent(): CapabilityDecisionReceiptEvent {
  const decision = resolveCapabilityRuntimeForId(
    "workshop:workshop.multi-file-build",
    {
      ...baseContext,
      cloudUnlocked: true,
      cloudConsentGranted: true,
      velumReviewPassed: true,
      availableCloudProfiles: [
        { providerId: "future-cloud-agent", capabilityProfile: "tool-use" },
      ],
    },
  );
  return createCapabilityCloudAllowedReceipt(decision, {
    createdAt: 3000,
    providerId: "future-cloud-agent",
    modelId: "future-agent-v1",
  });
}

function blockedEvent(): CapabilityDecisionReceiptEvent {
  const decision = resolveCapabilityRuntimeForId(
    "archelon:archelon.local-memory",
    baseContext,
  );
  return createCapabilityBlockedReceipt(decision, { createdAt: 4000 });
}

function moreInputEvent(): CapabilityDecisionReceiptEvent {
  const decision = resolveCapabilityRuntimeForId(
    "more-input:notebook.local-storage",
    baseContext,
  );
  return createCapabilityDecisionReceipt(decision, { createdAt: 5000 });
}

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

describe("capability tabularium adapter — module mapping", () => {
  it("maps known canonical ActivityLog modules straight through", () => {
    for (const id of [
      "chat",
      "velum",
      "notebook",
      "vision",
      "workshop",
      "insights",
      "settings",
      "system",
    ] as const) {
      expect(moduleIdToActivityModule(id)).toBe(id);
    }
  });

  it("maps more-input to notebook (its canonical owner)", () => {
    expect(moduleIdToActivityModule("more-input")).toBe("notebook");
  });

  it("maps locked / future modules without a ActivityLog slot to system", () => {
    for (const id of [
      "archelon",
      "tabularium",
      "legatus",
      "probatio",
      "imperium",
      "imaginanium",
    ]) {
      expect(moduleIdToActivityModule(id)).toBe("system");
    }
  });
});

describe("capability tabularium adapter — preserves required fields", () => {
  it("preserves capabilityId, moduleId, tier, state, providerMode, providerId, modelId, flags, escalationReason, createdAt", () => {
    const event = cloudRequiredPendingEvent();
    expect(event.escalationReason).toBeTruthy();

    const input = capabilityDecisionToActivityReceiptInput(event);
    expect(input.createdAt).toBe(event.createdAt);
    expect(input.action).toBe(CAPABILITY_DECISION_TABULARIUM_ACTION);
    expect(input.title).toContain(event.capabilityId);

    const meta = input.metadata!;
    expect(meta.capabilityId).toBe(event.capabilityId);
    expect(meta.moduleId).toBe(event.moduleId);
    expect(meta.capabilityTier).toBe(event.tier);
    expect(meta.capabilityState).toBe(event.state);
    expect(meta.providerMode).toBe(event.providerMode);
    expect(meta.cloudAllowed).toBe(event.cloudAllowed);
    expect(meta.localAttemptAllowed).toBe(event.localAttemptAllowed);
    expect(meta.requiresCloudConsent).toBe(event.requiresCloudConsent);
    expect(meta.requiresVelumReview).toBe(event.requiresVelumReview);
    expect(meta.escalationReason).toBe(event.escalationReason);
  });

  it("preserves providerId and modelId when provided", () => {
    const event = cloudAllowedEvent();
    const input = capabilityDecisionToActivityReceiptInput(event);
    expect(input.metadata!.providerId).toBe("future-cloud-agent");
    expect(input.metadata!.modelId).toBe("future-agent-v1");
  });

  it("summarizes honestMessage and reasons safely without raw bodies", () => {
    const event = localReadyEvent();
    const input = capabilityDecisionToActivityReceiptInput(event);
    expect(input.summary.toLowerCase()).toContain("local ready");
    expect(input.summary).toContain(event.honestMessage);
  });

  it("joins reasons into a single metadata string when present", () => {
    const event = cloudRequiredPendingEvent();
    expect(event.reasons.length).toBeGreaterThan(0);
    const input = capabilityDecisionToActivityReceiptInput(event);
    const reasons = input.metadata!.reasons;
    expect(typeof reasons).toBe("string");
    for (const reason of event.reasons) {
      // Sanitizer truncates to 80 chars per metadata value, so check a short prefix.
      const probe = reason.slice(0, 24);
      expect(String(reasons)).toContain(probe);
    }
  });

  it("omits escalationReason metadata when the event has none", () => {
    const event = localReadyEvent();
    expect(event.escalationReason).toBeUndefined();
    const input = capabilityDecisionToActivityReceiptInput(event);
    expect("escalationReason" in input.metadata!).toBe(false);
  });

  it("uses summary prefix matching the runtime state", () => {
    expect(
      capabilityDecisionToActivityReceiptInput(localReadyEvent()).summary,
    ).toMatch(/^Local ready/);
    expect(
      capabilityDecisionToActivityReceiptInput(cloudRequiredPendingEvent()).summary,
    ).toMatch(/^Cloud required/);
    expect(
      capabilityDecisionToActivityReceiptInput(blockedEvent()).summary,
    ).toMatch(/^Blocked/);
  });
});

describe("capability tabularium adapter — passes through createActivityReceipt", () => {
  it("produces a ActivityReceipt with localOnly=true, cloudUsed=false, modelUsed=false", () => {
    const event = localReadyEvent();
    const receipt = createCapabilityDecisionActivityReceipt(event, {
      receiptId: "fixed-id-1",
    });
    expect(receipt.id).toBe("fixed-id-1");
    expect(receipt.localOnly).toBe(true);
    expect(receipt.cloudUsed).toBe(false);
    expect(receipt.modelUsed).toBe(false);
    expect(receipt.toolsUsed).toBe(false);
    expect(receipt.action).toBe(CAPABILITY_DECISION_TABULARIUM_ACTION);
    expect(receipt.module).toBe("chat");
  });

  it("the adapter input is accepted by createActivityReceipt directly", () => {
    const input = capabilityDecisionToActivityReceiptInput(cloudRequiredPendingEvent(), {
      receiptId: "fixed-id-2",
    });
    const direct = createActivityReceipt(input);
    const viaHelper = createCapabilityDecisionActivityReceipt(
      cloudRequiredPendingEvent(),
      { receiptId: "fixed-id-2" },
    );
    expect(direct.title).toBe(viaHelper.title);
    expect(direct.summary).toBe(viaHelper.summary);
    expect(direct.metadata).toEqual(viaHelper.metadata);
  });

  it("maps more-input events to module=notebook on the resulting receipt", () => {
    const receipt = createCapabilityDecisionActivityReceipt(moreInputEvent(), {
      receiptId: "fixed-id-3",
    });
    expect(receipt.module).toBe("notebook");
    expect(receipt.metadata!.moduleId).toBe("more-input");
  });

  it("maps locked/future capability events to module=system but keeps original moduleId in metadata", () => {
    const receipt = createCapabilityDecisionActivityReceipt(blockedEvent(), {
      receiptId: "fixed-id-4",
    });
    expect(receipt.module).toBe("system");
    expect(receipt.metadata!.moduleId).toBe("archelon");
  });
});

describe("capability tabularium adapter — safety boundary", () => {
  it("contains no prompt/body/content/document/secret/token fields anywhere in the receipt", () => {
    for (const event of [
      localReadyEvent(),
      cloudRequiredPendingEvent(),
      cloudAllowedEvent(),
      blockedEvent(),
      moreInputEvent(),
    ]) {
      const input = capabilityDecisionToActivityReceiptInput(event);
      assertNoForbiddenKeysDeep(input);
      const receipt = createCapabilityDecisionActivityReceipt(event, {
        receiptId: "safety-check",
      });
      assertNoForbiddenKeysDeep(receipt);
    }
  });
});

describe("capability tabularium adapter — purity", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;
  let originalLocalStorage: PropertyDescriptor | undefined;
  let setItemSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;
  let removeItemSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("tabularium adapter attempted a network call");
    });
    (globalThis as unknown as { fetch: typeof globalThis.fetch }).fetch =
      fetchSpy as unknown as typeof globalThis.fetch;

    originalLocalStorage = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    setItemSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("tabularium adapter attempted to write localStorage");
    });
    removeItemSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("tabularium adapter attempted to remove from localStorage");
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: setItemSpy,
        removeItem: removeItemSpy,
        clear: () => {
          throw new Error("tabularium adapter attempted to clear localStorage");
        },
        key: () => null,
        length: 0,
      },
    });
  });

  afterEach(() => {
    if (originalFetch) {
      (globalThis as unknown as { fetch: typeof globalThis.fetch }).fetch =
        originalFetch;
    }
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    } else {
      delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    }
  });

  it("does not call fetch and does not write to localStorage", () => {
    for (const event of [
      localReadyEvent(),
      cloudRequiredPendingEvent(),
      cloudAllowedEvent(),
      blockedEvent(),
      moreInputEvent(),
    ]) {
      capabilityDecisionToActivityReceiptInput(event);
      createCapabilityDecisionActivityReceipt(event, { receiptId: "purity-x" });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });
});

describe("capability tabularium adapter — worst-case metadata", () => {
  it("preserves all 13 capability decision metadata fields, including providerId and modelId", () => {
    // Build a synthetic event with every optional field populated. This is the
    // "worst case" referenced in the prior caveat — make sure modelId no longer
    // gets dropped now that the ActivityLog metadata cap is widened.
    const event: CapabilityDecisionReceiptEvent = {
      type: "capability.decision",
      capabilityId: "synthetic:cap.worstcase",
      moduleId: "chat",
      tier: "cloud-required",
      state: "CLOUD_REQUIRED",
      localAttemptAllowed: false,
      cloudAllowed: false,
      requiresCloudConsent: true,
      requiresVelumReview: true,
      honestMessage: "Cloud capability required for this synthetic test.",
      reasons: ["consent missing", "velum missing", "cloud profile missing"],
      escalationReason: "consent missing; velum missing",
      providerMode: "none",
      providerId: "future-cloud-agent",
      modelId: "future-agent-v1",
      createdAt: 9999,
    };

    const receipt = createCapabilityDecisionActivityReceipt(event, {
      receiptId: "worst-case",
    });
    const meta = receipt.metadata!;

    const expectedKeys = [
      "capabilityId",
      "moduleId",
      "capabilityTier",
      "capabilityState",
      "providerMode",
      "cloudAllowed",
      "localAttemptAllowed",
      "requiresCloudConsent",
      "requiresVelumReview",
      "escalationReason",
      "reasons",
      "providerId",
      "modelId",
    ];
    for (const key of expectedKeys) {
      expect(key in meta, `metadata.${key} should survive cap`).toBe(true);
    }
    expect(meta.providerId).toBe("future-cloud-agent");
    expect(meta.modelId).toBe("future-agent-v1");
  });
});

describe("capability tabularium adapter — does not mutate the source event", () => {
  it("snapshots the event before adapter and verifies equality after", () => {
    const event = cloudRequiredPendingEvent();
    const snapshot = JSON.parse(JSON.stringify(event));
    capabilityDecisionToActivityReceiptInput(event);
    createCapabilityDecisionActivityReceipt(event, { receiptId: "no-mutate" });
    expect(JSON.parse(JSON.stringify(event))).toEqual(snapshot);
  });
});
