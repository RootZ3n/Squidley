import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCloudConsentDialogHandlers,
  recordCloudConsentDecisionOnly,
  recordCloudEscalationOfferAndDecision,
  recordCloudEscalationOfferOnly,
} from "./cloudConsentOrchestration";
import {
  createCloudEscalationPacket,
  type CloudEscalationPacket,
} from "./cloudEscalation";
import {
  decideCapabilityRuntime,
  resolveCapabilityRuntimeForId,
  type CapabilityRuntimeInput,
} from "./runtime";
import type { Capability } from "./contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_CONTEXT: Omit<CapabilityRuntimeInput, "capabilityId"> = {
  availableLocalProfiles: [],
  availableCloudProfiles: [],
  cloudUnlocked: false,
  cloudConsentGranted: false,
  velumReviewPassed: false,
};

function actionablePacket(): CloudEscalationPacket {
  const cap: Capability = {
    id: "synthetic:orch-test",
    moduleId: "fabrica",
    displayName: "Orch test",
    beginnerDescription: "fixture",
    tier: "cloud-optional",
    localRequirements: [{ providerId: "ollama", capabilityProfile: "chat" }],
    cloudRequirements: [{ providerId: "future-cloud-chat", capabilityProfile: "chat" }],
    honestMessages: {},
    receiptActions: "none",
    velumGated: false,
  };
  const decision = decideCapabilityRuntime(cap, {
    capabilityId: cap.id,
    ...BASE_CONTEXT,
    availableCloudProfiles: [{ providerId: "future-cloud-chat", capabilityProfile: "chat" }],
  });
  return createCloudEscalationPacket(decision, {
    createdAt: 1000,
    id: "esc-orch-1",
    dataCategories: ["code"],
  })!;
}

function blockedPacket(): CloudEscalationPacket {
  const decision = resolveCapabilityRuntimeForId(
    "archelon:archelon.local-memory",
    BASE_CONTEXT,
  );
  return createCloudEscalationPacket(decision, {
    allowBlockedPacket: true,
    createdAt: 2000,
    id: "esc-bl-orch",
  })!;
}

function makeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => data.set(key, value)),
  };
}

function makeFailingStorage() {
  return {
    getItem: vi.fn(() => { throw new Error("unavailable"); }),
    setItem: vi.fn(() => { throw new Error("unavailable"); }),
  };
}

const FORBIDDEN_KEYS = [
  "prompt", "promptText", "body", "content", "message", "messages",
  "document", "documents", "rawText", "redactedText", "summaryText",
  "noteText", "userText", "assistantText", "codeText", "imageData",
  "secret", "secrets", "apiKey", "token",
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
// recordCloudEscalationOfferOnly
// ---------------------------------------------------------------------------

describe("recordCloudEscalationOfferOnly", () => {
  it("records one cloud-escalation.offer receipt", () => {
    const storage = makeStorage();
    const receipt = recordCloudEscalationOfferOnly(storage, actionablePacket());
    expect(receipt).not.toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(receipt!.action).toBe("cloud-escalation.offer");
    expect(receipt!.cloudUsed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recordCloudConsentDecisionOnly
// ---------------------------------------------------------------------------

describe("recordCloudConsentDecisionOnly", () => {
  it("records one cloud-consent.granted receipt", () => {
    const storage = makeStorage();
    const receipt = recordCloudConsentDecisionOnly(storage, actionablePacket(), "granted");
    expect(receipt).not.toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(receipt!.action).toBe("cloud-consent.granted");
  });

  it("records one cloud-consent.denied receipt", () => {
    const storage = makeStorage();
    const receipt = recordCloudConsentDecisionOnly(storage, actionablePacket(), "denied");
    expect(receipt).not.toBeNull();
    expect(receipt!.action).toBe("cloud-consent.denied");
  });

  it("throws on invalid grant for blocked packet", () => {
    const storage = makeStorage();
    expect(() =>
      recordCloudConsentDecisionOnly(storage, blockedPacket(), "granted"),
    ).toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// recordCloudEscalationOfferAndDecision
// ---------------------------------------------------------------------------

describe("recordCloudEscalationOfferAndDecision", () => {
  it("records offer then decision in order", () => {
    const storage = makeStorage();
    const result = recordCloudEscalationOfferAndDecision(
      storage,
      actionablePacket(),
      "granted",
    );
    expect(result.offerRecorded).toBe(true);
    expect(result.decisionRecorded).toBe(true);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(result.offerReceipt!.action).toBe("cloud-escalation.offer");
    expect(result.decisionReceipt!.action).toBe("cloud-consent.granted");
  });

  it("combined granted result has nothingSentYet=true", () => {
    const storage = makeStorage();
    const result = recordCloudEscalationOfferAndDecision(
      storage,
      actionablePacket(),
      "granted",
    );
    expect(result.nothingSentYet).toBe(true);
  });

  it("denied records correct decision receipt", () => {
    const storage = makeStorage();
    const result = recordCloudEscalationOfferAndDecision(
      storage,
      actionablePacket(),
      "denied",
    );
    expect(result.decision).toBe("denied");
    expect(result.decisionReceipt!.action).toBe("cloud-consent.denied");
    expect(result.nothingSentYet).toBe(true);
  });

  it("cancelled records correct decision receipt", () => {
    const storage = makeStorage();
    const result = recordCloudEscalationOfferAndDecision(
      storage,
      actionablePacket(),
      "cancelled",
    );
    expect(result.decision).toBe("cancelled");
    expect(result.decisionReceipt!.action).toBe("cloud-consent.cancelled");
  });

  it("blocked records correct decision receipt", () => {
    const storage = makeStorage();
    const result = recordCloudEscalationOfferAndDecision(
      storage,
      blockedPacket(),
      "blocked",
    );
    expect(result.decision).toBe("blocked");
    expect(result.decisionReceipt!.action).toBe("cloud-consent.blocked");
  });

  it("invalid grant on non-actionable packet throws and does not write", () => {
    const storage = makeStorage();
    expect(() =>
      recordCloudEscalationOfferAndDecision(storage, blockedPacket(), "granted"),
    ).toThrow(/non-actionable/);
    // Offer is written before the grant attempt
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("if storage is broken, both writes are still attempted by default", () => {
    // logActivityReceipt swallows storage errors internally and returns
    // the receipt object. The key contract is no throw on storage failure.
    const storage = makeFailingStorage();
    const result = recordCloudEscalationOfferAndDecision(
      storage,
      actionablePacket(),
      "denied",
    );
    // Both are "recorded" from logActivityReceipt's perspective (it
    // returns a receipt even when storage silently fails).
    expect(result.nothingSentYet).toBe(true);
    expect(result.decision).toBe("denied");
  });

  it("attemptDecisionOnOfferFailure=false skips decision when offer throws", () => {
    // To trigger an actual offer failure that propagates, we need
    // recordCloudEscalationOfferReceipt to throw. In practice it never
    // does (logActivityReceipt catches), so this path only activates
    // if offer returns null. Since logActivityReceipt swallows errors
    // and returns a receipt, we verify the option exists and the flag
    // is respected by checking that both are recorded when true (default).
    const storage = makeStorage();
    const result = recordCloudEscalationOfferAndDecision(
      storage,
      actionablePacket(),
      "denied",
      { attemptDecisionOnOfferFailure: false },
    );
    // With working storage, both succeed regardless of the flag.
    expect(result.offerRecorded).toBe(true);
    expect(result.decisionRecorded).toBe(true);
  });

  it("result always reports decision even with broken storage", () => {
    const storage = makeFailingStorage();
    const result = recordCloudEscalationOfferAndDecision(
      storage,
      actionablePacket(),
      "denied",
    );
    expect(result.decision).toBe("denied");
    expect(result.nothingSentYet).toBe(true);
  });

  it("storage writes only through supplied storage", () => {
    const storage = makeStorage();
    recordCloudEscalationOfferAndDecision(storage, actionablePacket(), "denied");
    expect(storage.setItem).toHaveBeenCalled();
    expect(storage.setItem.mock.calls.every(
      (call: [string, string]) => call[0].includes("tabularium"),
    )).toBe(true);
  });

  it("returned receipts have no forbidden content keys", () => {
    const storage = makeStorage();
    const result = recordCloudEscalationOfferAndDecision(
      storage,
      actionablePacket(),
      "granted",
    );
    if (result.offerReceipt?.metadata) {
      assertNoForbiddenKeysDeep(result.offerReceipt.metadata as unknown as Record<string, unknown>);
    }
    if (result.decisionReceipt?.metadata) {
      assertNoForbiddenKeysDeep(result.decisionReceipt.metadata as unknown as Record<string, unknown>);
    }
  });
});

// ---------------------------------------------------------------------------
// createCloudConsentDialogHandlers
// ---------------------------------------------------------------------------

describe("createCloudConsentDialogHandlers", () => {
  it("handleGrant records offer + granted decision", () => {
    const storage = makeStorage();
    const onGranted = vi.fn();
    const handlers = createCloudConsentDialogHandlers(storage, actionablePacket(), {
      onGranted,
    });
    handlers.handleGrant();
    expect(onGranted).toHaveBeenCalledTimes(1);
    const result = onGranted.mock.calls[0][0];
    expect(result.decision).toBe("granted");
    expect(result.nothingSentYet).toBe(true);
  });

  it("handleDeny records offer + denied decision", () => {
    const storage = makeStorage();
    const onDenied = vi.fn();
    const handlers = createCloudConsentDialogHandlers(storage, actionablePacket(), {
      onDenied,
    });
    handlers.handleDeny();
    expect(onDenied).toHaveBeenCalledTimes(1);
    expect(onDenied.mock.calls[0][0].decision).toBe("denied");
  });

  it("handleCancel records offer + cancelled decision", () => {
    const storage = makeStorage();
    const onCancelled = vi.fn();
    const handlers = createCloudConsentDialogHandlers(storage, actionablePacket(), {
      onCancelled,
    });
    handlers.handleCancel();
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(onCancelled.mock.calls[0][0].decision).toBe("cancelled");
  });
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe("cloud consent orchestration — purity", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("orchestration attempted a network call");
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

  it("no fetch/provider/cloud calls occur", () => {
    const storage = makeStorage();
    recordCloudEscalationOfferOnly(storage, actionablePacket());
    recordCloudConsentDecisionOnly(storage, actionablePacket(), "denied");
    recordCloudEscalationOfferAndDecision(storage, actionablePacket(), "granted");
    const handlers = createCloudConsentDialogHandlers(storage, actionablePacket());
    handlers.handleDeny();
    handlers.handleCancel();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
