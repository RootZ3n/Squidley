import { describe, expect, it } from "vitest";
import { cloudProvidersAreLockedByDefault } from "@/lib/providers/registry";
import {
  buildAssessmentReceiptMetadata,
  decideAssessmentAction,
  resolveAssessmentModelCapability,
} from ".";

const base = {
  providerId: "ollama" as const,
  unlockLevel: "public-local" as const,
  taskRisk: "low" as const,
  promptGatewayRisk: "low" as const,
  workspacePermission: false,
  toolPermission: false,
  approvalPolicy: "none" as const,
};

describe("Assessment Adaptive System Intelligence", () => {
  it("uses conservative fallback for unknown local models", () => {
    const profile = resolveAssessmentModelCapability({
      providerId: "ollama",
      providerType: "local",
      modelId: "mystery-local:latest",
    });

    expect(profile.confidence).toBe("low");
    expect(profile.autonomyRecommendation).toBe("explain-only");
    expect(profile.toolUseReliability).toBe("none");
    expect(profile.notRecommendedFor).toContain("agent workflows");
  });

  it("detects known local vision models", () => {
    const profile = resolveAssessmentModelCapability({
      providerId: "ollama",
      providerType: "local",
      modelId: "qwen3-vl:4b",
    });

    expect(profile.supportsVision).toBe(true);
    expect(profile.visionAbility).toBe("basic");
    expect(profile.modelSummary).toMatch(/vision-capable/i);
  });

  it("allows deterministic modules without a model", () => {
    const decision = decideAssessmentAction({
      ...base,
      moduleId: "velum",
      actionId: "velum.deterministic-review",
      modelId: "",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.effectiveMode).toBe("deterministic");
    expect(decision.modelSummary).not.toMatch(/agent work/i);
  });

  it("allows Workshop single-file suggestions in public-local", () => {
    const decision = decideAssessmentAction({
      ...base,
      moduleId: "fabrica",
      actionId: "workshop.single-file-suggestion",
      modelId: "llama3.2:3b",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe("available");
    expect(decision.capabilityLevel).toBe("suggest");
  });

  it("locks Workshop multi-file build until cloud-agent mode", () => {
    const decision = decideAssessmentAction({
      ...base,
      moduleId: "fabrica",
      actionId: "workshop.multi-file-build",
      modelId: "qwen2.5-coder:3b",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("future");
  });

  it("allows Chat basic chat with a local model", () => {
    const decision = decideAssessmentAction({
      ...base,
      moduleId: "colloquium",
      actionId: "chat.basic",
      modelId: "llama3.2:3b",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.effectiveMode).toBe("local-chat");
  });

  it("limits Chat advanced planning with a small local model", () => {
    const decision = decideAssessmentAction({
      ...base,
      moduleId: "colloquium",
      actionId: "chat.advanced-planning",
      modelId: "llama3.2:3b",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("needs-cloud-unlock");
  });

  it("locks Legatus agent workflow in public-local", () => {
    const decision = decideAssessmentAction({
      ...base,
      moduleId: "legatus",
      actionId: "legatus.agent-workflow",
      modelId: "llama3.2:3b",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("needs-cloud-unlock");
  });

  it("cloud-connected alone does not unlock agents", () => {
    const decision = decideAssessmentAction({
      ...base,
      providerId: "openai",
      unlockLevel: "cloud-connected",
      moduleId: "legatus",
      actionId: "legatus.agent-workflow",
      modelId: "future-frontier",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("needs-cloud-unlock");
  });

  it("cloud-agent with capable profile and permissions can allow future agent decisions", () => {
    const decision = decideAssessmentAction({
      ...base,
      providerId: "openai",
      unlockLevel: "cloud-agent",
      moduleId: "legatus",
      actionId: "legatus.agent-workflow",
      modelId: "future-frontier",
      workspacePermission: true,
      toolPermission: true,
      approvalPolicy: "ask",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.effectiveMode).toBe("cloud-agent");
    expect(decision.capabilityLevel).toBe("agentic");
  });

  it("high prompt gateway risk affects decisions", () => {
    const decision = decideAssessmentAction({
      ...base,
      moduleId: "fabrica",
      actionId: "workshop.single-file-suggestion",
      modelId: "llama3.2:3b",
      taskRisk: "medium",
      promptGatewayRisk: "high",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("requires-approval");
  });

  it("does not overstate unknown model capability in beginner messages", () => {
    const decision = decideAssessmentAction({
      ...base,
      moduleId: "colloquium",
      actionId: "chat.basic",
      modelId: "unknown-model",
    });

    expect(decision.modelSummary).toMatch(/unknown/i);
    expect(decision.modelSummary).toMatch(/conservatively/i);
  });

  it("keeps cloud providers locked by default and receipt metadata safe", () => {
    expect(cloudProvidersAreLockedByDefault()).toBe(true);
    const decision = decideAssessmentAction({
      ...base,
      moduleId: "colloquium",
      actionId: "chat.basic",
      modelId: "llama3.2:3b",
    });
    expect(buildAssessmentReceiptMetadata(decision)).toMatchObject({
      subsystem: "ratio",
      cloudUsed: false,
    });
  });
});
