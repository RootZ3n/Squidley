/**
 * Small Model Reliability Layer — public type surface.
 *
 * The reliability layer makes Squidley Public usable with small local
 * models by wrapping a user request in:
 *
 *   - a SmallModelTask (the request + the safety envelope)
 *   - a bounded sequence of ReliabilityStep entries (plan -> tool -> validate
 *     -> retry -> decompose -> escalation_offer -> blocked)
 *   - a ReliabilityResult (the answer plus receipts)
 *
 * Everything in this module is local-first. Cloud escalation may only ever
 * be *suggested*; it can never run on its own. The contract is enforced by
 * the constant fields below (`cloudUsed: false` is a literal type, not a
 * boolean — flipping it requires a type change).
 */

import type { TabulariumReceipt } from "@/lib/tabularium/receipts";

/** Risk tiers reused from the prompt gateway vocabulary. */
export type ReliabilityRiskLevel = "safe" | "review" | "blocked";

/** Mode the task is permitted to operate in. */
export type ReliabilityTaskMode = "local" | "cloud_candidate" | "blocked";

/** All allowed compound-tool identifiers a task may invoke. */
export type CompoundToolId =
  | "explain_project_structure"
  | "inspect_one_file_safely"
  | "summarize_error_and_next_step"
  | "run_local_health_check"
  | "make_small_text_change_and_verify";

export interface SmallModelTask {
  readonly id: string;
  readonly userPrompt: string;
  readonly mode: ReliabilityTaskMode;
  readonly riskLevel: ReliabilityRiskLevel;
  readonly maxSteps: number;
  readonly maxRetries: number;
  readonly allowedActions: readonly CompoundToolId[];
  /** Approximate character budget for any packed context this task uses. */
  readonly contextBudget: number;
  readonly createdAt: number;
}

export type ReliabilityStepKind =
  | "plan"
  | "compound_tool"
  | "validate"
  | "retry"
  | "decompose"
  | "escalation_offer"
  | "blocked";

export type ReliabilityStepStatus = "pending" | "pass" | "fail" | "skipped";

export interface ReliabilityStep {
  readonly kind: ReliabilityStepKind;
  readonly status: ReliabilityStepStatus;
  readonly summary: string;
  /** Optional short evidence string. Free of raw user prompts/file content. */
  readonly evidence?: string;
  readonly error?: string;
  /** When the step was recorded (epoch ms). Useful for tests + UI. */
  readonly at: number;
}

export interface ReliabilityResult {
  readonly ok: boolean;
  /** Final, beginner-readable answer. Always a real string. */
  readonly finalAnswer: string;
  readonly steps: readonly ReliabilityStep[];
  /** True if the entire run stayed local. */
  readonly localOnly: true;
  /** Whether an escalation was *suggested* (never auto-run). */
  readonly cloudSuggested: boolean;
  /** Always false — this layer never runs cloud calls itself. */
  readonly cloudUsed: false;
  readonly receipts: readonly TabulariumReceipt[];
}

/**
 * Default policy values. Tests and callers may construct tasks directly,
 * but {@link DEFAULT_RELIABILITY_POLICY} captures the contract the rest of
 * the module assumes.
 */
export interface ReliabilityPolicy {
  readonly maxSteps: number;
  readonly maxRetries: number;
  readonly contextBudget: number;
  readonly allowedActions: readonly CompoundToolId[];
  readonly beginnerMode: boolean;
  readonly allowCloudEscalationOffer: boolean;
}

export const DEFAULT_ALLOWED_COMPOUND_TOOLS: readonly CompoundToolId[] = [
  "explain_project_structure",
  "inspect_one_file_safely",
  "summarize_error_and_next_step",
  "run_local_health_check",
];

export const DEFAULT_RELIABILITY_POLICY: ReliabilityPolicy = {
  maxSteps: 6,
  maxRetries: 2,
  contextBudget: 4000,
  allowedActions: DEFAULT_ALLOWED_COMPOUND_TOOLS,
  beginnerMode: true,
  allowCloudEscalationOffer: true,
};

/**
 * Build a SmallModelTask using the default policy. Pure: no I/O.
 * Tasks are immutable once constructed.
 */
export function createSmallModelTask(args: {
  id?: string;
  userPrompt: string;
  riskLevel?: ReliabilityRiskLevel;
  mode?: ReliabilityTaskMode;
  policy?: Partial<ReliabilityPolicy>;
  now?: number;
}): SmallModelTask {
  const createdAt = args.now ?? Date.now();
  const policy: ReliabilityPolicy = {
    ...DEFAULT_RELIABILITY_POLICY,
    ...(args.policy ?? {}),
  };
  const risk = args.riskLevel ?? "safe";
  const mode: ReliabilityTaskMode =
    risk === "blocked" ? "blocked" : (args.mode ?? "local");
  return {
    id: args.id ?? `task-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    userPrompt: args.userPrompt,
    mode,
    riskLevel: risk,
    maxSteps: Math.max(1, policy.maxSteps),
    maxRetries: Math.max(0, policy.maxRetries),
    allowedActions: policy.allowedActions,
    contextBudget: Math.max(256, policy.contextBudget),
    createdAt,
  };
}
