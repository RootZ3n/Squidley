/**
 * Decompose-on-failure helper.
 *
 * When a broad task fails or fails repeatedly with the same signature,
 * the runner asks this module for a smaller, safer set of sub-tasks the
 * user can pick from. We never recurse: the runner stops after producing
 * the decomposition, and the user (or a higher-level UI) decides what to
 * do next.
 *
 * A *failure signature* is a stable string derived from an error so two
 * occurrences of the same underlying issue look identical. The runner uses
 * it to detect "this is the same error again" without false positives from
 * memory addresses, timestamps, or tempfile suffixes.
 */

import type { CompoundToolId, SmallModelTask } from "./types";

export interface SuggestedSubTask {
  readonly title: string;
  readonly description: string;
  readonly suggestedAction: CompoundToolId | "ask_user";
  readonly safe: true;
}

export interface DecompositionResult {
  readonly originalTaskId: string;
  readonly reason: "max-retries" | "repeated-failure" | "blocked-risk";
  readonly subTasks: readonly SuggestedSubTask[];
  readonly beginnerExplanation: string;
}

const STRIP_PATTERNS: RegExp[] = [
  /0x[0-9a-f]+/gi, // pointers
  /\b\d{10,}\b/g, // long numbers (epochs, pids)
  /\b[A-Fa-f0-9]{16,}\b/g, // hashes
  /["']?\/[A-Za-z0-9._/-]+["']?/g, // file paths
  /:[0-9]+:[0-9]+/g, // line:col
  /\s+at\s+.*$/gm, // stack frames
];

/**
 * Build a stable signature for an error string. Strips volatile detail
 * so the same root cause yields the same signature on different runs.
 */
export function buildFailureSignature(error: string | undefined): string {
  if (!error) return "empty";
  let s = error.toLowerCase().trim();
  for (const re of STRIP_PATTERNS) s = s.replace(re, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, 160) || "empty";
}

export function decomposeTask(
  task: SmallModelTask,
  reason: DecompositionResult["reason"],
): DecompositionResult {
  if (reason === "blocked-risk") {
    return {
      originalTaskId: task.id,
      reason,
      subTasks: [
        {
          title: "Ask the user before continuing",
          description:
            "This request was classified as too risky to run automatically. Peh will explain what she sees and let the user decide.",
          suggestedAction: "ask_user",
          safe: true,
        },
      ],
      beginnerExplanation:
        "Peh stopped because the request looked risky. She does not try to bypass that — she asks the user instead.",
    };
  }

  const subTasks: SuggestedSubTask[] = [
    {
      title: "Find the relevant file",
      description: "List the project structure to find a likely entry point.",
      suggestedAction: "explain_project_structure",
      safe: true,
    },
    {
      title: "Inspect only one file",
      description: "Read a single small file within a strict character budget.",
      suggestedAction: "inspect_one_file_safely",
      safe: true,
    },
    {
      title: "Summarize the error",
      description: "Classify the most recent error and pick one safe next step.",
      suggestedAction: "summarize_error_and_next_step",
      safe: true,
    },
    {
      title: "Run a local health check",
      description: "Confirm the local model server is actually reachable.",
      suggestedAction: "run_local_health_check",
      safe: true,
    },
    {
      title: "Ask the user before editing",
      description:
        "If a fix would change files, ask the user to apply it manually first.",
      suggestedAction: "ask_user",
      safe: true,
    },
  ];

  const beginner =
    reason === "max-retries"
      ? "Peh tried this a few times and the same problem kept happening. Instead of looping forever, she broke the work into smaller, safer steps."
      : "Peh saw the same error twice. Rather than repeat herself, she suggests smaller steps so the user can pick what to try next.";

  return {
    originalTaskId: task.id,
    reason,
    subTasks,
    beginnerExplanation: beginner,
  };
}
