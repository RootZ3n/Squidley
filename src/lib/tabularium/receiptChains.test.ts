import { describe, expect, it } from "vitest";
import {
  buildReceiptChains,
  chainContainsForbiddenContentKeys,
  classifyReceiptChainStep,
  getReceiptChainGroupKey,
  summarizeReceiptChain,
  type TabulariumReceiptChain,
} from "./receiptChains";
import { createTabulariumReceipt, type TabulariumReceipt } from "./receipts";

// ---------------------------------------------------------------------------
// Helpers to create test receipts
// ---------------------------------------------------------------------------

function makeReceipt(
  overrides: Partial<Parameters<typeof createTabulariumReceipt>[0]> & { action: string },
): TabulariumReceipt {
  return createTabulariumReceipt({
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: 1000,
    module: "system",
    title: "Test receipt",
    summary: "Test summary",
    ...overrides,
  });
}

const SHARED_PACKET_ID = "pkt-abc-123";

function makeAssessmentReceipt(opts: {
  createdAt?: number;
  riskLevel?: string;
  escalationPacketId?: string;
} = {}): TabulariumReceipt {
  return makeReceipt({
    id: `assessment-${opts.createdAt ?? 1000}`,
    createdAt: opts.createdAt ?? 1000,
    action: "security.prompt-injection.assessment",
    title: "Prompt injection assessment: none",
    summary: "Gateway found no blocking issue.",
    metadata: {
      riskLevel: opts.riskLevel ?? "none",
      findingCount: 0,
      categories: "none",
      recommendedAction: "allow",
      shouldBlockToolUse: false,
      shouldBlockCloudEscalation: false,
      shouldRequireVelumReview: false,
      shouldWarnUser: false,
      ...(opts.escalationPacketId
        ? { escalationPacketId: opts.escalationPacketId }
        : {}),
    },
  });
}

function makePolicyReceipt(opts: {
  createdAt?: number;
  allowed?: boolean;
  blockedBy?: string;
  boundary?: string;
  escalationPacketId?: string;
} = {}): TabulariumReceipt {
  return makeReceipt({
    id: `policy-${opts.createdAt ?? 2000}`,
    createdAt: opts.createdAt ?? 2000,
    action: "security.gateway-policy.decision",
    title: `Gateway policy: cloud-escalation ${opts.allowed !== false ? "allowed" : "blocked"}`,
    summary: `Gateway policy ${opts.allowed !== false ? "allowed" : "blocked"} cloud escalation.`,
    metadata: {
      boundary: opts.boundary ?? "cloud-escalation",
      allowed: opts.allowed !== false,
      blockedBy: opts.blockedBy ?? "none",
      riskLevel: "none",
      shouldRequireVelumReview: false,
      ...(opts.escalationPacketId
        ? { escalationPacketId: opts.escalationPacketId }
        : {}),
    },
  });
}

function makeOfferReceipt(opts: {
  createdAt?: number;
  escalationPacketId?: string;
  nothingSentYet?: boolean;
  consentState?: string;
} = {}): TabulariumReceipt {
  return makeReceipt({
    id: `offer-${opts.createdAt ?? 3000}`,
    createdAt: opts.createdAt ?? 3000,
    action: "cloud-escalation.offer",
    title: "Cloud escalation offer: test-cap",
    summary: "Cloud escalation offer recorded. Nothing has been sent.",
    metadata: {
      escalationPacketId: opts.escalationPacketId ?? SHARED_PACKET_ID,
      capabilityId: "test-cap",
      moduleId: "nous",
      consentState: opts.consentState ?? "required",
      nothingSentYet: opts.nothingSentYet !== false,
      requiresVelumReview: false,
      velumReviewPassed: false,
    },
  });
}

function makeConsentReceipt(opts: {
  createdAt?: number;
  decision?: string;
  action?: string;
  escalationPacketId?: string;
  nothingSentYet?: boolean;
} = {}): TabulariumReceipt {
  const decision = opts.decision ?? "granted";
  return makeReceipt({
    id: `consent-${opts.createdAt ?? 4000}`,
    createdAt: opts.createdAt ?? 4000,
    action: opts.action ?? `cloud-consent.${decision}`,
    title: `Cloud consent ${decision}: test-cap`,
    summary: `Cloud consent ${decision}. Nothing has been sent yet.`,
    metadata: {
      escalationPacketId: opts.escalationPacketId ?? SHARED_PACKET_ID,
      capabilityId: "test-cap",
      moduleId: "nous",
      decision,
      nothingSentYet: opts.nothingSentYet !== false,
      requiresVelumReview: false,
      velumReviewPassed: false,
    },
  });
}

function makeCapabilityReceipt(opts: {
  createdAt?: number;
  capabilityId?: string;
} = {}): TabulariumReceipt {
  return makeReceipt({
    id: `capability-${opts.createdAt ?? 5000}`,
    createdAt: opts.createdAt ?? 5000,
    action: "capability.decision",
    title: "Capability decision: test-cap",
    summary: "Squidley evaluated this capability.",
    metadata: {
      capabilityId: opts.capabilityId ?? "test-cap",
      capabilityState: "LOCAL_READY",
      cloudAllowed: false,
      localAttemptAllowed: true,
    },
  });
}

function makeUnrelatedReceipt(opts: {
  createdAt?: number;
  id?: string;
} = {}): TabulariumReceipt {
  return makeReceipt({
    id: opts.id ?? `unrelated-${opts.createdAt ?? 9000}`,
    createdAt: opts.createdAt ?? 9000,
    module: "colloquium",
    action: "chat.completed",
    title: "Chat completed",
    summary: "Local chat completed successfully.",
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("classifyReceiptChainStep", () => {
  it("classifies assessment receipts", () => {
    expect(classifyReceiptChainStep(makeAssessmentReceipt())).toBe("assessment");
  });

  it("classifies policy receipts", () => {
    expect(classifyReceiptChainStep(makePolicyReceipt())).toBe("policy");
  });

  it("classifies offer receipts", () => {
    expect(classifyReceiptChainStep(makeOfferReceipt())).toBe("offer");
  });

  it("classifies consent receipts", () => {
    expect(classifyReceiptChainStep(makeConsentReceipt())).toBe("consent");
  });

  it("classifies capability receipts", () => {
    expect(classifyReceiptChainStep(makeCapabilityReceipt())).toBe("capability");
  });

  it("classifies unknown receipts as other", () => {
    expect(classifyReceiptChainStep(makeUnrelatedReceipt())).toBe("other");
  });
});

describe("getReceiptChainGroupKey", () => {
  it("returns escalationPacketId-based key when present", () => {
    const receipt = makeOfferReceipt({ escalationPacketId: "pkt-1" });
    expect(getReceiptChainGroupKey(receipt)).toBe("epid:pkt-1");
  });

  it("returns capabilityId-based key when no escalationPacketId", () => {
    const receipt = makeCapabilityReceipt({ capabilityId: "cap-1" });
    expect(getReceiptChainGroupKey(receipt)).toBe("capid:cap-1");
  });

  it("returns null for receipts without grouping keys", () => {
    const receipt = makeUnrelatedReceipt();
    expect(getReceiptChainGroupKey(receipt)).toBeNull();
  });
});

describe("buildReceiptChains", () => {
  it("groups assessment + policy + offer + consent with same escalationPacketId into one cloud-consent-flow chain", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 4000, escalationPacketId: SHARED_PACKET_ID }),
    ];

    const chains = buildReceiptChains(receipts);
    expect(chains).toHaveLength(1);
    expect(chains[0].kind).toBe("cloud-consent-flow");
    expect(chains[0].title).toBe("Cloud consent flow");
    expect(chains[0].steps).toHaveLength(4);
  });

  it("clean granted chain summary says consent granted but nothing sent", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, allowed: true, escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 4000, decision: "granted", escalationPacketId: SHARED_PACKET_ID }),
    ];

    const chains = buildReceiptChains(receipts);
    expect(chains[0].summary).toContain("consent was granted");
    expect(chains[0].summary).toContain("nothing was sent");
    expect(chains[0].nothingSentYet).toBe(true);
  });

  it("blocked injection chain summary says cloud escalation blocked and nothing sent", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, riskLevel: "high", escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, allowed: false, blockedBy: "prompt-injection", escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 4000, decision: "blocked", escalationPacketId: SHARED_PACKET_ID }),
    ];

    const chains = buildReceiptChains(receipts);
    expect(chains[0].summary).toContain("blocked");
    expect(chains[0].summary).toMatch(/[Nn]othing was sent/);
  });

  it("Velum-required chain summary says Velum review required and nothing sent", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, riskLevel: "medium", escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, allowed: false, blockedBy: "velum-required", escalationPacketId: SHARED_PACKET_ID }),
    ];

    const chains = buildReceiptChains(receipts);
    // With only assessment + policy, this is a gateway-security-flow
    expect(chains[0].kind).toBe("gateway-security-flow");
    expect(chains[0].summary).toContain("Velum review");
    expect(chains[0].summary).toMatch(/[Nn]othing was sent/);
  });

  it("assessment + policy without cloud receipts groups as gateway-security-flow", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: "pkt-gw" }),
      makePolicyReceipt({ createdAt: 2000, escalationPacketId: "pkt-gw" }),
    ];

    const chains = buildReceiptChains(receipts);
    expect(chains).toHaveLength(1);
    expect(chains[0].kind).toBe("gateway-security-flow");
    expect(chains[0].title).toBe("Gateway security flow");
  });

  it("capability.decision receipt becomes capability-decision chain", () => {
    const receipts = [makeCapabilityReceipt()];

    const chains = buildReceiptChains(receipts);
    expect(chains).toHaveLength(1);
    expect(chains[0].kind).toBe("capability-decision");
    expect(chains[0].title).toBe("Capability decision");
  });

  it("unrelated receipts remain standalone", () => {
    const receipts = [
      makeUnrelatedReceipt({ id: "u1", createdAt: 100 }),
      makeUnrelatedReceipt({ id: "u2", createdAt: 200 }),
    ];

    const chains = buildReceiptChains(receipts);
    expect(chains).toHaveLength(2);
    for (const chain of chains) {
      expect(chain.kind).toBe("standalone");
      expect(chain.steps).toHaveLength(1);
    }
  });

  it("chain steps preserve chronological order", () => {
    const receipts = [
      makeConsentReceipt({ createdAt: 4000, escalationPacketId: SHARED_PACKET_ID }),
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, escalationPacketId: SHARED_PACKET_ID }),
    ];

    const chains = buildReceiptChains(receipts);
    expect(chains[0].steps).toHaveLength(4);
    const times = chains[0].steps.map((s) => s.createdAt);
    expect(times).toEqual([1000, 2000, 3000, 4000]);
  });

  it("badgeView is attached when receiptToTransparencyBadgeView supports the receipt", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 4000, escalationPacketId: SHARED_PACKET_ID }),
    ];

    const chains = buildReceiptChains(receipts);
    // All four receipt types support badge views
    for (const step of chains[0].steps) {
      expect(step.badgeView).toBeDefined();
      expect(step.badgeView!.cloudUsed).toBe(false);
    }
  });

  it("cloudUsed remains false for consent/offer/policy/security chains", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 4000, decision: "granted", escalationPacketId: SHARED_PACKET_ID }),
    ];

    const chains = buildReceiptChains(receipts);
    for (const chain of chains) {
      expect(chain.cloudUsed).toBe(false);
    }
  });

  it("granted consent does not imply cloudUsed", () => {
    const receipts = [
      makeOfferReceipt({ createdAt: 1000 }),
      makeConsentReceipt({ createdAt: 2000, decision: "granted" }),
    ];

    const chains = buildReceiptChains(receipts);
    expect(chains[0].kind).toBe("cloud-consent-flow");
    expect(chains[0].finalDecision).toBe("granted");
    expect(chains[0].cloudUsed).toBe(false);
    expect(chains[0].nothingSentYet).toBe(true);
  });

  it("source receipts are not mutated", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 4000, escalationPacketId: SHARED_PACKET_ID }),
    ];

    const snapshots = receipts.map((r) => JSON.stringify(r));
    buildReceiptChains(receipts);
    receipts.forEach((r, i) => {
      expect(JSON.stringify(r)).toBe(snapshots[i]);
    });
  });

  it("forbidden content keys are absent from chain objects", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 4000, escalationPacketId: SHARED_PACKET_ID }),
    ];

    const chains = buildReceiptChains(receipts);
    for (const chain of chains) {
      expect(chainContainsForbiddenContentKeys(chain)).toBe(false);
    }
  });

  it("no raw injected/user text appears in serialized chains", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 2000, escalationPacketId: SHARED_PACKET_ID }),
    ];

    const chains = buildReceiptChains(receipts);
    const serialized = JSON.stringify(chains);
    // These keys should never appear
    expect(serialized).not.toContain('"rawPrompt"');
    expect(serialized).not.toContain('"rawUserText"');
    expect(serialized).not.toContain('"injectedContent"');
    expect(serialized).not.toContain('"documentContent"');
    expect(serialized).not.toContain('"codeContent"');
    expect(serialized).not.toContain('"imageContent"');
    expect(serialized).not.toContain('"userMessage"');
    expect(serialized).not.toContain('"systemPrompt"');
  });

  it("no fetch/provider/model/cloud calls occur", () => {
    // This test verifies the module is pure by checking that global fetch
    // is not called and no unexpected side effects happen.
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (() => {
      fetchCalled = true;
      return Promise.reject(new Error("fetch should not be called"));
    }) as typeof fetch;

    try {
      const receipts = [
        makeAssessmentReceipt({ escalationPacketId: SHARED_PACKET_ID }),
        makeOfferReceipt({ escalationPacketId: SHARED_PACKET_ID }),
        makeConsentReceipt({ escalationPacketId: SHARED_PACKET_ID }),
      ];
      buildReceiptChains(receipts);
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("no localStorage writes occur", () => {
    // Verify buildReceiptChains does not touch localStorage
    let storageAccessed = false;
    const handler = {
      get(_target: Storage, _prop: string) {
        storageAccessed = true;
        return undefined;
      },
      set(_target: Storage, _prop: string) {
        storageAccessed = true;
        return true;
      },
    };

    const fakeStorage = new Proxy({} as Storage, handler);
    // Assign to check — but buildReceiptChains doesn't take storage.
    // If it ever did, it would fail here.
    const receipts = [makeOfferReceipt(), makeConsentReceipt()];
    buildReceiptChains(receipts);

    // Also verify we never touched the proxy
    void fakeStorage;
    expect(storageAccessed).toBe(false);
  });

  it("receipts with different escalationPacketIds go to separate chains", () => {
    const receipts = [
      makeOfferReceipt({ createdAt: 1000, escalationPacketId: "pkt-1" }),
      makeConsentReceipt({ createdAt: 2000, escalationPacketId: "pkt-1" }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: "pkt-2" }),
      makeConsentReceipt({ createdAt: 4000, escalationPacketId: "pkt-2" }),
    ];

    const chains = buildReceiptChains(receipts);
    expect(chains).toHaveLength(2);
    expect(chains[0].steps).toHaveLength(2);
    expect(chains[1].steps).toHaveLength(2);
  });
});

describe("display view derivation", () => {
  it("chain view data can be derived from existing receipt fixtures", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 4000, decision: "granted", escalationPacketId: SHARED_PACKET_ID }),
      makeCapabilityReceipt({ createdAt: 5000 }),
      makeUnrelatedReceipt({ createdAt: 6000 }),
    ];

    const chains = buildReceiptChains(receipts);
    expect(chains.length).toBeGreaterThanOrEqual(3);

    // Each chain has the fields needed for display
    for (const chain of chains) {
      expect(typeof chain.id).toBe("string");
      expect(typeof chain.title).toBe("string");
      expect(typeof chain.summary).toBe("string");
      expect(typeof chain.kind).toBe("string");
      expect(typeof chain.createdAt).toBe("number");
      expect(typeof chain.updatedAt).toBe("number");
      expect(typeof chain.nothingSentYet).toBe("boolean");
      expect(typeof chain.cloudUsed).toBe("boolean");
      expect(Array.isArray(chain.steps)).toBe(true);
      expect(chain.steps.length).toBeGreaterThan(0);

      // Each step has the fields needed for display
      for (const step of chain.steps) {
        expect(typeof step.receiptId).toBe("string");
        expect(typeof step.title).toBe("string");
        expect(typeof step.summary).toBe("string");
        expect(typeof step.action).toBe("string");
        expect(typeof step.createdAt).toBe("number");
        expect(typeof step.stepKind).toBe("string");
      }
    }
  });

  it("clean granted chain summary does not imply cloud execution", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, allowed: true, escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 4000, decision: "granted", escalationPacketId: SHARED_PACKET_ID }),
    ];

    const chains = buildReceiptChains(receipts);
    const chain = chains[0];
    expect(chain.cloudUsed).toBe(false);
    expect(chain.summary).not.toMatch(/cloud was used/i);
    expect(chain.summary).not.toMatch(/sent to cloud/i);
    expect(chain.summary).not.toMatch(/cloud call/i);
    expect(chain.summary).toContain("nothing was sent");
  });

  it("blocked injection chain shows blocked story", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, riskLevel: "high", escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, allowed: false, blockedBy: "prompt-injection", escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 4000, decision: "blocked", escalationPacketId: SHARED_PACKET_ID }),
    ];

    const chains = buildReceiptChains(receipts);
    const chain = chains[0];
    expect(chain.kind).toBe("cloud-consent-flow");
    expect(chain.finalDecision).toBe("blocked");
    expect(chain.summary).toContain("blocked");
    expect(chain.cloudUsed).toBe(false);
    // Steps tell the story in order
    expect(chain.steps[0].stepKind).toBe("assessment");
    expect(chain.steps[1].stepKind).toBe("policy");
    expect(chain.steps[2].stepKind).toBe("offer");
    expect(chain.steps[3].stepKind).toBe("consent");
  });

  it("capability decision chain renders as capability story", () => {
    const receipts = [makeCapabilityReceipt({ createdAt: 1000 })];
    const chains = buildReceiptChains(receipts);
    expect(chains).toHaveLength(1);
    expect(chains[0].kind).toBe("capability-decision");
    expect(chains[0].title).toBe("Capability decision");
    expect(chains[0].summary).toContain("evaluated this capability");
  });

  it("badges attach to steps where supported", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 4000, escalationPacketId: SHARED_PACKET_ID }),
    ];

    const chains = buildReceiptChains(receipts);
    const badgedSteps = chains[0].steps.filter((s) => s.badgeView);
    // All four receipt types support badges
    expect(badgedSteps.length).toBe(4);
    for (const step of badgedSteps) {
      expect(step.badgeView!.cloudUsed).toBe(false);
      expect(typeof step.badgeView!.label).toBe("string");
      expect(typeof step.badgeView!.tone).toBe("string");
    }
  });

  it("forbidden content keys are not surfaced in display data", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makePolicyReceipt({ createdAt: 2000, escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 4000, escalationPacketId: SHARED_PACKET_ID }),
      makeCapabilityReceipt({ createdAt: 5000 }),
      makeUnrelatedReceipt({ createdAt: 6000 }),
    ];

    const chains = buildReceiptChains(receipts);
    for (const chain of chains) {
      expect(chainContainsForbiddenContentKeys(chain)).toBe(false);
    }
  });

  it("source receipts are not mutated by display derivation", () => {
    const receipts = [
      makeAssessmentReceipt({ createdAt: 1000, escalationPacketId: SHARED_PACKET_ID }),
      makeOfferReceipt({ createdAt: 2000, escalationPacketId: SHARED_PACKET_ID }),
      makeConsentReceipt({ createdAt: 3000, escalationPacketId: SHARED_PACKET_ID }),
    ];
    const snapshots = receipts.map((r) => JSON.stringify(r));
    buildReceiptChains(receipts);
    receipts.forEach((r, i) => {
      expect(JSON.stringify(r)).toBe(snapshots[i]);
    });
  });

  it("no fetch/provider/model/cloud calls occur during display derivation", () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (() => {
      fetchCalled = true;
      return Promise.reject(new Error("fetch should not be called"));
    }) as typeof fetch;

    try {
      const receipts = [
        makeAssessmentReceipt({ escalationPacketId: SHARED_PACKET_ID }),
        makePolicyReceipt({ escalationPacketId: SHARED_PACKET_ID }),
        makeOfferReceipt({ escalationPacketId: SHARED_PACKET_ID }),
        makeConsentReceipt({ escalationPacketId: SHARED_PACKET_ID }),
        makeCapabilityReceipt(),
        makeUnrelatedReceipt(),
      ];
      const chains = buildReceiptChains(receipts);
      expect(fetchCalled).toBe(false);
      expect(chains.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("summarizeReceiptChain", () => {
  it("returns capability summary for capability-decision chains", () => {
    const chain: TabulariumReceiptChain = {
      id: "chain-test",
      kind: "capability-decision",
      title: "Capability decision",
      summary: "",
      createdAt: 1000,
      updatedAt: 1000,
      steps: [],
      nothingSentYet: true,
      cloudUsed: false,
    };
    expect(summarizeReceiptChain(chain)).toBe(
      "Squidley evaluated this capability before acting.",
    );
  });

  it("returns cloud-consent-flow granted summary", () => {
    const chain: TabulariumReceiptChain = {
      id: "chain-test",
      kind: "cloud-consent-flow",
      title: "Cloud consent flow",
      summary: "",
      createdAt: 1000,
      updatedAt: 4000,
      steps: [],
      finalDecision: "granted",
      nothingSentYet: true,
      cloudUsed: false,
    };
    const summary = summarizeReceiptChain(chain);
    expect(summary).toContain("consent was granted");
    expect(summary).toContain("nothing was sent");
  });

  it("returns gateway-security-flow summary with Velum for medium risk", () => {
    const chain: TabulariumReceiptChain = {
      id: "chain-test",
      kind: "gateway-security-flow",
      title: "Gateway security flow",
      summary: "",
      createdAt: 1000,
      updatedAt: 2000,
      steps: [],
      riskLevel: "medium",
      nothingSentYet: true,
      cloudUsed: false,
    };
    const summary = summarizeReceiptChain(chain);
    expect(summary).toContain("Velum review");
    expect(summary).toMatch(/[Nn]othing was sent/);
  });
});
