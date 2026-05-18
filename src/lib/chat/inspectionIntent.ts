/**
 * Detect chat messages that request file inspection, and extract the
 * file path from the message body.
 *
 * Conservative: false positives turn casual chat into an approval
 * request, which is worse than missing a real inspection intent.
 *
 * Examples that should match (with extracted path):
 *   - "what does src/app/page.tsx do?"            → "src/app/page.tsx"
 *   - "inspect this file: package.json"           → "package.json"
 *   - "summarize docs/readme.md"                  → "docs/readme.md"
 *   - "look at src/lib/chat/handler.ts"           → "src/lib/chat/handler.ts"
 *
 * Examples that should NOT match (and stay null):
 *   - "explain this code"                         (no path)
 *   - "explain the universe"                      (no path-shape)
 *   - "tell me a joke"                            (no inspection intent)
 *
 * If the message has an inspection intent but no path, we return
 * `{ intent: "inspect", path: null }` so the route can ask the user to
 * name a file rather than silently falling through to the model.
 */

const INSPECTION_VERB_PATTERNS: readonly RegExp[] = [
  /\bwhat does \S+ do\b/i,
  /\binspect (?:this |the |a )?file\b/i,
  /\binspect [\S]+/i,
  /\bread (?:this |the )?file\b/i,
  /\bopen (?:this |the )?file\b/i,
  /\blook at (?:this |the )?file\b/i,
  /\blook at [\S]+\.(?:ts|tsx|js|jsx|json|md|mdx|css|scss|html|yml|yaml|txt)\b/i,
  /\bsummari[sz]e (?:this |the )?(?:file|markdown|readme)\b/i,
  /\bsummari[sz]e \S+\.(?:ts|tsx|js|jsx|json|md|mdx|css|scss|html|yml|yaml|txt)\b/i,
  /\bexplain (?:this |the )?(?:file|component|module|markdown)\b/i,
  /\bexplain \S+\.(?:ts|tsx|js|jsx|json|md|mdx|css|scss|html|yml|yaml|txt)\b/i,
];

const PATH_EXTRACT_RE =
  /(?:^|[\s`'"(<])((?:\.\.?\/)?(?:[A-Za-z0-9_.\-]+\/)*[A-Za-z0-9_\-]+\.(?:ts|tsx|js|jsx|json|md|mdx|css|scss|html|yml|yaml|txt))\b/i;

const MAX_INSPECTION_LENGTH = 800;

export interface InspectionIntentMatch {
  readonly intent: "inspect";
  /** Extracted path, or null if intent matched but no path was found. */
  readonly path: string | null;
  readonly trigger: string;
}

export function detectInspectionIntent(message: string): InspectionIntentMatch | null {
  const trimmed = (message ?? "").trim();
  if (trimmed.length === 0 || trimmed.length > MAX_INSPECTION_LENGTH) return null;

  let intentMatched = false;
  let trigger = "";
  for (const pattern of INSPECTION_VERB_PATTERNS) {
    if (pattern.test(trimmed)) {
      intentMatched = true;
      trigger = pattern.source.slice(0, 40);
      break;
    }
  }
  if (!intentMatched) return null;

  const pathMatch = trimmed.match(PATH_EXTRACT_RE);
  const extracted = pathMatch?.[1]?.trim() ?? null;
  // Reject paths that explicitly contain "..". The path-safety layer
  // would also reject these, but we never want to even surface them
  // as an approval target.
  if (extracted && extracted.includes("..")) {
    return { intent: "inspect", path: null, trigger };
  }
  return { intent: "inspect", path: extracted, trigger };
}
