import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canOfferCloudEscalation,
  cloudEscalationPacketToReceiptMetadata,
  createCloudEscalationPacket,
  isCloudEscalationActionable,
} from "./cloudEscalation";
import {
  decideCapabilityRuntime,
  resolveCapabilityRuntimeForId,
  type CapabilityRuntimeDecision,
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

function cloudRequiredDecision(): CapabilityRuntimeDecision {
  return resolveCapabilityRuntimeForId(
    "workshop:workshop.multi-file-build",
    BASE_CONTEXT,
  );
}

function cloudRequiredWithCloudDecision(): CapabilityRuntimeDecision {
  return resolveCapabilityRuntimeForId("workshop:workshop.multi-file-build", {
    ...BASE_CONTEXT,
    cloudUnlocked: true,
    cloudConsentGranted: true,
    velumReviewPassed: true,
    availableCloudProfiles: [
      { providerId: "future-cloud-agent", capabilityProfile: "tool-use" },
    ],
  });
}

function localReadyDecision(): CapabilityRuntimeDecision {
  return resolveCapabilityRuntimeForId("chat:chat.basic", {
    ...BASE_CONTEXT,
    availableLocalProfiles: [
      { providerId: "ollama", capabilityProfile: "chat" },
    ],
  });
}

function localLimitedDecision(): CapabilityRuntimeDecision {
  return resolveCapabilityRuntimeForId("chat:chat.advanced-planning", {
    ...BASE_CONTEXT,
    availableLocalProfiles: [
      { providerId: "ollama", capabilityProfile: "chat", paramsB: 8 },
    ],
  });
}

function blockedDecision(): CapabilityRuntimeDecision {
  return resolveCapabilityRuntimeForId(
    "archelon:archelon.local-memory",
    BASE_CONTEXT,
  );
}

// Synthetic cloud-optional capability to exercise LOCAL_LIMITED with cloud-optional tier
function cloudOptionalLocalLimitedDecision(): CapabilityRuntimeDecision {
  const cap: Capability = {
    id: "synthetic:cloud.optional.test",
    moduleId: "chat",
    displayName: "Synthetic cloud-optional",
    beginnerDescription: "fixture",
    tier: "cloud-optional",
    localRequirements: [
      { providerId: "ollama", capabilityProfile: "chat" },
    ],
    cloudRequirements: [
      { providerId: "future-cloud-chat", capabilityProfile: "chat" },
    ],
    honestMessages: {},
    receiptActions: "none",
    velumGated: true,
  };
  return decideCapabilityRuntime(cap, {
    capabilityId: cap.id,
    ...BASE_CONTEXT,
    availableLocalProfiles: [
      { providerId: "ollama", capabilityProfile: "chat" },
    ],
  });
}

// Synthetic cloud-optional with no local path -> CLOUD_OPTIONAL state
function cloudOptionalNoLocalDecision(): CapabilityRuntimeDecision {
  const cap: Capability = {
    id: "synthetic:cloud.optional.nolocal",
    moduleId: "chat",
    displayName: "Synthetic cloud-optional (no local)",
    beginnerDescription: "fixture",
    tier: "cloud-optional",
    localRequirements: [
      { providerId: "ollama", capabilityProfile: "chat" },
    ],
    cloudRequirements: [
      { providerId: "future-cloud-chat", capabilityProfile: "chat" },
    ],
    honestMessages: {},
    receiptActions: "none",
    velumGated: true,
  };
  return decideCapabilityRuntime(cap, {
    capabilityId: cap.id,
    ...BASE_CONTEXT,
    availableCloudProfiles: [
      { providerId: "future-cloud-chat", capabilityProfile: "chat" },
    ],
  });
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
// canOfferCloudEscalation
// ---------------------------------------------------------------------------

describe("canOfferCloudEscalation", () => {
  it("returns true for CLOUD_REQUIRED", () => {
    expect(canOfferCloudEscalation(cloudRequiredDecision())).toBe(true);
  });

  it("returns true for CLOUD_OPTIONAL", () => {
    expect(canOfferCloudEscalation(cloudOptionalNoLocalDecision())).toBe(true);
  });

  it("returns false for LOCAL_READY", () => {
    expect(canOfferCloudEscalation(localReadyDecision())).toBe(false);
  });

  it("returns false for BLOCKED", () => {
    expect(canOfferCloudEscalation(blockedDecision())).toBe(false);
  });

  it("returns false for LOCAL_LIMITED by default", () => {
    expect(canOfferCloudEscalation(localLimitedDecision())).toBe(false);
  });

  it("returns true for LOCAL_LIMITED with cloud-optional tier when explicitly allowed", () => {
    expect(
      canOfferCloudEscalation(cloudOptionalLocalLimitedDecision(), {
        allowLocalLimitedEscalation: true,
      }),
    ).toBe(true);
  });

  it("returns false for LOCAL_LIMITED with non-cloud-optional tier even when flag is set", () => {
    // localLimitedDecision comes from chat.advanced-planning which is local-limited tier
    expect(
      canOfferCloudEscalation(localLimitedDecision(), {
        allowLocalLimitedEscalation: true,
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createCloudEscalationPacket
// ---------------------------------------------------------------------------

describe("createCloudEscalationPacket", () => {
  it("CLOUD_REQUIRED creates an offerable packet", () => {
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), {
      createdAt: 1000,
      id: "esc-1",
    });
    expect(packet).not.toBeNull();
    expect(packet!.state).toBe("CLOUD_REQUIRED");
    expect(packet!.requiresConsent).toBe(true);
    expect(packet!.consentState).toBe("required");
    expect(packet!.nothingSentYet).toBe(true);
    expect(isCloudEscalationActionable(packet!)).toBe(true);
  });

  it("CLOUD_OPTIONAL creates an offerable packet", () => {
    const packet = createCloudEscalationPacket(cloudOptionalNoLocalDecision(), {
      createdAt: 1001,
    });
    expect(packet).not.toBeNull();
    expect(packet!.state).toBe("CLOUD_OPTIONAL");
    expect(packet!.requiresConsent).toBe(true);
    expect(packet!.nothingSentYet).toBe(true);
  });

  it("LOCAL_READY returns null by default", () => {
    expect(createCloudEscalationPacket(localReadyDecision())).toBeNull();
  });

  it("LOCAL_LIMITED returns null by default", () => {
    expect(createCloudEscalationPacket(localLimitedDecision())).toBeNull();
  });

  it("LOCAL_LIMITED with cloud-optional tier returns a packet when allowed", () => {
    const packet = createCloudEscalationPacket(
      cloudOptionalLocalLimitedDecision(),
      { allowLocalLimitedEscalation: true, createdAt: 1002 },
    );
    expect(packet).not.toBeNull();
    expect(packet!.state).toBe("LOCAL_LIMITED");
    expect(packet!.requiresConsent).toBe(true);
  });

  it("BLOCKED returns null by default", () => {
    expect(createCloudEscalationPacket(blockedDecision())).toBeNull();
  });

  it("BLOCKED returns a non-offerable packet with allowBlockedPacket", () => {
    const packet = createCloudEscalationPacket(blockedDecision(), {
      allowBlockedPacket: true,
      createdAt: 1003,
    });
    expect(packet).not.toBeNull();
    expect(packet!.state).toBe("BLOCKED");
    expect(packet!.consentState).toBe("blocked");
    expect(isCloudEscalationActionable(packet!)).toBe(false);
  });

  it("nothingSentYet is always true", () => {
    for (const decision of [
      cloudRequiredDecision(),
      cloudOptionalNoLocalDecision(),
      cloudRequiredWithCloudDecision(),
    ]) {
      const packet = createCloudEscalationPacket(decision, { createdAt: 1 });
      expect(packet).not.toBeNull();
      expect(packet!.nothingSentYet).toBe(true);
    }
  });

  it("velumGated capability requires Velum review", () => {
    const packet = createCloudEscalationPacket(cloudOptionalNoLocalDecision(), {
      createdAt: 1,
    });
    expect(packet!.requiresVelumReview).toBe(true);
    expect(packet!.velumReviewPassed).toBe(false);
  });

  it("velumReviewPassed can be set via options", () => {
    const packet = createCloudEscalationPacket(cloudOptionalNoLocalDecision(), {
      createdAt: 1,
      velumReviewPassed: true,
    });
    expect(packet!.velumReviewPassed).toBe(true);
  });

  it("packet with consent denied is not actionable", () => {
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), {
      createdAt: 1,
      consentState: "denied",
    });
    expect(packet).not.toBeNull();
    expect(isCloudEscalationActionable(packet!)).toBe(false);
  });

  it("packet with consent blocked is not actionable", () => {
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), {
      createdAt: 1,
      consentState: "blocked",
    });
    expect(isCloudEscalationActionable(packet!)).toBe(false);
  });

  it("providerProfilesNeeded copies cloudRequirements without probing", () => {
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), {
      createdAt: 1,
    });
    expect(packet!.providerProfilesNeeded.length).toBeGreaterThan(0);
    expect(packet!.providerProfilesNeeded[0]).toMatchObject({
      providerId: "future-cloud-agent",
      capabilityProfile: "tool-use",
    });
  });

  it("dataCategories default to unknown when omitted", () => {
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), {
      createdAt: 1,
    });
    expect(packet!.dataCategories).toEqual(["unknown"]);
  });

  it("custom dataCategories are preserved", () => {
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), {
      createdAt: 1,
      dataCategories: ["user-message", "code"],
    });
    expect(packet!.dataCategories).toEqual(["user-message", "code"]);
  });

  it("beginnerExplanation has a meaningful default", () => {
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), {
      createdAt: 1,
    });
    expect(packet!.beginnerExplanation.length).toBeGreaterThan(20);
    expect(packet!.beginnerExplanation.toLowerCase()).toContain("nothing has been sent");
  });

  it("custom beginnerExplanation overrides default", () => {
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), {
      createdAt: 1,
      beginnerExplanation: "Custom explanation.",
    });
    expect(packet!.beginnerExplanation).toBe("Custom explanation.");
  });

  it("receiptHint is copied from decision", () => {
    const decision = cloudRequiredDecision();
    const packet = createCloudEscalationPacket(decision, { createdAt: 1 });
    expect(packet!.receiptHint.capabilityId).toBe(decision.receiptHint.capabilityId);
    expect(packet!.receiptHint.state).toBe(decision.receiptHint.state);
  });
});

// ---------------------------------------------------------------------------
// Receipt metadata
// ---------------------------------------------------------------------------

describe("cloudEscalationPacketToReceiptMetadata", () => {
  it("includes safe metadata fields", () => {
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), {
      createdAt: 1,
      id: "esc-test-1",
    })!;
    const meta = cloudEscalationPacketToReceiptMetadata(packet);

    expect(meta.escalationPacketId).toBe("esc-test-1");
    expect(meta.capabilityId).toBe(packet.capabilityId);
    expect(meta.moduleId).toBe(packet.moduleId);
    expect(meta.capabilityTier).toBe(packet.tier);
    expect(meta.capabilityState).toBe(packet.state);
    expect(meta.consentState).toBe("required");
    expect(meta.requiresConsent).toBe(true);
    expect(meta.requiresVelumReview).toBe(packet.requiresVelumReview);
    expect(meta.velumReviewPassed).toBe(false);
    expect(meta.nothingSentYet).toBe(true);
    expect(meta.dataCategories).toBe("unknown");
    expect(typeof meta.reason).toBe("string");
  });

  it("includes blockedReasons for blocked packets", () => {
    const packet = createCloudEscalationPacket(blockedDecision(), {
      allowBlockedPacket: true,
      createdAt: 1,
    })!;
    const meta = cloudEscalationPacketToReceiptMetadata(packet);
    expect(meta.blockedReasons).toBeDefined();
    expect(typeof meta.blockedReasons).toBe("string");
    expect((meta.blockedReasons as string).length).toBeGreaterThan(0);
  });

  it("omits blockedReasons for non-blocked packets", () => {
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), {
      createdAt: 1,
    })!;
    const meta = cloudEscalationPacketToReceiptMetadata(packet);
    expect(meta.blockedReasons).toBeUndefined();
  });

  it("forbidden content keys are absent recursively", () => {
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), {
      createdAt: 1,
      dataCategories: ["user-message", "code"],
    })!;
    const meta = cloudEscalationPacketToReceiptMetadata(packet);
    assertNoForbiddenKeysDeep(meta);
  });

  it("forbidden content keys are absent in packet itself", () => {
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), {
      createdAt: 1,
    })!;
    assertNoForbiddenKeysDeep(packet as unknown as Record<string, unknown>);
  });
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe("cloud escalation helpers — purity", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("cloudEscalation attempted a network call");
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
    canOfferCloudEscalation(cloudRequiredDecision());
    createCloudEscalationPacket(cloudRequiredDecision(), { createdAt: 1 });
    createCloudEscalationPacket(cloudOptionalNoLocalDecision(), { createdAt: 2 });
    createCloudEscalationPacket(blockedDecision(), { allowBlockedPacket: true, createdAt: 3 });
    createCloudEscalationPacket(localReadyDecision());
    const packet = createCloudEscalationPacket(cloudRequiredDecision(), { createdAt: 4 })!;
    cloudEscalationPacketToReceiptMetadata(packet);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no localStorage writes occur", () => {
    const source = createCloudEscalationPacket.toString();
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });
});
