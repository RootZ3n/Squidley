/**
 * In-context teaching cards for runtime events.
 *
 * Produces short, collapsible teaching notes that can be shown
 * alongside chat responses and status indicators.
 */

import type { RuntimeTeachingEvent } from "./types";
import { getRuntimeTeachingExplanation } from "./runtimeExplain";

export interface TeachingCard {
  id: string;
  event: RuntimeTeachingEvent;
  headline: string;
  body: string;
  learnMore?: string;
}

const CARD_HEADLINES: Partial<Record<RuntimeTeachingEvent, string>> = {
  response_model_only: "This was a model-only answer",
  no_cloud_call_made: "Nothing left your computer",
  capability_not_implemented: "This feature is not available yet",
  cloud_mode_requested: "Cloud Mode is planned but not built yet",
  gauntlet_try_verify: "This answer may need manual review",
  tool_call_blocked: "This tool is not available in the current mode",
  local_model_failed: "Could not reach your local model",
  receipt_created: "A receipt was saved for this action",
  tool_call_requested: "A tool action was requested",
  approval_requested: "Your permission is needed",
};

/**
 * Build a teaching card for a runtime event.
 * Returns null if the event has no registered hook.
 */
export function buildTeachingCard(event: RuntimeTeachingEvent): TeachingCard | null {
  const explanation = getRuntimeTeachingExplanation(event);
  if (!explanation) return null;

  const headline = CARD_HEADLINES[event] ?? explanation.whatHappened;

  return {
    id: `card-${event}`,
    event,
    headline,
    body: `${explanation.whyItMatters} ${explanation.whatYouCanDoNext}`,
    learnMore: explanation.docsLink,
  };
}

/**
 * Explain-this labels: short inline explanations for key status terms.
 */
export const EXPLAIN_THIS_LABELS: Record<string, { short: string; conceptId: string }> = {
  "local-mode": { short: "Everything runs on your machine. No data leaves your device.", conceptId: "local_mode" },
  "cloud-mode": { short: "Cloud Mode uses remote AI providers. Planned but not implemented yet.", conceptId: "cloud_mode" },
  "no-cloud": { short: "No data was sent to any cloud server for this response.", conceptId: "privacy" },
  "no-tool": { short: "Peh only generated text. No files were read, written, or changed.", conceptId: "model_only_answer" },
  "model-only": { short: "This answer came from the model's text generation, not from a real tool action.", conceptId: "model_only_answer" },
  "receipt": { short: "A record of what Peh actually did. Check the ActivityLog to review.", conceptId: "receipt" },
  "provenance": { short: "Shows where this answer came from: which mode, model, and whether tools or cloud were used.", conceptId: "provenance" },
  "not-implemented": { short: "This feature is planned for a future version. It does not exist yet.", conceptId: "capability_matrix" },
  "try-verify": { short: "The model's response may not be fully accurate. Please review it manually.", conceptId: "hallucination" },
  "approval": { short: "Some actions need your explicit permission before Peh can proceed.", conceptId: "approval" },
};

/**
 * Build a short teach-while-chatting annotation for a response.
 * Returns a brief note suitable for appending below a model answer.
 */
export function buildTeachWhileChattingNote(event: RuntimeTeachingEvent): string | null {
  const card = buildTeachingCard(event);
  if (!card) return null;
  return `${card.headline}. ${card.body}`;
}
