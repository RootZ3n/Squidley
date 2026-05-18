/**
 * Bounded reliability runner.
 *
 * The runner orchestrates one user request through the reliability layer:
 *
 *   1. Plan step (record that a task started)
 *   2. Tool step (run the chosen compound tool — or a model action injected
 *      via the `modelAction` callback)
 *   3. Validate step (deterministic checks: did the file exist? did the
 *      tool return ok? did the model produce non-empty content?)
 *   4. Retry once if validation failed
 *   5. If validation fails again with the same signature, decompose
 *   6. If decomposition still doesn't yield a clean run, optionally offer
 *      cloud escalation (never auto-run)
 *   7. Produce a beginner-readable final answer and the receipt trail
 *
 * The runner does *not* perform IO directly — it delegates to a
 * `ReliabilityModelAction` (for model calls) and to compound tools (for
 * file / health checks). This keeps the loop testable.
 */

import { createTabulariumReceipt, type TabulariumReceipt } from "@/lib/tabularium/receipts";
import {
  buildEscalationTimelineNoConsent,
  type EscalationReceiptEvent,
} from "./escalation";
import { buildFailureSignature, decomposeTask, type DecompositionResult } from "./decompose";
import type {
  ReliabilityResult,
  ReliabilityStep,
  ReliabilityStepKind,
  ReliabilityStepStatus,
  SmallModelTask,
} from "./types";

export interface ReliabilityModelOutcome {
  readonly ok: boolean;
  readonly content: string;
  readonly error?: string;
  readonly evidence?: string;
}

export type ReliabilityModelAction = (
  task: SmallModelTask,
  attempt: number,
  lastError: string | undefined,
) => Promise<ReliabilityModelOutcome>;

export interface ReliabilityValidator {
  (outcome: ReliabilityModelOutcome): { ok: boolean; reason?: string };
}

export interface RunReliabilityOptions {
  readonly task: SmallModelTask;
  readonly action: ReliabilityModelAction;
  readonly validate?: ReliabilityValidator;
  readonly cloudConfigured?: boolean;
  /** Inject a deterministic clock for tests. */
  readonly now?: () => number;
}

export const defaultValidator: ReliabilityValidator = (outcome) => {
  if (!outcome.ok) return { ok: false, reason: outcome.error ?? "action returned ok=false" };
  if (typeof outcome.content !== "string" || outcome.content.trim().length === 0) {
    return { ok: false, reason: "empty content" };
  }
  return { ok: true };
};

function makeStep(
  kind: ReliabilityStepKind,
  status: ReliabilityStepStatus,
  summary: string,
  at: number,
  extras?: { evidence?: string; error?: string },
): ReliabilityStep {
  return {
    kind,
    status,
    summary,
    ...(extras?.evidence ? { evidence: extras.evidence } : {}),
    ...(extras?.error ? { error: extras.error } : {}),
    at,
  };
}

function blockedResult(task: SmallModelTask, now: number): ReliabilityResult {
  const decomposition = decomposeTask(task, "blocked-risk");
  const receipt = createTabulariumReceipt({
    module: "system",
    action: "reliability.blocked",
    status: "interrupted",
    title: "Reliability runner: blocked",
    summary:
      "Squidley refused to run this task because the safety classification was 'blocked'.",
    metadata: { taskId: task.id, risk: task.riskLevel, cloud_used: false },
    createdAt: now,
  });
  return {
    ok: false,
    finalAnswer: renderBlockedAnswer(decomposition),
    steps: [
      makeStep("blocked", "fail", "Task risk is blocked — refusing to run", now, {
        evidence: `risk=${task.riskLevel}`,
      }),
      makeStep("decompose", "pass", "Suggested asking the user instead", now),
    ],
    localOnly: true,
    cloudSuggested: false,
    cloudUsed: false,
    receipts: [receipt],
  };
}

function renderBlockedAnswer(decomposition: DecompositionResult): string {
  const bullets = decomposition.subTasks
    .map((s) => `- ${s.title}: ${s.description}`)
    .join("\n");
  return `${decomposition.beginnerExplanation}\n\n${bullets}`;
}

function renderSuccess(content: string): string {
  return content.trim();
}

function renderDecomposedAnswer(
  decomposition: DecompositionResult,
  lastError: string | undefined,
): string {
  const bullets = decomposition.subTasks
    .map((s) => `- ${s.title}: ${s.description}`)
    .join("\n");
  const detail = lastError ? `\n\nLast error: ${lastError}` : "";
  return `${decomposition.beginnerExplanation}\n\nSuggested smaller steps:\n${bullets}${detail}`;
}

export async function runReliability(
  opts: RunReliabilityOptions,
): Promise<ReliabilityResult> {
  const now = opts.now ?? Date.now;
  const validate = opts.validate ?? defaultValidator;
  const { task } = opts;

  if (task.mode === "blocked" || task.riskLevel === "blocked") {
    return blockedResult(task, now());
  }

  const steps: ReliabilityStep[] = [];
  const receipts: TabulariumReceipt[] = [];

  steps.push(
    makeStep("plan", "pass", `Started task ${task.id}`, now(), {
      evidence: `mode=${task.mode}, risk=${task.riskLevel}, maxRetries=${task.maxRetries}`,
    }),
  );

  receipts.push(
    createTabulariumReceipt({
      module: "system",
      action: "reliability.task-started",
      status: "running",
      title: "Reliability task started",
      summary: `Task ${task.id} started in ${task.mode} mode.`,
      metadata: {
        taskId: task.id,
        mode: task.mode,
        risk: task.riskLevel,
        max_retries: task.maxRetries,
        cloud_used: false,
      },
      createdAt: now(),
    }),
  );

  let lastSignature: string | undefined;
  let lastError: string | undefined;
  let lastOutcome: ReliabilityModelOutcome | undefined;
  let succeeded = false;
  const maxAttempts = 1 + Math.max(0, task.maxRetries);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const outcome = await opts.action(task, attempt, lastError);
    lastOutcome = outcome;
    steps.push(
      makeStep(
        attempt === 1 ? "compound_tool" : "retry",
        outcome.ok ? "pass" : "fail",
        attempt === 1 ? "Ran primary action" : `Retried (attempt ${attempt})`,
        now(),
        { evidence: outcome.evidence, error: outcome.error },
      ),
    );

    const verdict = validate(outcome);
    steps.push(
      makeStep(
        "validate",
        verdict.ok ? "pass" : "fail",
        verdict.ok ? "Validation passed" : `Validation failed: ${verdict.reason}`,
        now(),
        { error: verdict.ok ? undefined : verdict.reason },
      ),
    );

    if (verdict.ok) {
      succeeded = true;
      break;
    }

    const sig = buildFailureSignature(verdict.reason ?? outcome.error);
    if (lastSignature && lastSignature === sig) {
      // Same failure twice in a row — stop retrying and decompose.
      steps.push(
        makeStep("decompose", "pass", "Same failure signature repeated — decomposing", now()),
      );
      break;
    }
    lastSignature = sig;
    lastError = verdict.reason ?? outcome.error;

    if (steps.length >= task.maxSteps) {
      steps.push(
        makeStep(
          "decompose",
          "pass",
          "Max steps reached — decomposing instead of looping",
          now(),
        ),
      );
      break;
    }
  }

  if (succeeded && lastOutcome) {
    receipts.push(
      createTabulariumReceipt({
        module: "system",
        action: "reliability.task-succeeded",
        status: "succeeded",
        title: "Reliability task succeeded",
        summary: "Local model produced a non-empty, validated answer.",
        metadata: { taskId: task.id, cloud_used: false },
        createdAt: now(),
      }),
    );
    return {
      ok: true,
      finalAnswer: renderSuccess(lastOutcome.content),
      steps,
      localOnly: true,
      cloudSuggested: false,
      cloudUsed: false,
      receipts,
    };
  }

  // Decomposition path
  const decompositionReason = steps.some(
    (s) => s.kind === "decompose" && s.summary.includes("Same failure"),
  )
    ? "repeated-failure"
    : "max-retries";
  const decomposition = decomposeTask(task, decompositionReason);

  // Build escalation timeline. Cloud is *never* called here — only offered.
  const escalation = buildEscalationTimelineNoConsent({
    task,
    localFailureSummary: lastError ?? "Local action did not produce a valid answer.",
    proposedPromptForCloud: task.userPrompt,
    cloudConfigured: opts.cloudConfigured ?? false,
    decision: "skipped",
    now: now(),
  });
  for (const evt of escalation.events) receipts.push(evt.receipt);

  steps.push(
    makeStep(
      "escalation_offer",
      "pass",
      escalation.offer
        ? "Offered cloud escalation (not used)"
        : "No cloud preview could be built",
      now(),
      { evidence: `cloudConfigured=${opts.cloudConfigured ?? false}` },
    ),
  );

  receipts.push(
    createTabulariumReceipt({
      module: "system",
      action: "reliability.task-decomposed",
      status: "failed",
      title: "Reliability task decomposed",
      summary: decomposition.beginnerExplanation,
      metadata: {
        taskId: task.id,
        reason: decompositionReason,
        subtask_count: decomposition.subTasks.length,
        cloud_used: false,
      },
      createdAt: now(),
    }),
  );

  return {
    ok: false,
    finalAnswer: renderDecomposedAnswer(decomposition, lastError),
    steps,
    localOnly: true,
    cloudSuggested: Boolean(escalation.offer),
    cloudUsed: false,
    receipts,
  };
}

// Findable convenience: a quick helper exposed for tests + callers that
// want to inspect the trace afterwards.
export function countStepsOfKind(
  steps: readonly ReliabilityStep[],
  kind: ReliabilityStepKind,
): number {
  return steps.reduce((acc, step) => (step.kind === kind ? acc + 1 : acc), 0);
}

export function summarizeEscalationEvents(
  events: readonly EscalationReceiptEvent[],
): string[] {
  return events.map((e) => e.kind);
}
