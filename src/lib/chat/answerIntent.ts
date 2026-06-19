/**
 * Detect chat messages that benefit from local-model answer wrapping.
 *
 * Distinct from `reliabilityIntent.ts`:
 *   - reliabilityIntent: catches narrow troubleshooting that should NOT
 *     hit the local model at all (health-check, error-summary).
 *   - answerIntent: catches questions that DO hit the local model but
 *     deserve a validation + retry + fallback safety net (code
 *     explanation, debugging help, "why did this fail").
 *
 * Hard rules:
 *   - Conservative. False positives turn casual chat into wrapped chat,
 *     adding (at most) one round-trip on a bad first reply. Quiet on
 *     first-try success — no UI noise.
 *   - Long messages are NOT excluded by length alone — a pasted error
 *     can be long. We cap at a generous 4000 chars so true noise is
 *     filtered out but real debugging requests are still wrapped.
 *   - Detection must run *after* reliabilityIntent / teacher so the
 *     narrower intercepts still win.
 */

export type ChatAnswerIntent = "wrap";

const WRAP_PATTERNS: readonly RegExp[] = [
  // Code explanation
  /\bexplain (?:this |the |a |an |that )?(?:code|function|method|class|file|snippet|module|component)\b/i,
  /\bwhat does (?:this |the |that )?(?:code|function|method|class|line) do\b/i,
  /\bwalk me through (?:this |the )?(?:code|function|file|snippet)\b/i,
  /\bhow does (?:this |the |that )?(?:code|function|method|class|module) work\b/i,

  // Debugging
  /\bhelp me debug\b/i,
  /\bdebug (?:this|my|the)\b/i,
  /\bwhy (?:is |does |did )?(?:this|it|my code|my function|my test) (?:fail|failing|break|breaking|broken|crash|crashing|crashed|not work)/i,
  /\bwhy am i getting (?:this |a |an )?(?:error|exception|warning)\b/i,
  /\bwhat does (?:this |the |that )?(?:error|warning|exception|message) mean\b/i,
  /\bwhat(?:'s| is) (?:wrong|going on) (?:with|here)\b/i,

  // Local model troubleshooting (model itself, not health probe)
  /\bwhy (?:is |does )?(?:the )?model (?:so |always )?(?:slow|empty|stuck|repeating|wrong|hallucinating)\b/i,
  /\bwhy (?:do |does )?(?:you|peh|peh) (?:keep|always) (?:saying|returning|giving)\b/i,
];

const MAX_WRAP_LENGTH = 4000;

export interface ChatAnswerIntentMatch {
  readonly intent: ChatAnswerIntent;
  readonly trigger: string;
}

export function detectChatAnswerIntent(
  message: string,
): ChatAnswerIntentMatch | null {
  const trimmed = (message ?? "").trim();
  if (trimmed.length === 0 || trimmed.length > MAX_WRAP_LENGTH) return null;
  for (const pattern of WRAP_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { intent: "wrap", trigger: pattern.source.slice(0, 40) };
    }
  }
  return null;
}
