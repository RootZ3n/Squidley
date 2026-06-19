/**
 * Central product status for Peh.
 *
 * This is the single source of truth for whether the product is ready
 * to ship publicly. Local Mode readiness is a subsystem gate, not a
 * product gate. The full product requires Cloud Mode, teaching flows,
 * tool execution, and beginner onboarding.
 *
 * This file is checked by tests and diagnostics to prevent premature
 * release claims.
 */

export type PhaseStatus = "complete" | "in-progress" | "not-started";

export interface ReleasePhase {
  readonly id: string;
  readonly name: string;
  readonly status: PhaseStatus;
  readonly description: string;
  readonly requiredFor: "product-release";
  readonly artifacts: readonly string[];
}

export const RELEASE_PHASES: readonly ReleasePhase[] = [
  {
    id: "phase-1",
    name: "Local Foundation",
    status: "complete",
    description: "Local model chat, egress guard, honesty annotation, provenance, local-only proof, capability/tool matrices.",
    requiredFor: "product-release",
    artifacts: [
      "src/lib/chat/handler.ts",
      "src/lib/chat/stream.ts",
      "src/lib/chat/honestyAnnotation.ts",
      "src/lib/chat/responseMode.ts",
      "src/lib/providers/local.ts",
      "src/lib/mode/resolver.ts",
      "scripts/prove-local-only.mjs",
      "scripts/peh-pub-diagnostic.mjs",
    ],
  },
  {
    id: "phase-2",
    name: "Teaching Layer",
    status: "in-progress",
    description: "Beginner onboarding, self-explanation system, guided setup, concept explanations (local model, cloud provider, agent, tools, approvals, receipts).",
    requiredFor: "product-release",
    artifacts: [
      "src/lib/teacher/types.ts",
      "src/lib/teacher/concepts.ts",
      "src/lib/teacher/lessonRegistry.ts",
      "src/lib/teacher/runtimeHooks.ts",
      "src/lib/teacher/onboarding.ts",
      "src/lib/teacher/explain.ts",
      "src/lib/teacher/detect.ts",
      "src/lib/teacher/chatIntegration.ts",
      "src/lib/teacher/onboardingProgress.ts",
      "src/lib/teacher/runtimeExplain.ts",
      "src/app/api/teacher/explain/route.ts",
      "src/app/api/teacher/concepts/route.ts",
      "src/app/api/teacher/lessons/route.ts",
      "src/app/api/teacher/onboarding/route.ts",
      "src/app/teacher/page.tsx",
      "src/lib/teacher/teachingSettings.ts",
      "src/lib/teacher/teachingCards.ts",
      "docs/teacher-kb/manifest.json",
      "docs/TEACHER_FIRST_DOCTRINE.md",
    ],
  },
  {
    id: "phase-3",
    name: "Cloud Mode Foundation",
    status: "not-started",
    description: "Cloud provider adapters, provider setup wizard, API key education, cloud consent flow, cloud chat/streaming, cloud receipts/provenance, cost warnings.",
    requiredFor: "product-release",
    artifacts: [],
  },
  {
    id: "phase-4",
    name: "Tool Execution",
    status: "not-started",
    description: "File read, file write with approval, project inspection, document parsing, web/search, memory write, shell proposal/execution with approval, per-tool receipts.",
    requiredFor: "product-release",
    artifacts: [],
  },
  {
    id: "phase-5",
    name: "Autonomous Agent Workflows",
    status: "not-started",
    description: "Task planning, multi-step execution, progress tracking, approval checkpoints, rollback/failure honesty, agent receipts, teach-while-doing mode.",
    requiredFor: "product-release",
    artifacts: [],
  },
  {
    id: "phase-6",
    name: "Release Candidate",
    status: "not-started",
    description: "All phases complete, all diagnostics green, all gauntlets pass, onboarding tested, no overclaims, user can understand system with zero prior experience.",
    requiredFor: "product-release",
    artifacts: [],
  },
] as const;

/**
 * The product is NOT release-ready until all phases are complete.
 * This is a hard gate, not advisory.
 */
export const PUBLIC_RELEASE_READY = false as const;

/**
 * Subsystem status. Local Mode is a ready subsystem even though the
 * product is not ready to ship.
 */
export const LOCAL_MODE_SUBSYSTEM_READY = true as const;
export const CLOUD_MODE_SUBSYSTEM_READY = false as const;
export const TEACHING_LAYER_READY = false as const;
export const TOOL_EXECUTION_READY = false as const;
export const AUTONOMOUS_WORKFLOWS_READY = false as const;

export function getIncompletePhases(): ReleasePhase[] {
  return RELEASE_PHASES.filter((p) => p.status !== "complete");
}

export function getProductStatusSummary(): {
  publicReleaseReady: false;
  localModeReady: true;
  cloudModeReady: false;
  teachingLayerReady: false;
  phasesComplete: number;
  phasesTotal: number;
  nextPhase: string;
  blockers: string[];
} {
  const incomplete = getIncompletePhases();
  return {
    publicReleaseReady: false,
    localModeReady: true,
    cloudModeReady: false,
    teachingLayerReady: false,
    phasesComplete: RELEASE_PHASES.length - incomplete.length,
    phasesTotal: RELEASE_PHASES.length,
    nextPhase: incomplete[0]?.name ?? "none",
    blockers: incomplete.map((p) => `${p.name}: ${p.status}`),
  };
}
