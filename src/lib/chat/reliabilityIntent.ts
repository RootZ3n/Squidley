/**
 * Narrow intent gate for the Small Model Reliability Layer.
 *
 * Chat requests that look like a *safe local troubleshooting* or *local
 * health* question are routed through the reliability runner. Everything
 * else falls through to the existing local-model path.
 *
 * Hard rules:
 *   - Conservative. False positives turn casual chat into a tool answer,
 *     which is worse than a missed match.
 *   - Short messages only (≤ 400 chars). Long technical explanations
 *     should reach the model directly.
 *   - Only intents whose compound tool is safe to run from a chat route
 *     are detected here. Filesystem-touching tools are deliberately
 *     excluded.
 */

export type ChatReliabilityIntent = "summarize_error" | "health_check";

const HEALTH_PATTERNS: readonly RegExp[] = [
  /\bis (?:the )?(?:local )?(?:model|ollama|llama[\.\-]?(?:cpp|server)) (?:working|running|up|alive|ready|ok|healthy)\b/i,
  /\b(?:run|do|perform) (?:a )?(?:local )?health[- ]?check\b/i,
  /\bcheck (?:if|whether) (?:the )?(?:local )?(?:model|ollama|llama[\.\-]?(?:cpp|server)) (?:is|works)/i,
  /\bcan you (?:reach|talk to|connect to) (?:the )?(?:local )?(?:model|ollama|server)\b/i,
];

const ERROR_TRIGGER_PATTERNS: readonly RegExp[] = [
  /\bsummari[sz]e (?:this |the )?(?:error|stack ?trace|log|output|crash)\b/i,
  /\bwhat (?:went|is) (?:wrong|happening) (?:with )?(?:this|the) (?:error|log|stack)?/i,
  /\bexplain (?:this |the )?(?:error|stack ?trace|crash|failure)\b/i,
  /\bwhy (?:does|did|is) (?:this|it) (?:fail|crash|break|error)\b/i,
  /\bhelp (?:me )?(?:debug|fix) (?:this )?error\b/i,
];

const ERROR_SHAPE_PATTERNS: readonly RegExp[] = [
  /\bECONNREFUSED\b/i,
  /\bENOENT\b/i,
  /\bEACCES\b/i,
  /\bSyntaxError:/i,
  /\bTypeError:/i,
  /\bReferenceError:/i,
  /\b\s+at\s+\w[\w$.]*\s*\(/, // stack frame
];

const MAX_INTENT_LENGTH = 400;

export interface ChatReliabilityIntentMatch {
  readonly intent: ChatReliabilityIntent;
  /** What in the message triggered the match — useful for receipts. */
  readonly trigger: string;
}

/**
 * Detect whether a chat message is a reliability-style intent. Returns
 * `null` when it is not — caller should fall through to normal chat.
 */
export function detectChatReliabilityIntent(
  message: string,
): ChatReliabilityIntentMatch | null {
  const trimmed = (message ?? "").trim();
  if (trimmed.length === 0 || trimmed.length > MAX_INTENT_LENGTH) return null;

  for (const pattern of HEALTH_PATTERNS) {
    if (pattern.test(trimmed)) return { intent: "health_check", trigger: "health-pattern" };
  }

  for (const pattern of ERROR_TRIGGER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { intent: "summarize_error", trigger: "error-trigger-pattern" };
    }
  }

  // If the user *just* pasted an error string (no chatty framing), the
  // shape patterns combined with one of the simple verbs counts too.
  const hasShape = ERROR_SHAPE_PATTERNS.some((p) => p.test(trimmed));
  const hasErrorKeyword = /\b(?:error|exception|stack ?trace|traceback|crash|failed?)\b/i.test(
    trimmed,
  );
  if (hasShape && hasErrorKeyword) {
    return { intent: "summarize_error", trigger: "error-shape+keyword" };
  }

  return null;
}
