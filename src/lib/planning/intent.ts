/**
 * Detect chat messages that request a plan (not an inspection, not a
 * code-explanation wrap).
 *
 * Conservative: false positives turn casual chat into a plan UI, which
 * is louder than a missed match.
 *
 * Phrases that should match:
 *   - "make a plan", "give me a plan"
 *   - "how would you fix this?"
 *   - "what should I change?"
 *   - "how should I approach this?"
 *   - "what files are involved?"
 *   - "how hard would this be?"
 *   - "what would Peh need to inspect?"
 *   - "outline the steps"
 *
 * Must NOT match:
 *   - "explain src/foo.tsx" (file inspection territory)
 *   - "is ollama running"
 *   - casual chat
 */

const PLANNING_PATTERNS: readonly RegExp[] = [
  /\bmake (?:me )?a plan\b/i,
  /\bgive me a plan\b/i,
  /\bcan you plan\b/i,
  /\bplan (?:for|the|out)\b/i,
  /\bhow (?:would|should) (?:you|i|peh|peh) (?:fix|approach|tackle|handle|change|modify|update)\b/i,
  /\bwhat (?:should|would) (?:i|you|we) (?:change|modify|update|do)\b/i,
  /\bwhat files (?:are|might be) involved\b/i,
  /\bwhat files (?:should|would) (?:i|we|peh|peh) (?:look at|inspect|check)\b/i,
  /\bhow hard would (?:this|that|it) be\b/i,
  /\bwhat would (?:peh|peh) need to (?:inspect|read|look at)\b/i,
  /\boutline (?:the )?steps\b/i,
  /\bstep[- ]by[- ]step (?:plan|approach)\b/i,
  /\bwhat'?s? the plan\b/i,
  /\bwhat is the plan\b/i,
];

const MAX_PLANNING_LENGTH = 600;

export interface PlanningIntentMatch {
  readonly intent: "plan";
  readonly trigger: string;
}

export function detectPlanningIntent(message: string): PlanningIntentMatch | null {
  const trimmed = (message ?? "").trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PLANNING_LENGTH) return null;
  for (const pattern of PLANNING_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { intent: "plan", trigger: pattern.source.slice(0, 40) };
    }
  }
  return null;
}
