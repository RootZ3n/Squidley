import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_CONSENT_ACTIONS,
  CLOUD_CONSENT_EVENT_TYPE,
  cloudConsentToActivityReceiptInput,
  createCloudConsentReceiptEvent,
  createCloudConsentActivityReceipt,
  recordCloudConsentReceipt,
  type CloudConsentDecision,
} from "./cloudConsentReceipts";
import {
  createCloudEscalationPacket,
  isCloudEscalationActionable,
  type CloudEscalationPacket,
} from "./cloudEscalation";
import {
  decideCapabilityRuntime,
  resolveCapabilityRuntimeForId,
  type CapabilityRuntimeInput,
} from "./runtime";
import type { Capability } from "./contracts";
import { ACTIVITY_LOG_MAX_METADATA_ENTRIES } from "@/lib/activity-log/receipts";

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
  // cloud-optional with local requirements unmet -> CLOUD_OPTIONAL, actionable
  const cap: Capability = {
    id: "synthetic:consent-test",
    moduleId: "fabrica",
    displayName: "Consent test",
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
    id: "esc-act-1",
    dataCategories: ["code", "user-message"],
  })!;
}

function velumGatedActionablePacket(velumPassed: boolean): CloudEscalationPacket {
  const cap: Capability = {
    id: "synthetic:velum-consent-test",
    moduleId: "fabrica",
    displayName: "Velum consent test",
    beginnerDescription: "fixture",
    tier: "cloud-optional",
    localRequirements: [{ providerId: "ollama", capabilityProfile: "chat" }],
    cloudRequirements: [{ providerId: "future-cloud-chat", capabilityProfile: "chat" }],
    honestMessages: {},
    receiptActions: "none",
    velumGated: true,
  };
  const decision = decideCapabilityRuntime(cap, {
    capabilityId: cap.id,
    ...BASE_CONTEXT,
    availableCloudProfiles: [{ providerId: "future-cloud-chat", capabilityProfile: "chat" }],
  });
  return createCloudEscalationPacket(decision, {
    createdAt: 2000,
    id: "esc-velum-1",
    velumReviewPassed: velumPassed,
  })!;
}

function blockedPacket(): CloudEscalationPacket {
  const decision = resolveCapabilityRuntimeForId(
    "archelon:archelon.local-memory",
    BASE_CONTEXT,
  );
  return createCloudEscalationPacket(decision, {
    allowBlockedPacket: true,
    createdAt: 3000,
    id: "esc-bl-1",
  })!;
}

function deniedPacket(): CloudEscalationPacket {
  const cap: Capability = {
    id: "synthetic:denied-test",
    moduleId: "fabrica",
    displayName: "Denied test",
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
    createdAt: 4000,
    id: "esc-denied-1",
    consentState: "denied",
  })!;
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
// Event creation — per decision type
// ---------------------------------------------------------------------------

describe("createCloudConsentReceiptEvent", () => {
  it("granted event uses action cloud-consent.granted", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "granted", { createdAt: 5000 });
    expect(event.type).toBe(CLOUD_CONSENT_EVENT_TYPE);
    expect(event.type).toBe("cloud-consent.decision");
    expect(event.action).toBe(CLOUD_CONSENT_ACTIONS.granted);
    expect(event.action).toBe("cloud-consent.granted");
    expect(event.decision).toBe("granted");
  });

  it("denied event uses action cloud-consent.denied", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "denied", { createdAt: 5001 });
    expect(event.action).toBe("cloud-consent.denied");
    expect(event.decision).toBe("denied");
  });

  it("cancelled event uses action cloud-consent.cancelled", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "cancelled", { createdAt: 5002 });
    expect(event.action).toBe("cloud-consent.cancelled");
    expect(event.decision).toBe("cancelled");
  });

  it("blocked event uses action cloud-consent.blocked", () => {
    const event = createCloudConsentReceiptEvent(blockedPacket(), "blocked", { createdAt: 5003 });
    expect(event.action).toBe("cloud-consent.blocked");
    expect(event.decision).toBe("blocked");
  });

  it("nothingSentYet is always true", () => {
    for (const decision of ["granted", "denied", "cancelled"] as const) {
      const event = createCloudConsentReceiptEvent(actionablePacket(), decision, { createdAt: 1 });
      expect(event.nothingSentYet).toBe(true);
    }
    const blockedEvent = createCloudConsentReceiptEvent(blockedPacket(), "blocked", { createdAt: 1 });
    expect(blockedEvent.nothingSentYet).toBe(true);
  });

  it("consentStateBefore reflects packet, consentStateAfter reflects decision", () => {
    const packet = actionablePacket();
    const event = createCloudConsentReceiptEvent(packet, "granted", { createdAt: 1 });
    expect(event.consentStateBefore).toBe(packet.consentState);
    expect(event.consentStateAfter).toBe("granted");
  });

  it("denied decision sets consentStateAfter to denied", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "denied", { createdAt: 1 });
    expect(event.consentStateAfter).toBe("denied");
  });

  it("cancelled decision sets consentStateAfter to required", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "cancelled", { createdAt: 1 });
    expect(event.consentStateAfter).toBe("required");
  });

  it("blocked decision sets consentStateAfter to blocked", () => {
    const event = createCloudConsentReceiptEvent(blockedPacket(), "blocked", { createdAt: 1 });
    expect(event.consentStateAfter).toBe("blocked");
  });

  it("preserves escalationPacketId, capabilityId, moduleId", () => {
    const packet = actionablePacket();
    const event = createCloudConsentReceiptEvent(packet, "denied", { createdAt: 1 });
    expect(event.escalationPacketId).toBe(packet.id);
    expect(event.capabilityId).toBe(packet.capabilityId);
    expect(event.moduleId).toBe(packet.moduleId);
  });

  it("preserves dataCategories from packet", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "denied", { createdAt: 1 });
    expect(event.dataCategories).toEqual(["code", "user-message"]);
  });

  it("preserves providerProfilesNeeded from packet", () => {
    const packet = actionablePacket();
    const event = createCloudConsentReceiptEvent(packet, "denied", { createdAt: 1 });
    // providerProfilesNeeded serializes the packet's providerProfilesNeeded
    expect(event.providerProfilesNeeded.length).toBe(packet.providerProfilesNeeded.length);
  });

  it("preserves requiresVelumReview and velumReviewPassed", () => {
    const event = createCloudConsentReceiptEvent(
      velumGatedActionablePacket(true),
      "granted",
      { createdAt: 1 },
    );
    expect(event.requiresVelumReview).toBe(true);
    expect(event.velumReviewPassed).toBe(true);
  });

  it("throws when granting on non-actionable packet", () => {
    expect(() =>
      createCloudConsentReceiptEvent(deniedPacket(), "granted", { createdAt: 1 }),
    ).toThrow(/non-actionable/);
  });

  it("throws when granting on blocked packet", () => {
    expect(() =>
      createCloudConsentReceiptEvent(blockedPacket(), "granted", { createdAt: 1 }),
    ).toThrow(/non-actionable/);
  });

  it("throws when granting with Velum review required but not passed", () => {
    expect(() =>
      createCloudConsentReceiptEvent(
        velumGatedActionablePacket(false),
        "granted",
        { createdAt: 1 },
      ),
    ).toThrow(/Velum/);
  });

  it("allows denied on non-actionable packet", () => {
    expect(() =>
      createCloudConsentReceiptEvent(deniedPacket(), "denied", { createdAt: 1 }),
    ).not.toThrow();
  });

  it("allows cancelled on any packet", () => {
    expect(() =>
      createCloudConsentReceiptEvent(blockedPacket(), "cancelled", { createdAt: 1 }),
    ).not.toThrow();
  });

  it("accepts custom reason via options", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "denied", {
      createdAt: 1,
      reason: "User chose local.",
    });
    expect(event.reason).toBe("User chose local.");
  });
});

// ---------------------------------------------------------------------------
// ActivityLog adapter
// ---------------------------------------------------------------------------

describe("cloudConsentToActivityReceiptInput", () => {
  it("uses the correct action per decision", () => {
    for (const decision of ["granted", "denied", "cancelled"] as const) {
      const event = createCloudConsentReceiptEvent(actionablePacket(), decision, { createdAt: 1 });
      const input = cloudConsentToActivityReceiptInput(event);
      expect(input.action).toBe(`cloud-consent.${decision}`);
    }
  });

  it("title contains decision and capabilityId", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "granted", { createdAt: 1 });
    const input = cloudConsentToActivityReceiptInput(event);
    expect(input.title).toContain("granted");
    expect(input.title).toContain(event.capabilityId);
  });

  it("granted summary says nothing has been sent yet", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "granted", { createdAt: 1 });
    const input = cloudConsentToActivityReceiptInput(event);
    expect(input.summary!.toLowerCase()).toContain("nothing has been sent");
  });

  it("denied summary says keep local", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "denied", { createdAt: 1 });
    const input = cloudConsentToActivityReceiptInput(event);
    expect(input.summary!.toLowerCase()).toContain("denied");
  });

  it("cancelled summary says nothing has been sent", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "cancelled", { createdAt: 1 });
    const input = cloudConsentToActivityReceiptInput(event);
    expect(input.summary!.toLowerCase()).toContain("nothing has been sent");
  });

  it("blocked summary says nothing has been sent", () => {
    const event = createCloudConsentReceiptEvent(blockedPacket(), "blocked", { createdAt: 1 });
    const input = cloudConsentToActivityReceiptInput(event);
    expect(input.summary!.toLowerCase()).toContain("nothing has been sent");
  });

  it("modelUsed is false", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "granted", { createdAt: 1 });
    const input = cloudConsentToActivityReceiptInput(event);
    expect(input.modelUsed).toBe(false);
  });

  it("metadata stays within ActivityLog cap", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "granted", { createdAt: 1 });
    const input = cloudConsentToActivityReceiptInput(event);
    expect(Object.keys(input.metadata!).length).toBeLessThanOrEqual(ACTIVITY_LOG_MAX_METADATA_ENTRIES);
  });

  it("metadata includes key audit fields", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "granted", { createdAt: 1 });
    const input = cloudConsentToActivityReceiptInput(event);
    const meta = input.metadata!;
    expect(meta.decision).toBe("granted");
    expect(meta.escalationPacketId).toBeDefined();
    expect(meta.capabilityId).toBeDefined();
    expect(meta.consentStateBefore).toBeDefined();
    expect(meta.consentStateAfter).toBe("granted");
    expect(meta.nothingSentYet).toBe(true);
  });

  it("passes through receiptId and status options", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "denied", { createdAt: 1 });
    const input = cloudConsentToActivityReceiptInput(event, {
      receiptId: "custom-1",
      status: "succeeded",
    });
    expect(input.id).toBe("custom-1");
    expect(input.status).toBe("succeeded");
  });
});

describe("createCloudConsentActivityReceipt", () => {
  it("creates a valid ActivityReceipt", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "granted", { createdAt: 1 });
    const receipt = createCloudConsentActivityReceipt(event);
    expect(receipt.localOnly).toBe(true);
    expect(receipt.cloudUsed).toBe(false);
    expect(receipt.action).toBe("cloud-consent.granted");
  });
});

// ---------------------------------------------------------------------------
// Record helper
// ---------------------------------------------------------------------------

describe("recordCloudConsentReceipt", () => {
  it("writes only through supplied storage", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    const receipt = recordCloudConsentReceipt(storage, actionablePacket(), "granted");
    expect(receipt).not.toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0][0]).toContain("tabularium");
    expect(receipt!.localOnly).toBe(true);
    expect(receipt!.cloudUsed).toBe(false);
  });

  it("handles storage failure gracefully", () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error("unavailable"); }),
      setItem: vi.fn(() => { throw new Error("unavailable"); }),
    };
    expect(() =>
      recordCloudConsentReceipt(storage, actionablePacket(), "denied"),
    ).not.toThrow();
  });

  it("throws on invalid grant before writing", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    expect(() =>
      recordCloudConsentReceipt(storage, blockedPacket(), "granted"),
    ).toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Forbidden content keys
// ---------------------------------------------------------------------------

describe("forbidden content keys are absent", () => {
  it("event has no forbidden keys", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "granted", { createdAt: 1 });
    assertNoForbiddenKeysDeep(event as unknown as Record<string, unknown>);
  });

  it("ActivityLog input metadata has no forbidden keys", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "denied", { createdAt: 1 });
    const input = cloudConsentToActivityReceiptInput(event);
    assertNoForbiddenKeysDeep(input.metadata as unknown as Record<string, unknown>);
  });

  it("persisted receipt metadata has no forbidden keys", () => {
    const event = createCloudConsentReceiptEvent(actionablePacket(), "granted", { createdAt: 1 });
    const receipt = createCloudConsentActivityReceipt(event);
    if (receipt.metadata) {
      assertNoForbiddenKeysDeep(receipt.metadata as unknown as Record<string, unknown>);
    }
  });
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe("cloud consent receipt helpers — purity", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("consent receipt attempted a network call");
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
    const packet = actionablePacket();
    createCloudConsentReceiptEvent(packet, "granted", { createdAt: 1 });
    createCloudConsentReceiptEvent(packet, "denied", { createdAt: 2 });
    createCloudConsentReceiptEvent(packet, "cancelled", { createdAt: 3 });
    const event = createCloudConsentReceiptEvent(packet, "granted", { createdAt: 4 });
    cloudConsentToActivityReceiptInput(event);
    createCloudConsentActivityReceipt(event);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no localStorage writes in pure helpers", () => {
    const source = createCloudConsentReceiptEvent.toString();
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });
});
