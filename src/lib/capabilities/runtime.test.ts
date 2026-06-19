import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITIES, getCapabilityById } from "./registry";
import type { Capability } from "./contracts";
import {
  decideCapabilityRuntime,
  resolveCapabilityRuntime,
  resolveCapabilityRuntimeForId,
  type CapabilityRuntimeInput,
} from "./runtime";

const baseContext: Omit<CapabilityRuntimeInput, "capabilityId"> = {
  availableLocalProfiles: [],
  availableCloudProfiles: [],
  cloudUnlocked: false,
  cloudConsentGranted: false,
  velumReviewPassed: false,
};

function need(id: string): Capability {
  const c = getCapabilityById(id);
  if (!c) throw new Error(`fixture missing capability ${id}`);
  return c;
}

describe("capability runtime resolver", () => {
  it("resolves every registered capability without throwing", () => {
    for (const cap of CAPABILITIES) {
      expect(() =>
        resolveCapabilityRuntimeForId(cap.id, baseContext),
      ).not.toThrow();
    }
  });

  it("throws when given an unknown capability id", () => {
    expect(() =>
      resolveCapabilityRuntimeForId("does-not-exist", baseContext),
    ).toThrow();
  });

  it("blockedReason forces BLOCKED, even for ready local-core capabilities", () => {
    const decision = resolveCapabilityRuntime({
      capabilityId: "colloquium:chat.basic",
      ...baseContext,
      availableLocalProfiles: [
        { providerId: "ollama", capabilityProfile: "chat" },
      ],
      blockedReason: "host paused capabilities",
    });
    expect(decision.state).toBe("BLOCKED");
    expect(decision.canAttemptLocally).toBe(false);
    expect(decision.canUseCloud).toBe(false);
    expect(decision.receiptHint.escalationReason).toBe("host paused capabilities");
  });

  it("tier=blocked resolves to BLOCKED with the registered honest message", () => {
    const decision = resolveCapabilityRuntimeForId(
      "archelon:archelon.local-memory",
      baseContext,
    );
    expect(decision.state).toBe("BLOCKED");
    expect(decision.canAttemptLocally).toBe(false);
    expect(decision.canUseCloud).toBe(false);
    expect(decision.honestMessage.length).toBeGreaterThan(10);
  });

  it("local-core resolves LOCAL_READY when local requirements are satisfied", () => {
    const decision = resolveCapabilityRuntime({
      capabilityId: "colloquium:chat.basic",
      ...baseContext,
      availableLocalProfiles: [
        { providerId: "ollama", capabilityProfile: "chat" },
      ],
    });
    expect(decision.state).toBe("LOCAL_READY");
    expect(decision.canAttemptLocally).toBe(true);
    expect(decision.canUseCloud).toBe(false);
  });

  it("local-core with no provider requirements is LOCAL_READY by default (deterministic capability)", () => {
    const decision = resolveCapabilityRuntimeForId(
      "tabularium:tabularium.local-receipts",
      baseContext,
    );
    expect(decision.state).toBe("LOCAL_READY");
    expect(decision.canAttemptLocally).toBe(true);
  });

  it("local-core without matching local requirement does not silently claim ready", () => {
    const decision = resolveCapabilityRuntimeForId(
      "colloquium:chat.basic",
      baseContext,
    );
    expect(decision.state).not.toBe("LOCAL_READY");
    expect(decision.canAttemptLocally).toBe(false);
    expect(decision.reasons.some((r) => r.includes("ollama"))).toBe(true);
  });

  it("local-limited resolves LOCAL_LIMITED when the local path exists", () => {
    const decision = resolveCapabilityRuntime({
      capabilityId: "colloquium:chat.advanced-planning",
      ...baseContext,
      availableLocalProfiles: [
        { providerId: "ollama", capabilityProfile: "chat", paramsB: 8 },
      ],
    });
    expect(decision.state).toBe("LOCAL_LIMITED");
    expect(decision.canAttemptLocally).toBe(true);
    expect(decision.canUseCloud).toBe(false);
  });

  it("local-limited honors minParamsB on local requirements", () => {
    const decision = resolveCapabilityRuntime({
      capabilityId: "colloquium:chat.advanced-planning",
      ...baseContext,
      availableLocalProfiles: [
        { providerId: "ollama", capabilityProfile: "chat", paramsB: 3 },
      ],
    });
    expect(decision.state).not.toBe("LOCAL_LIMITED");
    expect(decision.canAttemptLocally).toBe(false);
  });

  it("oculus local vision resolves LOCAL_LIMITED when a vision model is available", () => {
    const decision = resolveCapabilityRuntimeForId(
      "oculus:oculus.local-image-analysis",
      {
        ...baseContext,
        availableLocalProfiles: [
          { providerId: "ollama", capabilityProfile: "vision" },
        ],
      },
    );
    expect(decision.state).toBe("LOCAL_LIMITED");
    expect(decision.canAttemptLocally).toBe(true);
  });

  it("cloud-required resolves CLOUD_REQUIRED with canUseCloud=false before consent", () => {
    const decision = resolveCapabilityRuntimeForId(
      "fabrica:fabrica.multi-file-build",
      baseContext,
    );
    expect(decision.state).toBe("CLOUD_REQUIRED");
    expect(decision.requiresCloudConsent).toBe(true);
    expect(decision.canUseCloud).toBe(false);
    expect(
      decision.reasons.some((r) => r.toLowerCase().includes("consent")),
    ).toBe(true);
  });

  it("cloud-required canUseCloud is false when Velum review has not passed", () => {
    const decision = resolveCapabilityRuntimeForId(
      "fabrica:fabrica.multi-file-build",
      {
        ...baseContext,
        cloudUnlocked: true,
        cloudConsentGranted: true,
        velumReviewPassed: false,
        availableCloudProfiles: [
          { providerId: "future-cloud-agent", capabilityProfile: "tool-use" },
        ],
      },
    );
    expect(decision.state).toBe("CLOUD_REQUIRED");
    expect(decision.requiresVelumReview).toBe(true);
    expect(decision.canUseCloud).toBe(false);
    expect(
      decision.reasons.some((r) => r.toLowerCase().includes("velum")),
    ).toBe(true);
  });

  it("cloud-required canUseCloud is true only after unlock + consent + Velum + matching cloud requirement", () => {
    const cap = need("fabrica:fabrica.multi-file-build");
    expect(cap.velumGated).toBe(true);

    const decision = resolveCapabilityRuntimeForId(cap.id, {
      ...baseContext,
      cloudUnlocked: true,
      cloudConsentGranted: true,
      velumReviewPassed: true,
      availableCloudProfiles: [
        { providerId: "future-cloud-agent", capabilityProfile: "tool-use" },
      ],
    });
    expect(decision.state).toBe("CLOUD_REQUIRED");
    expect(decision.canUseCloud).toBe(true);
    expect(decision.canAttemptLocally).toBe(false);
  });

  it("cloud-required without matching cloud profile keeps canUseCloud=false even when consent + Velum granted", () => {
    const decision = resolveCapabilityRuntimeForId(
      "fabrica:fabrica.multi-file-build",
      {
        ...baseContext,
        cloudUnlocked: true,
        cloudConsentGranted: true,
        velumReviewPassed: true,
        availableCloudProfiles: [],
      },
    );
    expect(decision.state).toBe("CLOUD_REQUIRED");
    expect(decision.canUseCloud).toBe(false);
  });

  it("cloud-required honest message does not imply data has been sent", () => {
    const decision = resolveCapabilityRuntimeForId(
      "fabrica:fabrica.multi-file-build",
      baseContext,
    );
    expect(decision.honestMessage.toLowerCase()).not.toMatch(/sent|uploaded|transmitted/);
  });

  // --- cloud-optional behavior is exercised via a synthetic capability since
  // no current registry entries use this tier yet. ---

  const syntheticCloudOptional: Capability = {
    id: "synthetic:cloud.optional",
    moduleId: "colloquium",
    displayName: "Synthetic cloud-optional capability",
    beginnerDescription: "test fixture only",
    tier: "cloud-optional",
    localRequirements: [
      { providerId: "ollama", capabilityProfile: "chat" },
    ],
    cloudRequirements: [
      { providerId: "future-cloud-chat", capabilityProfile: "chat" },
    ],
    honestMessages: {
      localLimited: "Local available; cloud could improve quality.",
      cloudOptional: "Cloud is optional and only used after explicit consent.",
    },
    receiptActions: "none",
    velumGated: true,
  };

  it("cloud-optional with a local path returns LOCAL_LIMITED and does not require consent by default", () => {
    const decision = decideCapabilityRuntime(syntheticCloudOptional, {
      capabilityId: syntheticCloudOptional.id,
      ...baseContext,
      availableLocalProfiles: [
        { providerId: "ollama", capabilityProfile: "chat" },
      ],
    });
    expect(decision.state).toBe("LOCAL_LIMITED");
    expect(decision.requiresCloudConsent).toBe(false);
    expect(decision.canAttemptLocally).toBe(true);
    expect(decision.canUseCloud).toBe(false);
  });

  it("cloud-optional indicates cloud may improve but does not allow cloud unless consent + unlock + Velum pass", () => {
    const decision = decideCapabilityRuntime(syntheticCloudOptional, {
      capabilityId: syntheticCloudOptional.id,
      ...baseContext,
      availableLocalProfiles: [
        { providerId: "ollama", capabilityProfile: "chat" },
      ],
      availableCloudProfiles: [
        { providerId: "future-cloud-chat", capabilityProfile: "chat" },
      ],
      cloudUnlocked: true,
      cloudConsentGranted: false,
      velumReviewPassed: true,
    });
    expect(decision.state).toBe("LOCAL_LIMITED");
    expect(decision.canUseCloud).toBe(false);

    const allConsented = decideCapabilityRuntime(syntheticCloudOptional, {
      capabilityId: syntheticCloudOptional.id,
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
    expect(allConsented.canUseCloud).toBe(true);
  });

  it("cloud-optional with no local path returns CLOUD_OPTIONAL and requires consent before canUseCloud", () => {
    const decision = decideCapabilityRuntime(syntheticCloudOptional, {
      capabilityId: syntheticCloudOptional.id,
      ...baseContext,
      availableLocalProfiles: [],
      availableCloudProfiles: [
        { providerId: "future-cloud-chat", capabilityProfile: "chat" },
      ],
    });
    expect(decision.state).toBe("CLOUD_OPTIONAL");
    expect(decision.requiresCloudConsent).toBe(true);
    expect(decision.canAttemptLocally).toBe(false);
    expect(decision.canUseCloud).toBe(false);
  });

  it("receiptHint mirrors capabilityId, moduleId, tier, and state", () => {
    const decision = resolveCapabilityRuntime({
      capabilityId: "colloquium:chat.basic",
      ...baseContext,
      availableLocalProfiles: [
        { providerId: "ollama", capabilityProfile: "chat" },
      ],
    });
    expect(decision.receiptHint.capabilityId).toBe(decision.capabilityId);
    expect(decision.receiptHint.moduleId).toBe(decision.moduleId);
    expect(decision.receiptHint.tier).toBe(decision.tier);
    expect(decision.receiptHint.state).toBe(decision.state);
    expect(decision.receiptHint.localAttemptAllowed).toBe(decision.canAttemptLocally);
    expect(decision.receiptHint.cloudAllowed).toBe(decision.canUseCloud);
  });
});

describe("capability runtime resolver — no cloud calls", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("runtime resolver attempted a network call");
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

  it("does not perform network/cloud calls during any decision path", () => {
    const inputs: CapabilityRuntimeInput[] = CAPABILITIES.map((cap) => ({
      capabilityId: cap.id,
      availableLocalProfiles: [
        { providerId: "ollama", capabilityProfile: "chat", paramsB: 70 },
        { providerId: "ollama", capabilityProfile: "vision" },
        { providerId: "ollama", capabilityProfile: "code" },
      ],
      availableCloudProfiles: [
        { providerId: "future-cloud-agent", capabilityProfile: "tool-use" },
        { providerId: "future-cloud-evaluator", capabilityProfile: "chat" },
        { providerId: "future-cloud-control", capabilityProfile: "tool-use" },
        { providerId: "future-cloud-policy", capabilityProfile: "tool-use" },
        { providerId: "future-cloud-imaging", capabilityProfile: "vision" },
      ],
      cloudUnlocked: true,
      cloudConsentGranted: true,
      velumReviewPassed: true,
    }));

    for (const input of inputs) {
      resolveCapabilityRuntime(input);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
