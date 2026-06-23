import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  capabilityBadgeToneClass,
  capabilityDecisionToBadgeView,
  capabilityReceiptMetadataToBadgeView,
  capabilityStateToBadgeLabel,
  cloudConsentReceiptToBadgeView,
  cloudEscalationReceiptToBadgeView,
  gatewayPolicyReceiptToBadgeView,
  isCapabilityDecisionReceipt,
  isCloudConsentDecisionReceipt,
  isCloudEscalationOfferReceipt,
  isGatewayPolicyDecisionReceipt,
  isPromptInjectionAssessmentReceipt,
  promptInjectionReceiptToBadgeView,
  receiptToCapabilityBadgeView,
  receiptToTransparencyBadgeView,
} from "./badges";
import {
  decideCapabilityRuntime,
  resolveCapabilityRuntime,
  resolveCapabilityRuntimeForId,
  type CapabilityRuntimeInput,
} from "./runtime";
import { buildVelumCapabilityDecisionReceiptInput } from "@/lib/velum/capabilityReceipts";
import { buildChatCapabilityDecisionReceiptInput } from "@/lib/chat/capabilityReceipts";
import type { Capability } from "./contracts";

const baseContext: Omit<CapabilityRuntimeInput, "capabilityId"> = {
  availableLocalProfiles: [],
  availableCloudProfiles: [],
  cloudUnlocked: false,
  cloudConsentGranted: false,
  velumReviewPassed: false,
};

function localReadyDecision() {
  return resolveCapabilityRuntime({
    capabilityId: "chat:chat.basic",
    ...baseContext,
    availableLocalProfiles: [
      { providerId: "ollama", capabilityProfile: "chat" },
    ],
  });
}

function localLimitedDecision() {
  return resolveCapabilityRuntime({
    capabilityId: "chat:chat.advanced-planning",
    ...baseContext,
    availableLocalProfiles: [
      { providerId: "ollama", capabilityProfile: "chat", paramsB: 8 },
    ],
  });
}

function cloudRequiredPendingDecision() {
  return resolveCapabilityRuntimeForId(
    "workshop:workshop.multi-file-build",
    baseContext,
  );
}

function cloudRequiredAllowedDecision() {
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

function syntheticCloudOptional(localOk: boolean) {
  const synthetic: Capability = {
    id: "synthetic:cloud.optional.badge",
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
    honestMessages: {},
    receiptActions: "none",
    velumGated: true,
  };
  return decideCapabilityRuntime(synthetic, {
    capabilityId: synthetic.id,
    ...baseContext,
    availableLocalProfiles: localOk
      ? [{ providerId: "ollama", capabilityProfile: "chat" }]
      : [],
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

describe("capabilityStateToBadgeLabel", () => {
  it("maps each runtime state to its beginner-friendly label", () => {
    expect(capabilityStateToBadgeLabel("LOCAL_READY")).toBe("Local ready");
    expect(capabilityStateToBadgeLabel("LOCAL_LIMITED")).toBe("Local limited");
    expect(capabilityStateToBadgeLabel("CLOUD_OPTIONAL")).toBe("Cloud optional");
    expect(capabilityStateToBadgeLabel("CLOUD_REQUIRED")).toBe("Cloud required");
    expect(capabilityStateToBadgeLabel("BLOCKED")).toBe("Blocked");
  });

  it("falls back to a neutral label for unknown states", () => {
    expect(capabilityStateToBadgeLabel("nonsense")).toBe("Capability decision");
  });
});

describe("capabilityDecisionToBadgeView", () => {
  it("maps LOCAL_READY to local tone with cloudUsed=false", () => {
    const view = capabilityDecisionToBadgeView(localReadyDecision());
    expect(view.label).toBe("Local ready");
    expect(view.tone).toBe("local");
    expect(view.cloudUsed).toBe(false);
    expect(view.localAttemptAllowed).toBe(true);
    expect(view.cloudAllowed).toBe(false);
    expect(view.shortDescription.toLowerCase()).toContain("locally");
    expect(view.detail.toLowerCase()).toContain("no cloud is required");
  });

  it("maps LOCAL_LIMITED to limited tone", () => {
    const view = capabilityDecisionToBadgeView(localLimitedDecision());
    expect(view.label).toBe("Local limited");
    expect(view.tone).toBe("limited");
    expect(view.detail.toLowerCase()).toMatch(/weaker|slower|limited/);
  });

  it("maps a CLOUD_OPTIONAL state (no local path) to cloud-optional tone and notes opt-in", () => {
    // Note: a cloud-optional capability *with* a local path resolves to
    // state=LOCAL_LIMITED — that's intentional in the runtime resolver and
    // tested separately. To exercise the CLOUD_OPTIONAL state itself we
    // remove the local path.
    const view = capabilityDecisionToBadgeView(syntheticCloudOptional(false));
    expect(view.label).toBe("Cloud optional");
    expect(view.tone).toBe("cloud-optional");
    expect(view.detail.toLowerCase()).toContain("opt in");
    expect(view.cloudUsed).toBe(false);
  });

  it("a cloud-optional capability *with* a local path renders as Local limited (state=LOCAL_LIMITED)", () => {
    const view = capabilityDecisionToBadgeView(syntheticCloudOptional(true));
    expect(view.label).toBe("Local limited");
    expect(view.tone).toBe("limited");
    expect(view.cloudUsed).toBe(false);
  });

  it("maps CLOUD_REQUIRED with cloudAllowed=false and says nothing has been sent", () => {
    const view = capabilityDecisionToBadgeView(cloudRequiredPendingDecision());
    expect(view.label).toBe("Cloud required");
    expect(view.tone).toBe("cloud-required");
    expect(view.cloudAllowed).toBe(false);
    expect(view.cloudUsed).toBe(false);
    expect(view.detail.toLowerCase()).toContain("nothing has been sent");
  });

  it("CLOUD_REQUIRED with cloudAllowed=true still does not imply cloudUsed", () => {
    const view = capabilityDecisionToBadgeView(cloudRequiredAllowedDecision());
    expect(view.label).toBe("Cloud required");
    expect(view.tone).toBe("cloud-required");
    expect(view.cloudAllowed).toBe(true);
    expect(view.cloudUsed).toBe(false);
    expect(view.detail.toLowerCase()).toContain("no cloud call was made");
    expect(view.detail.toLowerCase()).toMatch(/consent was granted/);
  });

  it("maps BLOCKED to blocked tone and prefers honestMessage as detail when available", () => {
    const view = capabilityDecisionToBadgeView(blockedDecision());
    expect(view.label).toBe("Blocked");
    expect(view.tone).toBe("blocked");
    expect(view.detail.length).toBeGreaterThan(10);
  });
});

describe("capabilityReceiptMetadataToBadgeView", () => {
  it("maps Velum capability receipt metadata to local ready", () => {
    const input = buildVelumCapabilityDecisionReceiptInput({
      createdAt: 1,
      reviewCompleted: true,
    });
    const view = capabilityReceiptMetadataToBadgeView(input.metadata!);
    expect(view.label).toBe("Local ready");
    expect(view.tone).toBe("local");
    expect(view.localAttemptAllowed).toBe(true);
    expect(view.cloudAllowed).toBe(false);
    expect(view.cloudUsed).toBe(false);
  });

  it("maps Chat capability receipt metadata (with localChatReady) to local ready", () => {
    const input = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
      localChatReady: true,
      providerId: "ollama",
      modelId: "llama3.1:8b",
    });
    const view = capabilityReceiptMetadataToBadgeView(input.metadata!);
    expect(view.label).toBe("Local ready");
    expect(view.tone).toBe("local");
    expect(view.localAttemptAllowed).toBe(true);
    expect(view.cloudAllowed).toBe(false);
  });

  it("returns a neutral fallback for missing/unknown metadata without throwing", () => {
    expect(() => capabilityReceiptMetadataToBadgeView(undefined)).not.toThrow();
    expect(capabilityReceiptMetadataToBadgeView(undefined).tone).toBe("neutral");
    expect(capabilityReceiptMetadataToBadgeView(null).tone).toBe("neutral");
    expect(capabilityReceiptMetadataToBadgeView({}).tone).toBe("neutral");
    expect(
      capabilityReceiptMetadataToBadgeView({ capabilityState: "WHO_KNOWS" }).tone,
    ).toBe("neutral");
  });

  it("treats CLOUD_REQUIRED metadata with cloudAllowed=false as 'nothing has been sent'", () => {
    const view = capabilityReceiptMetadataToBadgeView({
      capabilityState: "CLOUD_REQUIRED",
      cloudAllowed: false,
      localAttemptAllowed: false,
    });
    expect(view.label).toBe("Cloud required");
    expect(view.detail.toLowerCase()).toContain("nothing has been sent");
    expect(view.cloudUsed).toBe(false);
  });

  it("never sets cloudUsed=true even when receipt metadata has providerMode=cloud and cloudAllowed=true", () => {
    const view = capabilityReceiptMetadataToBadgeView({
      capabilityState: "CLOUD_REQUIRED",
      providerMode: "cloud",
      cloudAllowed: true,
      localAttemptAllowed: false,
    });
    expect(view.cloudAllowed).toBe(true);
    expect(view.cloudUsed).toBe(false);
  });
});

describe("capability badge view — safety and purity", () => {
  it("view output never includes prompt/body/content/secret keys", () => {
    for (const view of [
      capabilityDecisionToBadgeView(localReadyDecision()),
      capabilityDecisionToBadgeView(localLimitedDecision()),
      capabilityDecisionToBadgeView(syntheticCloudOptional(true)),
      capabilityDecisionToBadgeView(syntheticCloudOptional(false)),
      capabilityDecisionToBadgeView(cloudRequiredPendingDecision()),
      capabilityDecisionToBadgeView(cloudRequiredAllowedDecision()),
      capabilityDecisionToBadgeView(blockedDecision()),
    ]) {
      assertNoForbiddenKeysDeep(view as unknown as Record<string, unknown>);
    }
  });

  describe("no fetch / no cloud calls", () => {
    let originalFetch: typeof globalThis.fetch | undefined;
    let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      fetchSpy = vi.fn<unknown[], unknown>(() => {
        throw new Error("badge helpers attempted a network call");
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

    it("badge helpers do not call fetch across decision and metadata paths", () => {
      capabilityDecisionToBadgeView(localReadyDecision());
      capabilityDecisionToBadgeView(cloudRequiredAllowedDecision());
      capabilityReceiptMetadataToBadgeView({
        capabilityState: "CLOUD_OPTIONAL",
        cloudAllowed: false,
        localAttemptAllowed: true,
      });
      capabilityReceiptMetadataToBadgeView(undefined);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

describe("capabilityBadgeToneClass", () => {
  it("returns a non-empty Tailwind class string for every tone", () => {
    for (const tone of [
      "local",
      "limited",
      "cloud-optional",
      "cloud-required",
      "blocked",
      "neutral",
    ] as const) {
      const cls = capabilityBadgeToneClass(tone);
      expect(typeof cls).toBe("string");
      expect(cls.length).toBeGreaterThan(20);
    }
  });
});

describe("isCapabilityDecisionReceipt", () => {
  it("detects receipt with action=capability.decision", () => {
    expect(isCapabilityDecisionReceipt({ action: "capability.decision" })).toBe(true);
  });

  it("detects receipt with capability metadata fields even without matching action", () => {
    expect(
      isCapabilityDecisionReceipt({
        action: "other",
        metadata: { capabilityId: "chat:chat.basic", capabilityState: "LOCAL_READY" },
      }),
    ).toBe(true);
  });

  it("returns false for non-capability receipts", () => {
    expect(isCapabilityDecisionReceipt({ action: "chat.sent" })).toBe(false);
    expect(isCapabilityDecisionReceipt({ action: "review", metadata: { foo: "bar" } })).toBe(false);
  });

  it("returns false for null/undefined without throwing", () => {
    expect(isCapabilityDecisionReceipt(null)).toBe(false);
    expect(isCapabilityDecisionReceipt(undefined)).toBe(false);
  });
});

describe("receiptToCapabilityBadgeView", () => {
  it("maps a capability.decision receipt metadata to a badge view", () => {
    const receipt = {
      action: "capability.decision",
      metadata: {
        capabilityId: "chat:chat.basic",
        capabilityState: "LOCAL_READY",
        localAttemptAllowed: true,
        cloudAllowed: false,
      } as Record<string, string | number | boolean>,
    };
    const view = receiptToCapabilityBadgeView(receipt);
    expect(view).not.toBeNull();
    expect(view!.label).toBe("Local ready");
    expect(view!.tone).toBe("local");
    expect(view!.cloudUsed).toBe(false);
  });

  it("Chat capability decision receipt metadata produces Local ready", () => {
    const input = buildChatCapabilityDecisionReceiptInput({
      createdAt: 1,
      localChatReady: true,
      providerId: "ollama",
      modelId: "llama3.1:8b",
    });
    const receipt = { action: "capability.decision", metadata: input.metadata };
    const view = receiptToCapabilityBadgeView(receipt);
    expect(view).not.toBeNull();
    expect(view!.label).toBe("Local ready");
  });

  it("Velum capability decision receipt metadata produces Local ready", () => {
    const input = buildVelumCapabilityDecisionReceiptInput({
      createdAt: 1,
      reviewCompleted: true,
    });
    const receipt = { action: "capability.decision", metadata: input.metadata };
    const view = receiptToCapabilityBadgeView(receipt);
    expect(view).not.toBeNull();
    expect(view!.label).toBe("Local ready");
  });

  it("cloudAllowed/providerMode still do not imply cloudUsed", () => {
    const receipt = {
      action: "capability.decision",
      metadata: {
        capabilityState: "CLOUD_REQUIRED",
        providerMode: "cloud",
        cloudAllowed: true,
        localAttemptAllowed: false,
      } as Record<string, string | number | boolean>,
    };
    const view = receiptToCapabilityBadgeView(receipt);
    expect(view).not.toBeNull();
    expect(view!.cloudAllowed).toBe(true);
    expect(view!.cloudUsed).toBe(false);
  });

  it("returns null for non-capability receipts without throwing", () => {
    expect(receiptToCapabilityBadgeView(null)).toBeNull();
    expect(receiptToCapabilityBadgeView(undefined)).toBeNull();
    expect(receiptToCapabilityBadgeView({ action: "chat.sent" })).toBeNull();
    expect(receiptToCapabilityBadgeView({ action: "review", metadata: { foo: "bar" } })).toBeNull();
  });

  it("does not require or surface forbidden fields", () => {
    const receipt = {
      action: "capability.decision",
      metadata: {
        capabilityState: "LOCAL_READY",
        capabilityId: "chat:chat.basic",
        localAttemptAllowed: true,
        cloudAllowed: false,
      } as Record<string, string | number | boolean>,
    };
    const view = receiptToCapabilityBadgeView(receipt)!;
    assertNoForbiddenKeysDeep(view as unknown as Record<string, unknown>);
  });

  describe("no fetch / no cloud calls from receipt helpers", () => {
    let originalFetch: typeof globalThis.fetch | undefined;
    let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      fetchSpy = vi.fn<unknown[], unknown>(() => {
        throw new Error("receipt badge helpers attempted a network call");
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

    it("isCapabilityDecisionReceipt and receiptToCapabilityBadgeView do not call fetch", () => {
      isCapabilityDecisionReceipt({ action: "capability.decision", metadata: { capabilityState: "LOCAL_READY", capabilityId: "x" } });
      receiptToCapabilityBadgeView({ action: "capability.decision", metadata: { capabilityState: "CLOUD_REQUIRED", capabilityId: "x", cloudAllowed: true } });
      receiptToCapabilityBadgeView(null);
      receiptToCapabilityBadgeView({ action: "other" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Cloud escalation offer badge helpers
// ---------------------------------------------------------------------------

function makeEscalationReceipt(overrides: Record<string, string | number | boolean> = {}) {
  return {
    action: "cloud-escalation.offer" as const,
    metadata: {
      escalationPacketId: "esc-1",
      capabilityId: "workshop:workshop.multi-file-build",
      moduleId: "workshop",
      capabilityTier: "cloud-required",
      capabilityState: "CLOUD_REQUIRED",
      consentState: "required",
      requiresConsent: true,
      requiresVelumReview: true,
      velumReviewPassed: false,
      nothingSentYet: true,
      actionable: true,
      dataCategories: "code, user-message",
      ...overrides,
    } as Record<string, string | number | boolean>,
  };
}

describe("isCloudEscalationOfferReceipt", () => {
  it("detects receipt with action=cloud-escalation.offer", () => {
    expect(isCloudEscalationOfferReceipt(makeEscalationReceipt())).toBe(true);
  });

  it("detects receipt by metadata fields even without matching action", () => {
    expect(isCloudEscalationOfferReceipt({
      action: "other",
      metadata: { escalationPacketId: "esc-1", consentState: "required" },
    })).toBe(true);
  });

  it("returns false for capability.decision receipts", () => {
    expect(isCloudEscalationOfferReceipt({
      action: "capability.decision",
      metadata: { capabilityState: "LOCAL_READY", capabilityId: "x" },
    })).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isCloudEscalationOfferReceipt(null)).toBe(false);
    expect(isCloudEscalationOfferReceipt(undefined)).toBe(false);
  });
});

describe("cloudEscalationReceiptToBadgeView", () => {
  it("consentState=required produces 'Cloud consent needed'", () => {
    const view = cloudEscalationReceiptToBadgeView(makeEscalationReceipt({ consentState: "required" }));
    expect(view).not.toBeNull();
    expect(view!.label).toBe("Cloud consent needed");
    expect(view!.tone).toBe("cloud-required");
    expect(view!.cloudUsed).toBe(false);
    expect(view!.cloudAllowed).toBe(false);
    expect(view!.detail.toLowerCase()).toContain("nothing has been sent");
  });

  it("consentState=granted produces 'Cloud allowed' with caveat", () => {
    const view = cloudEscalationReceiptToBadgeView(makeEscalationReceipt({ consentState: "granted" }));
    expect(view!.label).toBe("Cloud allowed");
    expect(view!.tone).toBe("cloud-optional");
    expect(view!.cloudUsed).toBe(false);
    expect(view!.cloudAllowed).toBe(true);
    expect(view!.detail.toLowerCase()).toContain("does not prove a cloud call happened");
  });

  it("consentState=denied produces 'Cloud denied'", () => {
    const view = cloudEscalationReceiptToBadgeView(makeEscalationReceipt({ consentState: "denied" }));
    expect(view!.label).toBe("Cloud denied");
    expect(view!.tone).toBe("blocked");
    expect(view!.cloudUsed).toBe(false);
  });

  it("consentState=blocked produces 'Cloud blocked'", () => {
    const view = cloudEscalationReceiptToBadgeView(makeEscalationReceipt({ consentState: "blocked" }));
    expect(view!.label).toBe("Cloud blocked");
    expect(view!.tone).toBe("blocked");
    expect(view!.cloudUsed).toBe(false);
  });

  it("nothingSentYet=true includes 'nothing has been sent' in detail", () => {
    const view = cloudEscalationReceiptToBadgeView(makeEscalationReceipt({ nothingSentYet: true }));
    expect(view!.detail.toLowerCase()).toContain("nothing has been sent");
  });

  it("requiresVelumReview=true and velumReviewPassed=false mentions Velum", () => {
    const view = cloudEscalationReceiptToBadgeView(makeEscalationReceipt({
      requiresVelumReview: true,
      velumReviewPassed: false,
    }));
    expect(view!.detail.toLowerCase()).toContain("velum review is required");
  });

  it("requiresVelumReview=true and velumReviewPassed=true says completed", () => {
    const view = cloudEscalationReceiptToBadgeView(makeEscalationReceipt({
      requiresVelumReview: true,
      velumReviewPassed: true,
    }));
    expect(view!.detail.toLowerCase()).toContain("velum review has been completed");
  });

  it("cloudUsed is always false", () => {
    for (const consentState of ["not-required", "required", "granted", "denied", "blocked"]) {
      const view = cloudEscalationReceiptToBadgeView(makeEscalationReceipt({ consentState }));
      expect(view!.cloudUsed).toBe(false);
    }
  });

  it("returns null for non-escalation receipts", () => {
    expect(cloudEscalationReceiptToBadgeView(null)).toBeNull();
    expect(cloudEscalationReceiptToBadgeView({ action: "chat.sent" })).toBeNull();
  });

  it("view has no forbidden keys", () => {
    const view = cloudEscalationReceiptToBadgeView(makeEscalationReceipt())!;
    assertNoForbiddenKeysDeep(view as unknown as Record<string, unknown>);
  });
});

describe("receiptToTransparencyBadgeView", () => {
  it("returns escalation badge for cloud-escalation.offer receipts", () => {
    const view = receiptToTransparencyBadgeView(makeEscalationReceipt());
    expect(view).not.toBeNull();
    expect(view!.label).toBe("Cloud consent needed");
  });

  it("returns capability badge for capability.decision receipts", () => {
    const view = receiptToTransparencyBadgeView({
      action: "capability.decision",
      metadata: { capabilityState: "LOCAL_READY", capabilityId: "x", localAttemptAllowed: true, cloudAllowed: false },
    });
    expect(view).not.toBeNull();
    expect(view!.label).toBe("Local ready");
  });

  it("returns null for unrecognized receipt types", () => {
    expect(receiptToTransparencyBadgeView(null)).toBeNull();
    expect(receiptToTransparencyBadgeView({ action: "chat.sent" })).toBeNull();
  });

  it("returns consent badge for cloud-consent.* receipts", () => {
    const view = receiptToTransparencyBadgeView(makeConsentReceipt("granted"));
    expect(view).not.toBeNull();
    expect(view!.label).toBe("Cloud consent granted");
  });

  it("does not call fetch", () => {
    expect(() => {
      receiptToTransparencyBadgeView(makeEscalationReceipt());
      receiptToTransparencyBadgeView(makeConsentReceipt("denied"));
      receiptToTransparencyBadgeView({ action: "capability.decision", metadata: { capabilityState: "LOCAL_READY", capabilityId: "x" } });
      receiptToTransparencyBadgeView(null);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cloud consent decision badge helpers
// ---------------------------------------------------------------------------

function makeConsentReceipt(decision: string, overrides: Record<string, string | number | boolean> = {}) {
  return {
    action: `cloud-consent.${decision}` as string,
    metadata: {
      escalationPacketId: "esc-1",
      capabilityId: "workshop:workshop.multi-file-build",
      moduleId: "workshop",
      capabilityTier: "cloud-required",
      capabilityState: "CLOUD_REQUIRED",
      decision,
      consentStateBefore: "required",
      consentStateAfter: decision === "cancelled" ? "required" : decision,
      requiresVelumReview: true,
      velumReviewPassed: false,
      nothingSentYet: true,
      dataCategories: "code, user-message",
      ...overrides,
    } as Record<string, string | number | boolean>,
  };
}

describe("isCloudConsentDecisionReceipt", () => {
  it("detects all four cloud-consent actions", () => {
    expect(isCloudConsentDecisionReceipt(makeConsentReceipt("granted"))).toBe(true);
    expect(isCloudConsentDecisionReceipt(makeConsentReceipt("denied"))).toBe(true);
    expect(isCloudConsentDecisionReceipt(makeConsentReceipt("cancelled"))).toBe(true);
    expect(isCloudConsentDecisionReceipt(makeConsentReceipt("blocked"))).toBe(true);
  });

  it("detects by metadata fields without matching action", () => {
    expect(isCloudConsentDecisionReceipt({
      action: "other",
      metadata: { escalationPacketId: "esc-1", decision: "granted" },
    })).toBe(true);
  });

  it("returns false for escalation offer receipts", () => {
    expect(isCloudConsentDecisionReceipt(makeEscalationReceipt())).toBe(false);
  });

  it("returns false for capability.decision receipts", () => {
    expect(isCloudConsentDecisionReceipt({
      action: "capability.decision",
      metadata: { capabilityState: "LOCAL_READY", capabilityId: "x" },
    })).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isCloudConsentDecisionReceipt(null)).toBe(false);
    expect(isCloudConsentDecisionReceipt(undefined)).toBe(false);
  });
});

describe("cloudConsentReceiptToBadgeView", () => {
  it("granted maps to 'Cloud consent granted' with cloudUsed=false", () => {
    const view = cloudConsentReceiptToBadgeView(makeConsentReceipt("granted"));
    expect(view).not.toBeNull();
    expect(view!.label).toBe("Cloud consent granted");
    expect(view!.cloudUsed).toBe(false);
    expect(view!.cloudAllowed).toBe(true);
  });

  it("granted detail says permission was granted but nothing sent", () => {
    const view = cloudConsentReceiptToBadgeView(makeConsentReceipt("granted"));
    expect(view!.detail.toLowerCase()).toContain("nothing has been sent");
    expect(view!.detail.toLowerCase()).toContain("permission");
    expect(view!.detail.toLowerCase()).toContain("does not mean a cloud call was made");
  });

  it("denied maps to 'Cloud consent denied' with cloudUsed=false", () => {
    const view = cloudConsentReceiptToBadgeView(makeConsentReceipt("denied"));
    expect(view!.label).toBe("Cloud consent denied");
    expect(view!.cloudUsed).toBe(false);
    expect(view!.cloudAllowed).toBe(false);
  });

  it("denied detail says keep local or stop", () => {
    const view = cloudConsentReceiptToBadgeView(makeConsentReceipt("denied"));
    expect(view!.detail.toLowerCase()).toMatch(/keep.*local|stop/);
  });

  it("cancelled maps to 'Cloud consent cancelled' with cloudUsed=false", () => {
    const view = cloudConsentReceiptToBadgeView(makeConsentReceipt("cancelled"));
    expect(view!.label).toBe("Cloud consent cancelled");
    expect(view!.cloudUsed).toBe(false);
    expect(view!.cloudAllowed).toBe(false);
  });

  it("cancelled detail says nothing was sent", () => {
    const view = cloudConsentReceiptToBadgeView(makeConsentReceipt("cancelled"));
    expect(view!.detail.toLowerCase()).toContain("nothing");
  });

  it("blocked maps to 'Cloud consent blocked' with cloudUsed=false", () => {
    const view = cloudConsentReceiptToBadgeView(makeConsentReceipt("blocked"));
    expect(view!.label).toBe("Cloud consent blocked");
    expect(view!.cloudUsed).toBe(false);
    expect(view!.cloudAllowed).toBe(false);
  });

  it("blocked detail says nothing was sent", () => {
    const view = cloudConsentReceiptToBadgeView(makeConsentReceipt("blocked"));
    expect(view!.detail.toLowerCase()).toContain("nothing");
  });

  it("Velum required but not passed is mentioned in detail", () => {
    const view = cloudConsentReceiptToBadgeView(makeConsentReceipt("granted", {
      requiresVelumReview: true,
      velumReviewPassed: false,
    }));
    expect(view!.detail.toLowerCase()).toContain("velum");
  });

  it("unknown/non-consent receipt returns null without throwing", () => {
    expect(cloudConsentReceiptToBadgeView(null)).toBeNull();
    expect(cloudConsentReceiptToBadgeView({ action: "chat.sent" })).toBeNull();
  });

  it("view has no forbidden keys", () => {
    for (const decision of ["granted", "denied", "cancelled", "blocked"]) {
      const view = cloudConsentReceiptToBadgeView(makeConsentReceipt(decision))!;
      assertNoForbiddenKeysDeep(view as unknown as Record<string, unknown>);
    }
  });
});

// ---------------------------------------------------------------------------
// Prompt-injection assessment badge helpers
// ---------------------------------------------------------------------------

function makeInjectionReceipt(riskLevel: string, overrides: Record<string, string | number | boolean> = {}) {
  return {
    action: "security.prompt-injection.assessment" as string,
    metadata: {
      riskLevel,
      findingCount: riskLevel === "none" ? 0 : 1,
      categories: "instruction-override",
      recommendedAction: riskLevel === "none" ? "allow" : "block",
      shouldBlockToolUse: riskLevel === "high" || riskLevel === "critical",
      shouldBlockCloudEscalation: riskLevel === "high" || riskLevel === "critical",
      shouldRequireVelumReview: riskLevel !== "none" && riskLevel !== "low",
      shouldWarnUser: riskLevel !== "none" && riskLevel !== "low",
      safeSummary: "Test summary.",
      ...overrides,
    } as Record<string, string | number | boolean>,
  };
}

describe("isPromptInjectionAssessmentReceipt", () => {
  it("detects receipt with action=security.prompt-injection.assessment", () => {
    expect(isPromptInjectionAssessmentReceipt(makeInjectionReceipt("medium"))).toBe(true);
  });

  it("detects by metadata fields without matching action", () => {
    expect(isPromptInjectionAssessmentReceipt({
      action: "other",
      metadata: { riskLevel: "high", findingCount: 2 },
    })).toBe(true);
  });

  it("returns false for capability.decision receipts", () => {
    expect(isPromptInjectionAssessmentReceipt({
      action: "capability.decision",
      metadata: { capabilityState: "LOCAL_READY", capabilityId: "x" },
    })).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isPromptInjectionAssessmentReceipt(null)).toBe(false);
    expect(isPromptInjectionAssessmentReceipt(undefined)).toBe(false);
  });
});

describe("promptInjectionReceiptToBadgeView", () => {
  it("none maps to 'Gateway check passed'", () => {
    const view = promptInjectionReceiptToBadgeView(makeInjectionReceipt("none"));
    expect(view!.label).toBe("Gateway check passed");
    expect(view!.tone).toBe("local");
    expect(view!.cloudUsed).toBe(false);
  });

  it("low maps to 'Gateway low risk'", () => {
    const view = promptInjectionReceiptToBadgeView(makeInjectionReceipt("low"));
    expect(view!.label).toBe("Gateway low risk");
    expect(view!.tone).toBe("neutral");
  });

  it("medium maps to 'Gateway review advised'", () => {
    const view = promptInjectionReceiptToBadgeView(makeInjectionReceipt("medium"));
    expect(view!.label).toBe("Gateway review advised");
    expect(view!.tone).toBe("limited");
  });

  it("high maps to 'Gateway restricted'", () => {
    const view = promptInjectionReceiptToBadgeView(makeInjectionReceipt("high"));
    expect(view!.label).toBe("Gateway restricted");
    expect(view!.tone).toBe("blocked");
  });

  it("critical maps to 'Gateway blocked'", () => {
    const view = promptInjectionReceiptToBadgeView(makeInjectionReceipt("critical"));
    expect(view!.label).toBe("Gateway blocked");
    expect(view!.tone).toBe("blocked");
  });

  it("shouldBlockCloudEscalation appears in detail", () => {
    const view = promptInjectionReceiptToBadgeView(makeInjectionReceipt("high", {
      shouldBlockCloudEscalation: true,
    }));
    expect(view!.detail.toLowerCase()).toContain("cloud escalation");
  });

  it("shouldBlockToolUse appears in detail", () => {
    const view = promptInjectionReceiptToBadgeView(makeInjectionReceipt("high", {
      shouldBlockToolUse: true,
    }));
    expect(view!.detail.toLowerCase()).toContain("tool use");
  });

  it("shouldRequireVelumReview appears in detail", () => {
    const view = promptInjectionReceiptToBadgeView(makeInjectionReceipt("medium", {
      shouldRequireVelumReview: true,
    }));
    expect(view!.detail.toLowerCase()).toContain("velum review");
  });

  it("cloudUsed is always false", () => {
    for (const risk of ["none", "low", "medium", "high", "critical"]) {
      const view = promptInjectionReceiptToBadgeView(makeInjectionReceipt(risk));
      expect(view!.cloudUsed).toBe(false);
    }
  });

  it("returns null for non-injection receipts", () => {
    expect(promptInjectionReceiptToBadgeView(null)).toBeNull();
    expect(promptInjectionReceiptToBadgeView({ action: "chat.sent" })).toBeNull();
  });

  it("view has no forbidden keys", () => {
    for (const risk of ["none", "low", "medium", "high", "critical"]) {
      const view = promptInjectionReceiptToBadgeView(makeInjectionReceipt(risk))!;
      assertNoForbiddenKeysDeep(view as unknown as Record<string, unknown>);
    }
  });

  it("no raw injection text appears in badge view", () => {
    const view = promptInjectionReceiptToBadgeView(makeInjectionReceipt("critical"))!;
    expect(view.label).not.toContain("ignore");
    expect(view.shortDescription).not.toContain("ignore");
    expect(view.detail).not.toContain("ignore previous");
  });
});

describe("receiptToTransparencyBadgeView — security receipts", () => {
  it("returns gateway badge for security assessment receipts", () => {
    const view = receiptToTransparencyBadgeView(makeInjectionReceipt("high"));
    expect(view).not.toBeNull();
    expect(view!.label).toBe("Gateway restricted");
  });

  it("handles security receipts before other types", () => {
    const view = receiptToTransparencyBadgeView(makeInjectionReceipt("none"));
    expect(view!.label).toBe("Gateway check passed");
  });

  it("still handles other receipt types", () => {
    expect(receiptToTransparencyBadgeView(makeEscalationReceipt())!.label).toBe("Cloud consent needed");
    expect(receiptToTransparencyBadgeView(makeConsentReceipt("granted"))!.label).toBe("Cloud consent granted");
    expect(receiptToTransparencyBadgeView({
      action: "capability.decision",
      metadata: { capabilityState: "LOCAL_READY", capabilityId: "x" },
    })!.label).toBe("Local ready");
  });
});

// ---------------------------------------------------------------------------
// Gateway policy decision badge helpers
// ---------------------------------------------------------------------------

function makePolicyReceipt(boundary: string, allowed: boolean, blockedBy = "none", overrides: Record<string, string | number | boolean> = {}) {
  return {
    action: "security.gateway-policy.decision" as string,
    metadata: {
      boundary,
      allowed,
      blockedBy,
      riskLevel: allowed ? "none" : "high",
      categories: "instruction-override",
      recommendedAction: allowed ? "allow" : "block",
      shouldWarnUser: !allowed,
      shouldRequireVelumReview: blockedBy === "velum-required",
      shouldRecordReceipt: true,
      reason: "Test policy reason.",
      ...overrides,
    } as Record<string, string | number | boolean>,
  };
}

describe("isGatewayPolicyDecisionReceipt", () => {
  it("detects receipt with action=security.gateway-policy.decision", () => {
    expect(isGatewayPolicyDecisionReceipt(makePolicyReceipt("chat", true))).toBe(true);
  });

  it("detects by metadata fields without matching action", () => {
    expect(isGatewayPolicyDecisionReceipt({
      action: "other",
      metadata: { boundary: "tool-use", allowed: false },
    })).toBe(true);
  });

  it("returns false for injection assessment receipts", () => {
    expect(isGatewayPolicyDecisionReceipt(makeInjectionReceipt("high"))).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isGatewayPolicyDecisionReceipt(null)).toBe(false);
    expect(isGatewayPolicyDecisionReceipt(undefined)).toBe(false);
  });
});

describe("gatewayPolicyReceiptToBadgeView", () => {
  it("cloud-escalation allowed → 'Cloud boundary allowed' with cloudUsed=false", () => {
    const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt("cloud-escalation", true));
    expect(view!.label).toBe("Cloud boundary allowed");
    expect(view!.cloudUsed).toBe(false);
    expect(view!.detail).toContain("does not mean cloud was used");
  });

  it("cloud-escalation velum-required → 'Velum required'", () => {
    const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt("cloud-escalation", false, "velum-required"));
    expect(view!.label).toBe("Velum required");
    expect(view!.tone).toBe("limited");
    expect(view!.detail.toLowerCase()).toContain("velum review");
  });

  it("cloud-escalation prompt-injection blocked → 'Cloud boundary blocked'", () => {
    const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt("cloud-escalation", false, "prompt-injection"));
    expect(view!.label).toBe("Cloud boundary blocked");
    expect(view!.tone).toBe("blocked");
    expect(view!.detail.toLowerCase()).toContain("prompt-injection");
  });

  it("tool-use blocked → 'Tool boundary blocked'", () => {
    const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt("tool-use", false, "prompt-injection"));
    expect(view!.label).toBe("Tool boundary blocked");
    expect(view!.tone).toBe("blocked");
  });

  it("tool-use allowed → 'Tool boundary allowed'", () => {
    const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt("tool-use", true));
    expect(view!.label).toBe("Tool boundary allowed");
  });

  it("provider-switch blocked → 'Provider switch blocked'", () => {
    const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt("provider-switch", false, "velum-required"));
    expect(view!.label).toBe("Velum required");
  });

  it("receipt-write → 'Receipts preserved'", () => {
    const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt("receipt-write", true));
    expect(view!.label).toBe("Receipts preserved");
    expect(view!.detail).toContain("preserved");
  });

  it("velum-handoff → 'Velum handoff allowed'", () => {
    const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt("velum-handoff", true));
    expect(view!.label).toBe("Velum handoff allowed");
  });

  it("chat allowed → 'Chat allowed'", () => {
    const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt("chat", true));
    expect(view!.label).toBe("Chat allowed");
  });

  it("chat blocked → 'Chat blocked'", () => {
    const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt("chat", false, "prompt-injection"));
    expect(view!.label).toBe("Chat blocked");
  });

  it("cloudUsed is always false", () => {
    for (const boundary of ["chat", "tool-use", "cloud-escalation", "receipt-write", "velum-handoff"] as const) {
      const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt(boundary, true));
      expect(view!.cloudUsed).toBe(false);
    }
  });

  it("returns null for non-policy receipts", () => {
    expect(gatewayPolicyReceiptToBadgeView(null)).toBeNull();
    expect(gatewayPolicyReceiptToBadgeView({ action: "chat.sent" })).toBeNull();
  });

  it("view has no forbidden keys", () => {
    for (const boundary of ["chat", "cloud-escalation", "tool-use", "receipt-write"] as const) {
      const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt(boundary, true))!;
      assertNoForbiddenKeysDeep(view as unknown as Record<string, unknown>);
    }
  });

  it("no raw injection text in badge view", () => {
    const view = gatewayPolicyReceiptToBadgeView(makePolicyReceipt("cloud-escalation", false, "prompt-injection"))!;
    expect(view.label).not.toContain("ignore");
    expect(view.detail).not.toContain("skip velum");
  });
});

describe("receiptToTransparencyBadgeView — policy receipts", () => {
  it("returns policy badge for gateway-policy receipts before assessment receipts", () => {
    const view = receiptToTransparencyBadgeView(makePolicyReceipt("cloud-escalation", false, "prompt-injection"));
    expect(view).not.toBeNull();
    expect(view!.label).toBe("Cloud boundary blocked");
  });

  it("still handles all other receipt types", () => {
    expect(receiptToTransparencyBadgeView(makeInjectionReceipt("high"))!.label).toBe("Gateway restricted");
    expect(receiptToTransparencyBadgeView(makeEscalationReceipt())!.label).toBe("Cloud consent needed");
    expect(receiptToTransparencyBadgeView(makeConsentReceipt("denied"))!.label).toBe("Cloud consent denied");
    expect(receiptToTransparencyBadgeView({
      action: "capability.decision",
      metadata: { capabilityState: "LOCAL_READY", capabilityId: "x" },
    })!.label).toBe("Local ready");
  });
});
