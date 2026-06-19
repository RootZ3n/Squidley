import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_ESCALATION_OFFER_ACTION,
  CLOUD_ESCALATION_OFFER_TYPE,
  cloudEscalationOfferToActivityReceiptInput,
  createCloudEscalationOfferReceiptEvent,
  createCloudEscalationOfferActivityReceipt,
  recordCloudEscalationOfferReceipt,
} from "./cloudEscalationReceipts";
import {
  createCloudEscalationPacket,
  isCloudEscalationActionable,
  type CloudEscalationPacket,
} from "./cloudEscalation";
import { resolveCapabilityRuntimeForId, type CapabilityRuntimeInput } from "./runtime";
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

function cloudRequiredPacket(): CloudEscalationPacket {
  const decision = resolveCapabilityRuntimeForId(
    "fabrica:fabrica.multi-file-build",
    BASE_CONTEXT,
  );
  return createCloudEscalationPacket(decision, {
    createdAt: 1000,
    id: "esc-cr-1",
    dataCategories: ["code", "user-message"],
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
    id: "esc-bl-1",
  })!;
}

function cloudRequiredWithVelumPacket(): CloudEscalationPacket {
  const decision = resolveCapabilityRuntimeForId(
    "fabrica:fabrica.multi-file-build",
    BASE_CONTEXT,
  );
  return createCloudEscalationPacket(decision, {
    createdAt: 3000,
    id: "esc-v-1",
    velumReviewPassed: true,
  })!;
}

function deniedPacket(): CloudEscalationPacket {
  const decision = resolveCapabilityRuntimeForId(
    "fabrica:fabrica.multi-file-build",
    BASE_CONTEXT,
  );
  return createCloudEscalationPacket(decision, {
    createdAt: 4000,
    id: "esc-denied-1",
    consentState: "denied",
  })!;
}

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
  "summaryText",
  "noteText",
  "userText",
  "assistantText",
  "codeText",
  "imageData",
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

// ---------------------------------------------------------------------------
// Event creation
// ---------------------------------------------------------------------------

describe("createCloudEscalationOfferReceiptEvent", () => {
  it("preserves packet fields in event", () => {
    const packet = cloudRequiredPacket();
    const event = createCloudEscalationOfferReceiptEvent(packet);

    expect(event.type).toBe(CLOUD_ESCALATION_OFFER_TYPE);
    expect(event.type).toBe("cloud-escalation.offer");
    expect(event.escalationPacketId).toBe(packet.id);
    expect(event.capabilityId).toBe(packet.capabilityId);
    expect(event.moduleId).toBe(packet.moduleId);
    expect(event.tier).toBe(packet.tier);
    expect(event.state).toBe(packet.state);
    expect(event.reason).toBe(packet.reason);
    expect(event.beginnerExplanation).toBe(packet.beginnerExplanation);
    expect(event.requiresConsent).toBe(packet.requiresConsent);
    expect(event.consentState).toBe(packet.consentState);
    expect(event.requiresVelumReview).toBe(packet.requiresVelumReview);
    expect(event.velumReviewPassed).toBe(packet.velumReviewPassed);
    expect(event.nothingSentYet).toBe(true);
    expect(event.createdAt).toBe(packet.createdAt);
  });

  it("actionable reflects isCloudEscalationActionable", () => {
    const actionable = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    expect(actionable.actionable).toBe(true);

    const notActionable = createCloudEscalationOfferReceiptEvent(deniedPacket());
    expect(notActionable.actionable).toBe(false);

    const blocked = createCloudEscalationOfferReceiptEvent(blockedPacket());
    expect(blocked.actionable).toBe(false);
  });

  it("dataCategories are preserved", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    expect(event.dataCategories).toEqual(["code", "user-message"]);
  });

  it("providerProfilesNeeded are serialized safely", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    expect(event.providerProfilesNeeded.length).toBeGreaterThan(0);
    expect(event.providerProfilesNeeded[0]).toBe("future-cloud-agent:tool-use");
  });

  it("consentState is preserved", () => {
    expect(createCloudEscalationOfferReceiptEvent(cloudRequiredPacket()).consentState).toBe("required");
    expect(createCloudEscalationOfferReceiptEvent(deniedPacket()).consentState).toBe("denied");
    expect(createCloudEscalationOfferReceiptEvent(blockedPacket()).consentState).toBe("blocked");
  });

  it("requiresVelumReview/velumReviewPassed are preserved", () => {
    const withVelum = createCloudEscalationOfferReceiptEvent(cloudRequiredWithVelumPacket());
    expect(typeof withVelum.requiresVelumReview).toBe("boolean");
    expect(withVelum.velumReviewPassed).toBe(true);
  });

  it("blockedReasons are preserved for blocked packets", () => {
    const event = createCloudEscalationOfferReceiptEvent(blockedPacket());
    expect(event.blockedReasons.length).toBeGreaterThan(0);
  });

  it("allows createdAt override", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket(), {
      createdAt: 9999,
    });
    expect(event.createdAt).toBe(9999);
  });
});

// ---------------------------------------------------------------------------
// ActivityLog adapter
// ---------------------------------------------------------------------------

describe("cloudEscalationOfferToActivityReceiptInput", () => {
  it("uses action cloud-escalation.offer", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    const input = cloudEscalationOfferToActivityReceiptInput(event);
    expect(input.action).toBe(CLOUD_ESCALATION_OFFER_ACTION);
    expect(input.action).toBe("cloud-escalation.offer");
  });

  it("title contains capabilityId", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    const input = cloudEscalationOfferToActivityReceiptInput(event);
    expect(input.title).toContain(event.capabilityId);
  });

  it("summary explicitly says nothing has been sent", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    const input = cloudEscalationOfferToActivityReceiptInput(event);
    expect(input.summary!.toLowerCase()).toContain("nothing has been sent");
  });

  it("summary mentions consent state", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    const input = cloudEscalationOfferToActivityReceiptInput(event);
    expect(input.summary!.toLowerCase()).toContain("consent");
  });

  it("summary mentions Velum when required", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredWithVelumPacket());
    const input = cloudEscalationOfferToActivityReceiptInput(event);
    expect(input.summary!.toLowerCase()).toContain("velum");
  });

  it("modelUsed is false", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    const input = cloudEscalationOfferToActivityReceiptInput(event);
    expect(input.modelUsed).toBe(false);
  });

  it("metadata stays within ActivityLog cap", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    const input = cloudEscalationOfferToActivityReceiptInput(event);
    const keys = Object.keys(input.metadata!);
    expect(keys.length).toBeLessThanOrEqual(ACTIVITY_LOG_MAX_METADATA_ENTRIES);
  });

  it("metadata includes key audit fields", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    const input = cloudEscalationOfferToActivityReceiptInput(event);
    const meta = input.metadata!;
    expect(meta.escalationPacketId).toBe("esc-cr-1");
    expect(meta.capabilityId).toBeDefined();
    expect(meta.moduleId).toBeDefined();
    expect(meta.capabilityTier).toBeDefined();
    expect(meta.capabilityState).toBeDefined();
    expect(meta.consentState).toBe("required");
    expect(meta.requiresConsent).toBe(true);
    expect(meta.nothingSentYet).toBe(true);
    expect(meta.actionable).toBe(true);
    expect(meta.dataCategories).toBe("code, user-message");
  });

  it("metadata includes providerProfilesNeeded when present", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    const input = cloudEscalationOfferToActivityReceiptInput(event);
    expect(input.metadata!.providerProfilesNeeded).toBe("future-cloud-agent:tool-use");
  });

  it("metadata includes blockedReasons for blocked packets", () => {
    const event = createCloudEscalationOfferReceiptEvent(blockedPacket());
    const input = cloudEscalationOfferToActivityReceiptInput(event);
    expect(input.metadata!.blockedReasons).toBeDefined();
  });

  it("passes through receiptId and status options", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    const input = cloudEscalationOfferToActivityReceiptInput(event, {
      receiptId: "custom-1",
      status: "succeeded",
    });
    expect(input.id).toBe("custom-1");
    expect(input.status).toBe("succeeded");
  });
});

describe("createCloudEscalationOfferActivityReceipt", () => {
  it("creates a valid ActivityReceipt", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    const receipt = createCloudEscalationOfferActivityReceipt(event);
    expect(receipt.localOnly).toBe(true);
    expect(receipt.cloudUsed).toBe(false);
    expect(receipt.action).toBe("cloud-escalation.offer");
  });
});

// ---------------------------------------------------------------------------
// Record helper
// ---------------------------------------------------------------------------

describe("recordCloudEscalationOfferReceipt", () => {
  it("writes only through supplied storage", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    const receipt = recordCloudEscalationOfferReceipt(
      storage,
      cloudRequiredPacket(),
    );
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
      recordCloudEscalationOfferReceipt(storage, cloudRequiredPacket()),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Safety: forbidden content keys
// ---------------------------------------------------------------------------

describe("forbidden content keys are absent", () => {
  it("event has no forbidden keys", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    assertNoForbiddenKeysDeep(event as unknown as Record<string, unknown>);
  });

  it("ActivityLog input has no forbidden keys", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    const input = cloudEscalationOfferToActivityReceiptInput(event);
    assertNoForbiddenKeysDeep(input.metadata as unknown as Record<string, unknown>);
  });

  it("ActivityLog receipt has no forbidden keys in metadata", () => {
    const event = createCloudEscalationOfferReceiptEvent(cloudRequiredPacket());
    const receipt = createCloudEscalationOfferActivityReceipt(event);
    if (receipt.metadata) {
      assertNoForbiddenKeysDeep(receipt.metadata as unknown as Record<string, unknown>);
    }
  });
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe("cloud escalation receipt helpers — purity", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("escalation receipt attempted a network call");
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
    const packet = cloudRequiredPacket();
    createCloudEscalationOfferReceiptEvent(packet);
    const event = createCloudEscalationOfferReceiptEvent(packet);
    cloudEscalationOfferToActivityReceiptInput(event);
    createCloudEscalationOfferActivityReceipt(event);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no localStorage writes in pure helpers", () => {
    const source = createCloudEscalationOfferReceiptEvent.toString();
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });
});
