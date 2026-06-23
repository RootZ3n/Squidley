import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAPABILITY_DECISION_RECEIPT_TYPE,
  createCapabilityBlockedReceipt,
  createCapabilityCloudAllowedReceipt,
  createCapabilityDecisionReceipt,
  createCapabilityEscalationOfferedReceipt,
  providerModeForDecision,
} from "./receipts";
import {
  decideCapabilityRuntime,
  resolveCapabilityRuntime,
  resolveCapabilityRuntimeForId,
  type CapabilityRuntimeInput,
} from "./runtime";
import type { Capability } from "./contracts";
import { CAPABILITIES, getCapabilityById } from "./registry";

const baseContext: Omit<CapabilityRuntimeInput, "capabilityId"> = {
  availableLocalProfiles: [],
  availableCloudProfiles: [],
  cloudUnlocked: false,
  cloudConsentGranted: false,
  velumReviewPassed: false,
};

function need(id: string): Capability {
  const cap = getCapabilityById(id);
  if (!cap) throw new Error(`fixture missing capability ${id}`);
  return cap;
}

function localOnlyDecision() {
  return resolveCapabilityRuntime({
    capabilityId: "chat:chat.basic",
    ...baseContext,
    availableLocalProfiles: [
      { providerId: "ollama", capabilityProfile: "chat" },
    ],
  });
}

function cloudReadyDecision() {
  return resolveCapabilityRuntimeForId("workshop:workshop.multi-file-build", {
    ...baseContext,
    cloudUnlocked: true,
    cloudConsentGranted: true,
    velumReviewPassed: true,
    availableCloudProfiles: [
      { providerId: "future-cloud-agent", capabilityProfile: "tool-use" },
    ],
  });
}

function blockedDecision() {
  return resolveCapabilityRuntimeForId(
    "archelon:archelon.local-memory",
    baseContext,
  );
}

function cloudRequiredPendingDecision() {
  return resolveCapabilityRuntimeForId(
    "workshop:workshop.multi-file-build",
    baseContext,
  );
}

describe("capability decision receipt — basic shape", () => {
  it("emits a capability.decision event carrying capabilityId, moduleId, tier, state", () => {
    const decision = localOnlyDecision();
    const event = createCapabilityDecisionReceipt(decision, { createdAt: 1700 });
    expect(event.type).toBe(CAPABILITY_DECISION_RECEIPT_TYPE);
    expect(event.capabilityId).toBe(decision.capabilityId);
    expect(event.moduleId).toBe(decision.moduleId);
    expect(event.tier).toBe(decision.tier);
    expect(event.state).toBe(decision.state);
    expect(event.createdAt).toBe(1700);
  });

  it("preserves honestMessage and reasons from the decision", () => {
    const decision = cloudRequiredPendingDecision();
    const event = createCapabilityDecisionReceipt(decision);
    expect(event.honestMessage).toBe(decision.honestMessage);
    expect(event.reasons).toEqual(decision.reasons);
  });

  it("preserves escalationReason from receiptHint when present", () => {
    const decision = cloudRequiredPendingDecision();
    expect(decision.receiptHint.escalationReason).toBeTruthy();
    const event = createCapabilityDecisionReceipt(decision);
    expect(event.escalationReason).toBe(decision.receiptHint.escalationReason);
  });

  it("omits escalationReason field when the decision has none", () => {
    const decision = localOnlyDecision();
    expect(decision.receiptHint.escalationReason).toBeUndefined();
    const event = createCapabilityDecisionReceipt(decision);
    expect("escalationReason" in event).toBe(false);
  });

  it("createdAt is deterministic when supplied via options", () => {
    const decision = localOnlyDecision();
    const event = createCapabilityDecisionReceipt(decision, { createdAt: 42 });
    expect(event.createdAt).toBe(42);
  });

  it("createdAt falls back to Date.now() when not supplied", () => {
    const decision = localOnlyDecision();
    const before = Date.now();
    const event = createCapabilityDecisionReceipt(decision);
    const after = Date.now();
    expect(event.createdAt).toBeGreaterThanOrEqual(before);
    expect(event.createdAt).toBeLessThanOrEqual(after);
  });

  it("supports providerId, modelId, and note metadata", () => {
    const decision = localOnlyDecision();
    const event = createCapabilityDecisionReceipt(decision, {
      providerId: "ollama",
      modelId: "llama3.1:8b",
      note: "first run handshake",
      createdAt: 1,
    });
    expect(event.providerId).toBe("ollama");
    expect(event.modelId).toBe("llama3.1:8b");
    expect(event.note).toBe("first run handshake");
  });
});

describe("capability decision receipt — providerMode", () => {
  it("local when localAttemptAllowed=true and cloudAllowed=false", () => {
    const decision = localOnlyDecision();
    expect(providerModeForDecision(decision)).toBe("local");
    expect(createCapabilityDecisionReceipt(decision).providerMode).toBe("local");
  });

  it("cloud when cloudAllowed=true and localAttemptAllowed=false", () => {
    const decision = cloudReadyDecision();
    expect(decision.canAttemptLocally).toBe(false);
    expect(decision.canUseCloud).toBe(true);
    expect(providerModeForDecision(decision)).toBe("cloud");
    expect(createCapabilityDecisionReceipt(decision).providerMode).toBe("cloud");
  });

  it("mixed when both local and cloud are allowed (synthetic cloud-optional)", () => {
    const synthetic: Capability = {
      id: "synthetic:cloud.optional",
      moduleId: "chat",
      displayName: "Synthetic cloud-optional",
      beginnerDescription: "fixture only",
      tier: "cloud-optional",
      localRequirements: [
        { providerId: "ollama", capabilityProfile: "chat" },
      ],
      cloudRequirements: [
        { providerId: "future-cloud-chat", capabilityProfile: "chat" },
      ],
      honestMessages: {
        localLimited: "local available; cloud may help",
        cloudOptional: "cloud optional",
      },
      receiptActions: "none",
      velumGated: true,
    };
    const decision = decideCapabilityRuntime(synthetic, {
      capabilityId: synthetic.id,
      ...baseContext,
      availableLocalProfiles: [
        { providerId: "ollama", capabilityProfile: "chat" },
      ],
      availableCloudProfiles: [
        { providerId: "future-cloud-chat", capabilityProfile: "chat" },
      ],
      cloudUnlocked: true,
      cloudConsentGranted: true,
      velumReviewPassed: true,
    });
    expect(decision.canAttemptLocally).toBe(true);
    expect(decision.canUseCloud).toBe(true);
    expect(providerModeForDecision(decision)).toBe("mixed");
    expect(createCapabilityDecisionReceipt(decision).providerMode).toBe("mixed");
  });

  it("none when neither local nor cloud is allowed", () => {
    const decision = blockedDecision();
    expect(decision.canAttemptLocally).toBe(false);
    expect(decision.canUseCloud).toBe(false);
    expect(providerModeForDecision(decision)).toBe("none");
    expect(createCapabilityDecisionReceipt(decision).providerMode).toBe("none");
  });
});

describe("capability decision receipt — specialized helpers", () => {
  it("blocked receipt accepts a BLOCKED decision", () => {
    const decision = blockedDecision();
    const event = createCapabilityBlockedReceipt(decision, { createdAt: 1 });
    expect(event.state).toBe("BLOCKED");
  });

  it("blocked receipt throws when state is not BLOCKED", () => {
    const decision = localOnlyDecision();
    expect(() => createCapabilityBlockedReceipt(decision)).toThrow(/BLOCKED/);
  });

  it("escalation offered receipt accepts a CLOUD_REQUIRED decision waiting on consent", () => {
    const decision = cloudRequiredPendingDecision();
    expect(decision.state).toBe("CLOUD_REQUIRED");
    expect(decision.canUseCloud).toBe(false);
    const event = createCapabilityEscalationOfferedReceipt(decision);
    expect(event.state).toBe("CLOUD_REQUIRED");
    expect(event.cloudAllowed).toBe(false);
  });

  it("escalation offered receipt throws when state is not CLOUD_OPTIONAL or CLOUD_REQUIRED", () => {
    const decision = localOnlyDecision();
    expect(() => createCapabilityEscalationOfferedReceipt(decision)).toThrow(
      /CLOUD_OPTIONAL or CLOUD_REQUIRED/,
    );
  });

  it("escalation offered receipt throws when cloud is already allowed", () => {
    const decision = cloudReadyDecision();
    expect(decision.canUseCloud).toBe(true);
    expect(() => createCapabilityEscalationOfferedReceipt(decision)).toThrow(
      /cloudAllowed=false/,
    );
  });

  it("cloud allowed receipt accepts a decision where cloudAllowed=true", () => {
    const decision = cloudReadyDecision();
    const event = createCapabilityCloudAllowedReceipt(decision, { createdAt: 1 });
    expect(event.cloudAllowed).toBe(true);
    expect(event.providerMode).toBe("cloud");
  });

  it("cloud allowed receipt throws when cloud is not allowed", () => {
    const decision = cloudRequiredPendingDecision();
    expect(() => createCapabilityCloudAllowedReceipt(decision)).toThrow(
      /cloudAllowed=true/,
    );
  });
});

describe("capability decision receipt — safety boundary", () => {
  const FORBIDDEN_FIELDS = [
    "prompt",
    "promptText",
    "body",
    "content",
    "messages",
    "document",
    "documents",
    "redactedText",
    "rawText",
    "secret",
    "secrets",
    "apiKey",
    "token",
  ];

  function assertNoForbiddenFields(event: Record<string, unknown>) {
    for (const key of FORBIDDEN_FIELDS) {
      expect(key in event, `receipt must not include "${key}"`).toBe(false);
    }
  }

  it("default decision receipt does not include prompt/body/content/secret fields", () => {
    const event = createCapabilityDecisionReceipt(localOnlyDecision());
    assertNoForbiddenFields(event as unknown as Record<string, unknown>);
  });

  it("blocked, escalation, and cloud allowed receipts all stay within metadata", () => {
    const blocked = createCapabilityBlockedReceipt(blockedDecision());
    const escalation = createCapabilityEscalationOfferedReceipt(
      cloudRequiredPendingDecision(),
    );
    const cloud = createCapabilityCloudAllowedReceipt(cloudReadyDecision());
    for (const event of [blocked, escalation, cloud]) {
      assertNoForbiddenFields(event as unknown as Record<string, unknown>);
    }
  });

  it("every registered capability resolves and emits a receipt with no forbidden fields", () => {
    for (const cap of CAPABILITIES) {
      const decision = resolveCapabilityRuntimeForId(cap.id, baseContext);
      const event = createCapabilityDecisionReceipt(decision, { createdAt: 1 });
      assertNoForbiddenFields(event as unknown as Record<string, unknown>);
    }
  });
});

describe("capability decision receipt — purity", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;
  let originalLocalStorage: PropertyDescriptor | undefined;
  let setItemSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;
  let removeItemSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("receipt helpers attempted a network call");
    });
    (globalThis as unknown as { fetch: typeof globalThis.fetch }).fetch =
      fetchSpy as unknown as typeof globalThis.fetch;

    originalLocalStorage = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    setItemSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("receipt helpers attempted to write to localStorage");
    });
    removeItemSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("receipt helpers attempted to remove from localStorage");
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: setItemSpy,
        removeItem: removeItemSpy,
        clear: () => {
          throw new Error("receipt helpers attempted to clear localStorage");
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

  it("does not call fetch or write to localStorage across all helpers", () => {
    const local = localOnlyDecision();
    const blocked = blockedDecision();
    const cloudPending = cloudRequiredPendingDecision();
    const cloudAllowed = cloudReadyDecision();

    createCapabilityDecisionReceipt(local, { createdAt: 1 });
    createCapabilityBlockedReceipt(blocked, { createdAt: 1 });
    createCapabilityEscalationOfferedReceipt(cloudPending, { createdAt: 1 });
    createCapabilityCloudAllowedReceipt(cloudAllowed, { createdAt: 1 });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });
});

describe("capability decision receipt — determinism", () => {
  it("produces identical receipts for identical decisions and options", () => {
    const decision = localOnlyDecision();
    const a = createCapabilityDecisionReceipt(decision, { createdAt: 99 });
    const b = createCapabilityDecisionReceipt(decision, { createdAt: 99 });
    expect(a).toEqual(b);
  });

  it("does not mutate the input decision's reasons array", () => {
    const decision = cloudRequiredPendingDecision();
    const before = [...decision.reasons];
    const event = createCapabilityDecisionReceipt(decision);
    (event.reasons as string[]).push("mutated");
    expect(decision.reasons).toEqual(before);
  });
});
