/**
 * Beginner-friendly UI copy for the Small Model Reliability Layer.
 *
 * Pure strings + a single helper that picks one. Importers can render the
 * copy in any framework; nothing here touches React.
 *
 * Honest by design: we do not promise that any of the reliability steps
 * succeed every time. We only describe what they *try* to do.
 */

import type { ReliabilityResult, ReliabilityStep } from "./types";

export const RELIABILITY_HEADLINES = {
  introHeadline: "Local model reliability",
  whyDecompose:
    "Why Squidley may break a big task into smaller steps",
  whyAskBeforeCloud:
    "Why Squidley sometimes asks before using cloud",
  whySummarize:
    "Why Squidley summarizes files instead of reading everything",
  whyValidate:
    "Why Squidley double-checks her own answer before sending it",
} as const;

export const RELIABILITY_PLAIN_LANGUAGE = {
  introBody:
    "Small local models are useful but need guardrails. Squidley uses compound tools, validation, retries, decomposition, and optional cloud escalation to stay honest. Local-first does not mean pretending local models can do everything.",
  decomposeBody:
    "When a big task keeps failing, Squidley stops retrying and suggests smaller, safer next steps. This is not the model giving up — it is the model being honest.",
  askBeforeCloudBody:
    "Squidley never calls a cloud model on her own. If local is stuck, she offers to ask a cloud model and shows you exactly what would be sent (with secrets removed). You decide.",
  summarizeBody:
    "Long files do not fit safely into a small model. Squidley reads the parts she needs, truncates the rest with a visible note, and never silently drops the middle of important code.",
  validateBody:
    "Before saying 'done', Squidley checks that the file existed, the tool ran, and the answer is not empty. If a check fails, she retries once or escalates honestly.",
} as const;

export interface ReliabilityCard {
  readonly title: string;
  readonly body: string;
  readonly bullets: readonly string[];
  readonly footnote: string;
}

export function buildReliabilityIntroCard(): ReliabilityCard {
  return {
    title: RELIABILITY_HEADLINES.introHeadline,
    body: RELIABILITY_PLAIN_LANGUAGE.introBody,
    bullets: [
      "Compound tools keep each step small.",
      "Token budgeting keeps prompts safe for small models.",
      "Bounded retries — at most two — stop infinite loops.",
      "Decomposition turns one stuck task into smaller safe steps.",
      "Cloud escalation is offered, never auto-run.",
    ],
    footnote:
      "Local-first means doing as much as we can locally, honestly. It does not mean pretending small models can do everything.",
  };
}

/**
 * Build a beginner-readable summary of one reliability result. Used by UI
 * footers and the teacher card "explain what happened" view.
 */
export function summarizeReliabilityResultForBeginner(
  result: ReliabilityResult,
): string {
  if (result.ok) {
    return "Squidley answered locally. The answer was checked for emptiness before it was shown.";
  }
  if (result.cloudSuggested) {
    return "Local could not finish this task. Squidley offered to ask a cloud model — nothing was sent.";
  }
  const decomposed = result.steps.some((s: ReliabilityStep) => s.kind === "decompose");
  if (decomposed) {
    return "Local kept hitting the same problem. Instead of looping, Squidley suggested smaller steps to try.";
  }
  return "Local did not produce a complete answer. Squidley is being honest about that.";
}
