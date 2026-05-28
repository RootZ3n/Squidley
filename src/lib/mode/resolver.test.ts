import { describe, it, expect } from "vitest";
import {
  resolveMode,
  isLocalMode,
  isCloudMode,
  ENV_KEY_MODE,
  CLOUD_API_KEY_ENV_VARS,
} from "./resolver";
import { LOCAL_MODE_STATE, CLOUD_MODE_STATE } from "./types";
import { CLOUD_PROVIDER_REGISTRY, getConfiguredCloudProviders, isCloudModeViable } from "../providers/cloudRegistry";
import { TOOL_REGISTRY, getToolsForMode, getApprovalRequiredTools, getHighRiskTools } from "./toolRegistry";
import { MODE_CAPABILITY_MATRIX, getModeCapabilitySummary } from "./capabilityMatrix";
import { decideEscalation } from "./escalation";
import {
  makeLocalModeProvenance,
  makeCloudModeProvenance,
  makeFailedModeProvenance,
  modeProvenanceToReceiptMetadata,
} from "./provenance";

// ---------------------------------------------------------------------------
// 1. Mode resolver
// ---------------------------------------------------------------------------

describe("Mode resolver", () => {
  it("defaults to local mode when no env or config is set", () => {
    const result = resolveMode({ env: {} });
    expect(result.state.mode).toBe("local");
    expect(result.source).toBe("default");
  });

  it("defaults to local mode with empty env", () => {
    const result = resolveMode({ env: {} });
    expect(result.state).toEqual(LOCAL_MODE_STATE);
  });

  it("resolves cloud mode from SQUIDLEY_MODE=cloud", () => {
    const result = resolveMode({ env: { SQUIDLEY_MODE: "cloud" } });
    expect(result.state.mode).toBe("cloud");
    expect(result.state).toEqual(CLOUD_MODE_STATE);
    expect(result.source).toBe("env-var");
  });

  it("resolves local mode from SQUIDLEY_MODE=local", () => {
    const result = resolveMode({ env: { SQUIDLEY_MODE: "local" } });
    expect(result.state.mode).toBe("local");
    expect(result.source).toBe("env-var");
  });

  it("falls back to local for invalid SQUIDLEY_MODE values", () => {
    for (const value of ["invalid", "hybrid", "both", "auto", ""]) {
      const result = resolveMode({ env: { SQUIDLEY_MODE: value } });
      expect(result.state.mode).toBe("local");
    }
  });

  it("accepts case-insensitive cloud value", () => {
    for (const value of ["CLOUD", "Cloud", "cLOUD"]) {
      const result = resolveMode({ env: { SQUIDLEY_MODE: value } });
      expect(result.state.mode).toBe("cloud");
    }
  });

  it("explicit config takes precedence over env var", () => {
    const result = resolveMode({
      env: { SQUIDLEY_MODE: "local" },
      explicitMode: "cloud",
    });
    expect(result.state.mode).toBe("cloud");
    expect(result.source).toBe("explicit-config");
  });
});

// ---------------------------------------------------------------------------
// 2. Local mode cloud lock — the critical invariant
// ---------------------------------------------------------------------------

describe("Local mode cloud lock", () => {
  it("API keys alone do NOT enable cloud mode", () => {
    const env: Record<string, string> = {};
    for (const key of CLOUD_API_KEY_ENV_VARS) {
      env[key] = "sk-test-key-12345";
    }
    const result = resolveMode({ env });
    expect(result.state.mode).toBe("local");
    expect(result.cloudApiKeysPresent).toBe(true);
    expect(result.cloudApiKeysFound.length).toBe(CLOUD_API_KEY_ENV_VARS.length);
    // Mode MUST still be local
    expect(result.state.cloudUnlocked).toBe(false);
    expect(result.state.providerPolicy).toBe("local-only");
  });

  it("hostile cloud env vars do not change mode to cloud", () => {
    const result = resolveMode({
      env: {
        OPENAI_API_KEY: "sk-hostile-key",
        ANTHROPIC_API_KEY: "sk-hostile-key",
        GOOGLE_API_KEY: "hostile-key",
        // No SQUIDLEY_MODE set!
      },
    });
    expect(result.state.mode).toBe("local");
    expect(result.state.cloudUnlocked).toBe(false);
  });

  it("local mode blocks cloud provider usage", () => {
    const state = LOCAL_MODE_STATE;
    expect(state.cloudUnlocked).toBe(false);
    expect(state.providerPolicy).toBe("local-only");
    expect(state.localOnlyGuardEnabled).toBe(true);
    expect(state.egressGuardEnabled).toBe(true);
  });

  it("local mode has no tool execution", () => {
    expect(LOCAL_MODE_STATE.toolPolicy).toBe("none");
  });

  it("local mode has local-baseline capability policy", () => {
    expect(LOCAL_MODE_STATE.capabilityPolicy).toBe("local-baseline");
  });
});

// ---------------------------------------------------------------------------
// 3. Cloud mode explicit unlock
// ---------------------------------------------------------------------------

describe("Cloud mode explicit unlock", () => {
  it("SQUIDLEY_MODE=cloud enables cloud mode", () => {
    const result = resolveMode({ env: { SQUIDLEY_MODE: "cloud" } });
    expect(result.state.mode).toBe("cloud");
    expect(result.state.cloudUnlocked).toBe(true);
  });

  it("cloud mode has correct state properties", () => {
    expect(CLOUD_MODE_STATE.cloudUnlocked).toBe(true);
    expect(CLOUD_MODE_STATE.toolPolicy).toBe("approval-gated");
    expect(CLOUD_MODE_STATE.providerPolicy).toBe("cloud-configured");
    expect(CLOUD_MODE_STATE.capabilityPolicy).toBe("cloud-extended");
    expect(CLOUD_MODE_STATE.consentRequired).toBe(true);
    expect(CLOUD_MODE_STATE.receiptsRequired).toBe(true);
    expect(CLOUD_MODE_STATE.localOnlyGuardEnabled).toBe(false);
    expect(CLOUD_MODE_STATE.egressGuardEnabled).toBe(false);
  });

  it("SQUIDLEY_MODE=cloud but no provider configured shows in reasons", () => {
    const result = resolveMode({ env: { SQUIDLEY_MODE: "cloud" } });
    expect(result.state.mode).toBe("cloud");
    expect(result.cloudApiKeysPresent).toBe(false);
    expect(result.reasons.some((r) => r.toLowerCase().includes("no cloud api key") || r.includes("cloud"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Provider registry
// ---------------------------------------------------------------------------

describe("Provider registry", () => {
  it("has both local and cloud providers", () => {
    const local = CLOUD_PROVIDER_REGISTRY.filter((p) => p.locality === "local");
    const cloud = CLOUD_PROVIDER_REGISTRY.filter((p) => p.locality === "cloud");
    expect(local.length).toBeGreaterThanOrEqual(2);
    expect(cloud.length).toBeGreaterThanOrEqual(5);
  });

  it("local providers are IMPLEMENTED or PARTIAL", () => {
    const local = CLOUD_PROVIDER_REGISTRY.filter((p) => p.locality === "local");
    for (const p of local) {
      expect(["IMPLEMENTED", "PARTIAL"]).toContain(p.status);
    }
  });

  it("cloud providers are all NOT_IMPLEMENTED", () => {
    const cloud = CLOUD_PROVIDER_REGISTRY.filter((p) => p.locality === "cloud");
    for (const p of cloud) {
      expect(p.status).toBe("NOT_IMPLEMENTED");
    }
  });

  it("every cloud provider requires an API key", () => {
    const cloud = CLOUD_PROVIDER_REGISTRY.filter((p) => p.locality === "cloud");
    for (const p of cloud) {
      expect(p.requiresApiKey).toBe(true);
      expect(p.envVarNames.length).toBeGreaterThan(0);
    }
  });

  it("no configured cloud providers in empty env", () => {
    const configured = getConfiguredCloudProviders({});
    expect(configured.length).toBe(0);
  });

  it("detects configured cloud providers when API keys are set", () => {
    const configured = getConfiguredCloudProviders({ OPENAI_API_KEY: "sk-test" });
    expect(configured.length).toBe(1);
    expect(configured[0].id).toBe("openai");
  });

  it("cloud mode not viable without implemented cloud adapters", () => {
    const result = isCloudModeViable({ OPENAI_API_KEY: "sk-test" });
    expect(result.viable).toBe(false);
    expect(result.reason).toContain("none have implemented adapters");
  });

  it("cloud mode not viable without any API keys", () => {
    const result = isCloudModeViable({});
    expect(result.viable).toBe(false);
    expect(result.reason).toContain("No cloud provider API keys");
  });
});

// ---------------------------------------------------------------------------
// 5. Mode-aware capability matrix
// ---------------------------------------------------------------------------

describe("Mode-aware capability matrix", () => {
  it("has entries for core capabilities", () => {
    expect(MODE_CAPABILITY_MATRIX.length).toBeGreaterThan(0);
    const ids = MODE_CAPABILITY_MATRIX.map((c) => c.id);
    expect(ids).toContain("chat.basic");
    expect(ids).toContain("chat.advanced-planning");
    expect(ids).toContain("code.single-file");
  });

  it("local READY capabilities have local proof references or implementation files", () => {
    const ready = MODE_CAPABILITY_MATRIX.filter((c) => c.localModeStatus === "READY");
    for (const cap of ready) {
      const hasProof =
        cap.localProofReferences.length > 0 ||
        cap.localImplementation !== undefined;
      expect(hasProof).toBe(true);
    }
  });

  it("cloud mode does not claim READY for unimplemented capabilities", () => {
    const cloudReady = MODE_CAPABILITY_MATRIX.filter(
      (c) => c.cloudModeStatus === "READY",
    );
    for (const cap of cloudReady) {
      // If cloud status is READY, cloudImplementation must exist
      // OR it must be a local-only capability that works in both modes
      const hasImpl =
        cap.cloudImplementation !== undefined ||
        cap.localImplementation !== undefined;
      expect(hasImpl).toBe(true);
    }
  });

  it("NOT_IMPLEMENTED capabilities have no cloud proof references", () => {
    const notImpl = MODE_CAPABILITY_MATRIX.filter(
      (c) => c.cloudModeStatus === "NOT_IMPLEMENTED",
    );
    for (const cap of notImpl) {
      expect(cap.cloudProofReferences.length).toBe(0);
    }
  });

  it("summary counts are consistent", () => {
    const localSummary = getModeCapabilitySummary("local");
    const cloudSummary = getModeCapabilitySummary("cloud");
    const totalLocal = Object.values(localSummary).reduce((a, b) => a + (b ?? 0), 0);
    const totalCloud = Object.values(cloudSummary).reduce((a, b) => a + (b ?? 0), 0);
    expect(totalLocal).toBe(MODE_CAPABILITY_MATRIX.length);
    expect(totalCloud).toBe(MODE_CAPABILITY_MATRIX.length);
  });
});

// ---------------------------------------------------------------------------
// 6. Mode-aware tool matrix
// ---------------------------------------------------------------------------

describe("Mode-aware tool matrix", () => {
  it("has entries for core tool categories", () => {
    const categories = new Set(TOOL_REGISTRY.map((t) => t.category));
    expect(categories.has("chat")).toBe(true);
    expect(categories.has("file_write")).toBe(true);
    expect(categories.has("shell")).toBe(true);
    expect(categories.has("web_search")).toBe(true);
    expect(categories.has("diagnostics")).toBe(true);
  });

  it("every implemented tool has an implementationFile", () => {
    const implemented = TOOL_REGISTRY.filter((t) => t.implemented);
    for (const tool of implemented) {
      expect(tool.implementationFile).toBeTruthy();
    }
  });

  it("every READY local tool is implemented", () => {
    const readyLocal = TOOL_REGISTRY.filter((t) => t.localStatus === "READY");
    for (const tool of readyLocal) {
      expect(tool.implemented).toBe(true);
    }
  });

  it("NOT_IMPLEMENTED tools cannot appear READY", () => {
    const notImpl = TOOL_REGISTRY.filter((t) => !t.implemented);
    for (const tool of notImpl) {
      expect(tool.localStatus).not.toBe("READY");
      // Cloud status can be READY only if it's also implemented
      if (tool.cloudStatus === "READY") {
        expect(tool.implemented).toBe(true);
      }
    }
  });

  it("every high-risk cloud tool requires approval", () => {
    const highRiskCloud = TOOL_REGISTRY.filter(
      (t) => t.riskLevel === "high" && t.cloudStatus !== "DISABLED",
    );
    for (const tool of highRiskCloud) {
      expect(tool.requiresApproval).toBe(true);
    }
  });

  it("Local Mode cannot invoke Cloud Mode-only tools", () => {
    const localTools = getToolsForMode("local");
    for (const tool of localTools) {
      expect(tool.requiresCloudProvider).toBe(false);
    }
  });

  it("local mode tools are a subset of cloud mode available tools plus local-only", () => {
    const localTools = getToolsForMode("local");
    for (const tool of localTools) {
      // Every local tool must also be implementable
      expect(tool.implemented).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Cloud consent policy
// ---------------------------------------------------------------------------

describe("Cloud consent policy", () => {
  it("cloud mode requires consent for cloud actions", () => {
    expect(CLOUD_MODE_STATE.consentRequired).toBe(true);
  });

  it("local mode does not require cloud consent", () => {
    expect(LOCAL_MODE_STATE.consentRequired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Response provenance
// ---------------------------------------------------------------------------

describe("Response provenance", () => {
  it("local mode provenance has mode=local and cloudCalled=false", () => {
    const prov = makeLocalModeProvenance({ model: "llama3.2", backend: "ollama" });
    expect(prov.mode).toBe("local");
    expect(prov.cloudCalled).toBe(false);
    expect(prov.cloudConsentState).toBe("not_required");
    expect(prov.responseMode).toBe("local_model");
  });

  it("cloud mode provenance with consent=granted has cloudCalled=true", () => {
    const prov = makeCloudModeProvenance({
      cloudProvider: "openai",
      model: "gpt-4",
      cloudConsentState: "granted",
    });
    expect(prov.mode).toBe("cloud");
    expect(prov.cloudCalled).toBe(true);
    expect(prov.cloudProvider).toBe("openai");
  });

  it("cloud mode provenance with consent=denied has cloudCalled=false", () => {
    const prov = makeCloudModeProvenance({
      cloudProvider: "openai",
      model: "gpt-4",
      cloudConsentState: "denied",
    });
    expect(prov.mode).toBe("cloud");
    expect(prov.cloudCalled).toBe(false);
  });

  it("cloud mode provenance with consent=not_asked has cloudCalled=false", () => {
    const prov = makeCloudModeProvenance({
      cloudProvider: "openai",
      cloudConsentState: "not_asked",
    });
    expect(prov.cloudCalled).toBe(false);
  });

  it("failed provenance has mode and cloudCalled=false", () => {
    const prov = makeFailedModeProvenance({
      mode: "local",
      reason: "provider unreachable",
      model: "llama3.2",
    });
    expect(prov.mode).toBe("local");
    expect(prov.cloudCalled).toBe(false);
    expect(prov.responseMode).toBe("failed");
  });

  it("receipt metadata is flat string/number/boolean only", () => {
    const prov = makeLocalModeProvenance({
      model: "llama3.2",
      backend: "ollama",
      hallucinatedActions: ["fs.write"],
      unavailableTools: ["fs.write"],
      userVisibleHonestyMessage: "Test message",
    });
    const meta = modeProvenanceToReceiptMetadata(prov);
    for (const [key, value] of Object.entries(meta)) {
      const t = typeof value;
      expect(["string", "number", "boolean"]).toContain(t);
    }
    expect(meta.mode).toBe("local");
    expect(meta.cloudCalled).toBe(false);
    expect(meta.hallucinatedActionsCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 9. UI mode badges (structural checks)
// ---------------------------------------------------------------------------

describe("UI mode badges (structural)", () => {
  it("local mode state has all required badge fields", () => {
    expect(LOCAL_MODE_STATE.mode).toBe("local");
    expect(typeof LOCAL_MODE_STATE.cloudUnlocked).toBe("boolean");
    expect(typeof LOCAL_MODE_STATE.toolPolicy).toBe("string");
    expect(typeof LOCAL_MODE_STATE.providerPolicy).toBe("string");
  });

  it("cloud mode state has all required badge fields", () => {
    expect(CLOUD_MODE_STATE.mode).toBe("cloud");
    expect(typeof CLOUD_MODE_STATE.cloudUnlocked).toBe("boolean");
    expect(typeof CLOUD_MODE_STATE.toolPolicy).toBe("string");
    expect(typeof CLOUD_MODE_STATE.providerPolicy).toBe("string");
  });

  it("API keys alone do not produce cloud mode badge data", () => {
    const result = resolveMode({
      env: { OPENAI_API_KEY: "sk-test", ANTHROPIC_API_KEY: "sk-test" },
    });
    expect(result.state.mode).toBe("local");
    // UI should show LOCAL badge
  });
});

// ---------------------------------------------------------------------------
// 10. Hallucinated tool/cloud claims
// ---------------------------------------------------------------------------

describe("Hallucinated tool/cloud claims in provenance", () => {
  it("local provenance records hallucinated actions", () => {
    const prov = makeLocalModeProvenance({
      hallucinatedActions: ["fs.write", "web_search"],
      unavailableTools: ["fs.write", "web.search"],
      userVisibleHonestyMessage: "Peh cannot write files.",
    });
    expect(prov.hallucinatedActions).toEqual(["fs.write", "web_search"]);
    expect(prov.unavailableTools).toEqual(["fs.write", "web.search"]);
    expect(prov.userVisibleHonestyMessage).toBe("Peh cannot write files.");
    // cloudCalled must still be false
    expect(prov.cloudCalled).toBe(false);
  });

  it("cloud provenance never has hallucinated actions", () => {
    const prov = makeCloudModeProvenance({
      cloudProvider: "openai",
      cloudConsentState: "granted",
    });
    expect(prov.hallucinatedActions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 11. Cloud route not implemented honesty
// ---------------------------------------------------------------------------

describe("Cloud route not implemented honesty", () => {
  it("no cloud provider has IMPLEMENTED status", () => {
    const cloud = CLOUD_PROVIDER_REGISTRY.filter((p) => p.locality === "cloud");
    for (const p of cloud) {
      expect(p.status).not.toBe("IMPLEMENTED");
    }
  });

  it("no cloud tool has READY cloudStatus (except browser-local tools)", () => {
    for (const tool of TOOL_REGISTRY) {
      if (tool.cloudStatus === "READY") {
        // Must be a browser-local tool that doesn't need a cloud provider
        expect(tool.requiresCloudProvider).toBe(false);
        expect(tool.canUseNetwork).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Local-to-cloud escalation blocking
// ---------------------------------------------------------------------------

describe("Local-to-cloud escalation blocking", () => {
  it("local mode missing capability does not call cloud", () => {
    const decision = decideEscalation({
      capabilityId: "code.multi-file",
      mode: "local",
      modeState: LOCAL_MODE_STATE,
      localStatus: "NOT_IMPLEMENTED",
      cloudStatus: "NOT_IMPLEMENTED",
      cloudProviderConfigured: false,
      cloudConsentGranted: false,
      velumReviewPassed: false,
    });
    expect(decision.allowed).toBe(false);
  });

  it("local missing capability says Cloud Mode may support it", () => {
    const decision = decideEscalation({
      capabilityId: "web.search",
      mode: "local",
      modeState: LOCAL_MODE_STATE,
      localStatus: "NOT_IMPLEMENTED",
      cloudStatus: "REQUIRES_PROVIDER",
      cloudProviderConfigured: false,
      cloudConsentGranted: false,
      velumReviewPassed: false,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.suggestCloudMode).toBe(true);
    }
  });

  it("cloud mode missing provider says provider required", () => {
    const decision = decideEscalation({
      capabilityId: "chat.cloud",
      mode: "cloud",
      modeState: CLOUD_MODE_STATE,
      localStatus: "NOT_IMPLEMENTED",
      cloudStatus: "NOT_IMPLEMENTED",
      cloudProviderConfigured: false,
      cloudConsentGranted: false,
      velumReviewPassed: false,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toContain("No cloud provider");
    }
  });

  it("cloud mode with provider but NOT_IMPLEMENTED is blocked", () => {
    const decision = decideEscalation({
      capabilityId: "chat.cloud",
      mode: "cloud",
      modeState: CLOUD_MODE_STATE,
      localStatus: "NOT_IMPLEMENTED",
      cloudStatus: "NOT_IMPLEMENTED",
      cloudProviderConfigured: true,
      cloudConsentGranted: false,
      velumReviewPassed: false,
    });
    expect(decision.allowed).toBe(false);
  });

  it("cloud mode with provider and READY status allows escalation", () => {
    const decision = decideEscalation({
      capabilityId: "chat.basic",
      mode: "cloud",
      modeState: CLOUD_MODE_STATE,
      localStatus: "READY",
      cloudStatus: "READY",
      cloudProviderConfigured: true,
      cloudConsentGranted: true,
      velumReviewPassed: true,
    });
    expect(decision.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13. Cloud mode provider failure honesty
// ---------------------------------------------------------------------------

describe("Cloud mode provider failure honesty", () => {
  it("failed provenance records the failure reason", () => {
    const prov = makeFailedModeProvenance({
      mode: "cloud",
      reason: "provider_timeout",
      cloudProvider: "openai",
    });
    expect(prov.responseMode).toBe("failed");
    expect(prov.cloudCalled).toBe(false);
    expect(prov.finalCapabilityStatus).toContain("provider_timeout");
  });

  it("failed provenance is never confused with success", () => {
    const prov = makeFailedModeProvenance({
      mode: "cloud",
      reason: "connection_refused",
    });
    expect(prov.responseMode).toBe("failed");
    expect(prov.finalCapabilityStatus).not.toContain("answered");
    expect(prov.cloudCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 14. Diagnostic release gate checks (structural)
// ---------------------------------------------------------------------------

describe("Diagnostic release gate (structural)", () => {
  it("default mode is local", () => {
    expect(resolveMode({ env: {} }).state.mode).toBe("local");
  });

  it("cloud env vars do not unlock cloud without mode=cloud", () => {
    const result = resolveMode({
      env: {
        OPENAI_API_KEY: "sk-test",
        ANTHROPIC_API_KEY: "sk-test",
        GOOGLE_API_KEY: "test",
        OPENROUTER_API_KEY: "sk-test",
      },
    });
    expect(result.state.mode).toBe("local");
    expect(result.state.cloudUnlocked).toBe(false);
  });

  it("mode-aware capability matrix is consistent (no READY without proof)", () => {
    for (const cap of MODE_CAPABILITY_MATRIX) {
      if (cap.localModeStatus === "READY") {
        expect(
          cap.localProofReferences.length > 0 || cap.localImplementation !== undefined,
        ).toBe(true);
      }
    }
  });

  it("mode-aware tool matrix is consistent (no READY without implementation)", () => {
    for (const tool of TOOL_REGISTRY) {
      if (tool.localStatus === "READY") {
        expect(tool.implemented).toBe(true);
        expect(tool.implementationFile).toBeTruthy();
      }
    }
  });

  it("cloud NOT_IMPLEMENTED count is tracked", () => {
    const cloudNotImpl = MODE_CAPABILITY_MATRIX.filter(
      (c) => c.cloudModeStatus === "NOT_IMPLEMENTED",
    ).length;
    const cloudReady = MODE_CAPABILITY_MATRIX.filter(
      (c) => c.cloudModeStatus === "READY",
    ).length;
    // At this stage, most cloud capabilities should be NOT_IMPLEMENTED
    expect(cloudNotImpl).toBeGreaterThan(0);
    // Some browser-local capabilities work in both modes
    expect(cloudReady + cloudNotImpl).toBeLessThanOrEqual(MODE_CAPABILITY_MATRIX.length);
  });

  it("isLocalMode and isCloudMode helpers work correctly", () => {
    expect(isLocalMode({ env: {} })).toBe(true);
    expect(isCloudMode({ env: {} })).toBe(false);
    expect(isLocalMode({ env: { SQUIDLEY_MODE: "cloud" } })).toBe(false);
    expect(isCloudMode({ env: { SQUIDLEY_MODE: "cloud" } })).toBe(true);
  });
});
