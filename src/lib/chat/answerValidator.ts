/**
 * Validate a local model's chat reply for "did this actually answer
 * anything?". Deterministic, no model calls.
 *
 * Failure categories:
 *   - "empty"        — whitespace / no content / placeholder only.
 *   - "refusal"      — model returned a canned 'I cannot help' that
 *                       doesn't address the question.
 *   - "tool-noise"   — reply is only a description of using a tool, no
 *                       actual answer (e.g. "I'll use the search tool…"
 *                       with nothing after).
 *   - "fake-success" — claims success ("I've fixed it", "I've written
 *                       the file") in a build that has no tool
 *                       execution surface. Treated as failure because
 *                       the claim cannot be backed by evidence.
 */

export type AnswerValidationReason =
  | "empty"
  | "refusal"
  | "tool-noise"
  | "fake-success";

export interface AnswerValidation {
  readonly ok: boolean;
  readonly reason?: AnswerValidationReason;
  readonly detail?: string;
}

const REFUSAL_PATTERNS: readonly RegExp[] = [
  /^\s*(?:i\s+(?:cannot|can'?t|am\s+unable|won'?t|don'?t)\s+(?:help|assist|answer|provide))/i,
  /^\s*(?:sorry,?\s+(?:i\s+(?:cannot|can'?t))|i'?m\s+sorry,?\s+(?:i\s+(?:cannot|can'?t)))/i,
  /^\s*as\s+an\s+ai\s+(?:language\s+)?model,?\s+i\s+(?:cannot|can'?t)/i,
];

const TOOL_NOISE_PATTERNS: readonly RegExp[] = [
  /^\s*(?:i'?ll|i\s+will|let\s+me)\s+(?:use|call|run)\s+(?:the\s+)?[\w_-]+\s+(?:tool|function)/i,
  /^\s*<(?:tool[_-]?call|function[_-]?call|tool_use)\b/i,
  /^\s*\{?\s*"(?:tool|function|name)"\s*:/,
];

const FAKE_SUCCESS_PATTERNS: readonly RegExp[] = [
  /\bi(?:'?ve| have)\s+(?:successfully\s+)?(?:fixed|written|created|saved|edited|updated|patched|committed|pushed|deleted)\s+(?:the|that|this|your)\b/i,
  /\bdone[!.]?\s*i(?:'?ve| have)\s+(?:fixed|written|edited|updated)\b/i,
  /\b(?:the\s+)?(?:file|test|build|change)\s+(?:has\s+been|is\s+now)\s+(?:fixed|written|saved|updated|committed)\b/i,
];

const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /^\s*\(?(?:no content|empty reply|nothing|n\/?a)\)?\s*$/i,
  /^\s*\.{1,3}\s*$/,
];

function isProbablyToolNoiseOnly(reply: string): boolean {
  const trimmed = reply.trim();
  if (trimmed.length === 0) return false;
  if (!TOOL_NOISE_PATTERNS.some((p) => p.test(trimmed))) return false;
  // If the reply *starts* with tool-call noise but then contains 200+
  // chars of natural text, treat as answer. Pure tool noise = short.
  return trimmed.length < 240;
}

function looksLikeRefusal(reply: string): boolean {
  const trimmed = reply.trim();
  if (trimmed.length === 0) return false;
  if (!REFUSAL_PATTERNS.some((p) => p.test(trimmed))) return false;
  // A short message that's only a refusal is invalid. A long message
  // that *opens* with a refusal hedge but then proceeds to answer is OK.
  return trimmed.length < 280;
}

function claimsFakeSuccess(reply: string): boolean {
  return FAKE_SUCCESS_PATTERNS.some((p) => p.test(reply));
}

export function validateLocalAnswer(reply: string | null | undefined): AnswerValidation {
  if (typeof reply !== "string") {
    return { ok: false, reason: "empty", detail: "reply is not a string" };
  }
  const trimmed = reply.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty", detail: "reply is whitespace only" };
  }
  if (PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed))) {
    return { ok: false, reason: "empty", detail: "reply is a placeholder" };
  }
  if (isProbablyToolNoiseOnly(trimmed)) {
    return {
      ok: false,
      reason: "tool-noise",
      detail: "reply only narrates a tool call with no answer content",
    };
  }
  if (looksLikeRefusal(trimmed)) {
    return {
      ok: false,
      reason: "refusal",
      detail: "reply is a short canned refusal",
    };
  }
  if (claimsFakeSuccess(trimmed)) {
    return {
      ok: false,
      reason: "fake-success",
      detail:
        "reply claims a write/edit action this build cannot perform — no evidence available",
    };
  }
  return { ok: true };
}
