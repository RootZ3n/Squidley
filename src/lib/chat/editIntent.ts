/**
 * Detect chat messages that ask for a tiny edit, and (optionally) parse
 * a structured edit description from the message.
 *
 * The cleanest input route is the structured `editProposal` field on
 * the chat request body — UI buttons populate it directly. This
 * intent detector is a *secondary* path for direct natural-language
 * inputs like:
 *
 *   "make a tiny edit to src/a.ts: replace `'hello'` with `'hi'`"
 *
 * Conservative: false positives turn casual chat into an edit
 * approval card, which is worse than missing a match.
 *
 * Returns `null` when no edit intent is detected.
 * Returns `{ intent: "edit" }` when an edit intent is detected but
 *   no structured edit can be parsed — the route should refuse to
 *   guess and ask the user to be explicit.
 * Returns `{ intent: "edit", parsed: {...} }` when a structured edit
 *   can be parsed from the message.
 */

const EDIT_VERB_PATTERNS: readonly RegExp[] = [
  /\bmake (?:me )?a (?:tiny |small )?edit\b/i,
  /\bpropose (?:a |an )?(?:tiny |small )?edit\b/i,
  /\btiny edit\b/i,
  /\bapply (?:a )?(?:tiny |small )?(?:change|fix)\b/i,
  /\bdo a tiny replace\b/i,
];

const STRUCTURED_RE =
  /\b(?:to|in)\s+([A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx|json|md|mdx|css|scss|html|yml|yaml|txt))\b[\s\S]*?\breplace\s+`([\s\S]+?)`\s+(?:with|by)\s+`([\s\S]+?)`/i;

const MAX_EDIT_INTENT_LENGTH = 4000;

export interface ParsedEditFromMessage {
  readonly path: string;
  readonly originalSnippet: string;
  readonly proposedSnippet: string;
}

export interface EditIntentMatch {
  readonly intent: "edit";
  readonly parsed: ParsedEditFromMessage | null;
  readonly trigger: string;
}

export function detectEditIntent(message: string): EditIntentMatch | null {
  const trimmed = (message ?? "").trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EDIT_INTENT_LENGTH) return null;

  let intentMatched = false;
  let trigger = "";
  for (const pattern of EDIT_VERB_PATTERNS) {
    if (pattern.test(trimmed)) {
      intentMatched = true;
      trigger = pattern.source.slice(0, 40);
      break;
    }
  }
  if (!intentMatched) return null;

  const m = trimmed.match(STRUCTURED_RE);
  if (!m) return { intent: "edit", parsed: null, trigger };

  const [, path, original, proposed] = m;
  if (!path || original === undefined || proposed === undefined) {
    return { intent: "edit", parsed: null, trigger };
  }
  if (path.includes("..")) return { intent: "edit", parsed: null, trigger };
  return {
    intent: "edit",
    parsed: { path, originalSnippet: original, proposedSnippet: proposed },
    trigger,
  };
}
