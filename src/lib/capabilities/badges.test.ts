import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  capabilityBadgeToneClass,
  capabilityDecisionToBadgeView,
  capabilityReceiptMetadataToBadgeView,
  capabilityStateToBadgeLabel,
} from "./badges";
import {
  decideCapabilityRuntime,
  resolveCapabilityRuntime,
  resolveCapabilityRuntimeForId,
  type CapabilityRuntimeInput,
} from "./runtime";
import { buildVelumCapabilityDecisionReceiptInput } from "@/lib/velum/capabilityReceipts";
import { buildColloquiumCapabilityDecisionReceiptInput } from "@/lib/colloquium/capabilityReceipts";
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
    capabilityId: "colloquium:chat.basic",
    ...baseContext,
    availableLocalProfiles: [
      { providerId: "ollama", capabilityProfile: "chat" },
    ],
  });
}

function localLimitedDecision() {
  return resolveCapabilityRuntime({
    capabilityId: "colloquium:chat.advanced-planning",
    ...baseContext,
    availableLocalProfiles: [
      { providerId: "ollama", capabilityProfile: "chat", paramsB: 8 },
    ],
  });
}

function cloudRequiredPendingDecision() {
  return resolveCapabilityRuntimeForId(
    "fabrica:fabrica.multi-file-build",
    baseContext,
  );
}

function cloudRequiredAllowedDecision() {
  return resolveCapabilityRuntimeForId("fabrica:fabrica.multi-file-build", {
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
    moduleId: "colloquium",
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
    expect(view.detail.toLowerCase()).toContain("nothing has been sent");
    expect(view.detail.toLowerCase()).toMatch(/cloud is allowed/);
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

  it("maps Colloquium capability receipt metadata (with localChatReady) to local ready", () => {
    const input = buildColloquiumCapabilityDecisionReceiptInput({
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
