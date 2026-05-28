/**
 * Honesty annotation for local-model replies.
 *
 * Public Squidley ships zero action tools (no fs.write, no shell, no web
 * search, no document parser, no agent loop). A local model can still
 * HALLUCINATE that it performed one of those actions ("I wrote the file",
 * "I ran the test", "I searched the web"). This module detects that
 * pattern in the model's reply and produces a user-visible correction.
 *
 * The detector is intentionally pure and side-effect-free:
 *   - input: the model's reply string
 *   - output: which tool-action verbs were hallucinated, plus a single
 *     short honesty message Squidley can render alongside the reply.
 *
 * It does NOT rewrite or censor the reply. The original text is preserved.
 * The annotation is a separate user-facing message stating what the local
 * build can and cannot actually do.
 *
 * If a future build wires a real local tool, the caller can pass
 * `executedTools` so already-performed actions are NOT flagged.
 */

export type HallucinatedAction =
  | "fs.write"
  | "fs.read"
  | "fs.delete"
  | "fs.move"
  | "shell"
  | "web_search"
  | "browse"
  | "code_execute"
  | "package_install"
  | "send_email"
  | "git_commit"
  | "memory_write";

export interface HonestyAnnotation {
  hallucinatedActions: readonly HallucinatedAction[];
  /** A single short message Squidley can render next to the reply. */
  userVisibleHonestyMessage?: string;
  /** Stable list of tool ids the user appeared to want. */
  unavailableTools: readonly string[];
}

/**
 * Patterns are deliberately first-person past/present and assertive — the
 * dangerous case is the model TELLING the user it did something. Hedged
 * phrases ("I can write", "I would save", "you can run") are not flagged.
 *
 * Each pattern requires:
 *   - first-person ("I", "I've", "I have", "I just")
 *   - an action verb in declarative past or present
 *   - an object that implies the action
 */
interface Pattern {
  action: HallucinatedAction;
  pattern: RegExp;
  toolId: string;
}

const PATTERNS: readonly Pattern[] = [
  {
    action: "fs.write",
    toolId: "fs.write",
    // "I wrote the file", "I've saved", "I just created the file",
    // "I have written"
    pattern:
      /\bi(?:'ve|\s+have|\s+just)?\s+(?:wrote|written|saved|created|generated|added|updated|edited|modified|overwrote|persisted|stored)\s+(?:the\s+|a\s+|your\s+|this\s+|that\s+)?(?:file|note|document|config|setting|repository|repo|directory|folder|disk|filesystem|fs)\b/i,
  },
  {
    action: "fs.write",
    toolId: "fs.write",
    pattern:
      /\bi(?:'ve|\s+have)?\s+(?:wrote|written|saved|created|generated|added|updated|edited|modified)\s+(?:it\s+)?(?:to|into|on|in)\s+(?:disk|the\s+filesystem|your\s+(?:disk|filesystem|hard\s+drive)|the\s+file\s+system)\b/i,
  },
  {
    action: "fs.read",
    toolId: "fs.read",
    pattern:
      /\bi(?:'ve|\s+have|\s+just)?\s+(?:read|opened|loaded|inspected|examined|checked|reviewed|parsed|scanned)\s+(?:the\s+|your\s+|this\s+)?(?:file|files|filesystem|repository|repo|directory|folder|project|codebase)\b/i,
  },
  {
    action: "fs.delete",
    toolId: "fs.delete",
    pattern:
      /\bi(?:'ve|\s+have)?\s+(?:deleted|removed|erased)\s+(?:the\s+|your\s+|this\s+)?(?:file|directory|folder|note|entry)\b/i,
  },
  {
    action: "fs.move",
    toolId: "fs.move",
    pattern:
      /\bi(?:'ve|\s+have)?\s+(?:moved|renamed|copied)\s+(?:the\s+|your\s+|this\s+)?(?:file|directory|folder)\b/i,
  },
  {
    action: "shell",
    toolId: "shell",
    pattern:
      /\bi(?:'ve|\s+have|\s+just)?\s+(?:ran|run|executed|invoked|launched)\s+(?:the\s+|that\s+|your\s+)?(?:command|script|shell|test|tests|build|process)\b/i,
  },
  {
    action: "code_execute",
    toolId: "code_execute",
    pattern:
      /\bi(?:'ve|\s+have)?\s+(?:executed|ran|run)\s+(?:the\s+|that\s+|your\s+)?code\b/i,
  },
  {
    action: "package_install",
    toolId: "package_install",
    pattern:
      /\bi(?:'ve|\s+have)?\s+(?:installed|added|removed|uninstalled)\s+(?:the\s+|a\s+|your\s+)?(?:package|dependency|module|library|npm\s+package)\b/i,
  },
  {
    action: "web_search",
    toolId: "web_search",
    pattern:
      /\bi(?:'ve|\s+have|\s+just)?\s+(?:searched|googled|queried|fetched)\s+(?:the\s+|that\s+|this\s+|it\s+)?(?:online|on\s+the\s+web|on\s+google|on\s+the\s+internet|via\s+search)\b/i,
  },
  {
    action: "web_search",
    toolId: "web_search",
    // "I looked it up", "I looked that up online", "I looked up the topic"
    pattern:
      /\bi(?:'ve|\s+have|\s+just)?\s+looked\s+(?:\w+\s+)?up\b(?:[^.\n]{0,40}\b(?:online|on\s+the\s+web|on\s+google|on\s+the\s+internet|web|search|google)\b)?/i,
  },
  {
    action: "web_search",
    toolId: "web_search",
    pattern:
      /\bi(?:'ve|\s+have)?\s+(?:searched\s+the\s+web|did\s+a\s+web\s+search|performed\s+a\s+web\s+search)\b/i,
  },
  {
    action: "browse",
    toolId: "browse",
    pattern:
      /\bi(?:'ve|\s+have|\s+just)?\s+(?:browsed|visited|opened|fetched|loaded)\s+(?:to\s+)?(?:the\s+)?(?:url|page|website|site|link)\b/i,
  },
  {
    action: "send_email",
    toolId: "send_email",
    pattern:
      /\bi(?:'ve|\s+have)?\s+(?:sent|emailed|delivered|forwarded)\s+(?:the\s+|an?\s+|that\s+|your\s+)?(?:email|message|notification)\b/i,
  },
  {
    action: "git_commit",
    toolId: "git_commit",
    pattern:
      /\bi(?:'ve|\s+have)?\s+(?:committed|pushed|merged|rebased)\s+(?:the\s+|your\s+|a\s+)?(?:change|changes|branch|commit|repo|repository|fix|fixes|feature|patch|edit|edits|pr|update|updates)\b/i,
  },
  {
    action: "memory_write",
    toolId: "memory_write",
    pattern:
      /\bi(?:'ve|\s+have|\s+just|\s+will|\s+now)?\s+(?:remembered|memorized|stored|recorded)\s+(?:this\s+|that\s+|it\s+|your\s+)?(?:for\s+(?:later|next\s+time|future)|in\s+memory)\b/i,
  },
];

const DISCLAIMER_PHRASES = [
  /\bi\s+(?:can(?:'t|not)?|cannot|could(?:n['']t)?|won['']t|will\s+not|am\s+unable|won't|don['']t)\b/i,
  /\bthis\s+(?:public\s+)?(?:local\s+)?(?:version|build|release|mode)\s+(?:does\s+not|doesn['']t|cannot|can['']t)\b/i,
  /\bsquidley\s+(?:does\s+not|doesn['']t|cannot|can['']t)\b/i,
];

function containsDisclaimerNearby(text: string, matchIndex: number, matchLen: number): boolean {
  // Look 160 chars before/after for an explicit "I can't / cannot / does not" disclaimer.
  const start = Math.max(0, matchIndex - 160);
  const end = Math.min(text.length, matchIndex + matchLen + 160);
  const window = text.slice(start, end);
  return DISCLAIMER_PHRASES.some((p) => p.test(window));
}

export interface HonestyDetectorOptions {
  /** Tool ids that actually executed (with receipts). Matched actions for
   *  these tools are NOT flagged. */
  executedTools?: readonly string[];
}

export function detectHallucinatedToolActions(
  reply: string,
  options: HonestyDetectorOptions = {},
): HonestyAnnotation {
  if (typeof reply !== "string" || reply.trim().length === 0) {
    return { hallucinatedActions: [], unavailableTools: [] };
  }
  const executed = new Set(options.executedTools ?? []);
  const hits = new Set<HallucinatedAction>();
  const tools = new Set<string>();

  for (const { action, pattern, toolId } of PATTERNS) {
    if (executed.has(toolId)) continue;
    const match = pattern.exec(reply);
    if (!match) continue;
    if (containsDisclaimerNearby(reply, match.index, match[0].length)) continue;
    hits.add(action);
    tools.add(toolId);
  }

  if (hits.size === 0) {
    return { hallucinatedActions: [], unavailableTools: [] };
  }

  return {
    hallucinatedActions: Array.from(hits),
    unavailableTools: Array.from(tools),
    userVisibleHonestyMessage: buildHonestyMessage(Array.from(hits)),
  };
}

function buildHonestyMessage(actions: readonly HallucinatedAction[]): string {
  const pieces: string[] = [];
  const has = (a: HallucinatedAction) => actions.includes(a);
  if (has("fs.write") || has("fs.delete") || has("fs.move")) {
    pieces.push(
      "This public local build does not have a file-write tool. Squidley did not save, edit, delete, or move any file. The reply above is local-model text only.",
    );
  }
  if (has("fs.read")) {
    pieces.push(
      "This public local build cannot read files from your disk. The reply above is local-model text only.",
    );
  }
  if (has("shell") || has("code_execute")) {
    pieces.push(
      "This public local build does not run shell commands or execute code. Nothing was run on your machine.",
    );
  }
  if (has("web_search") || has("browse")) {
    pieces.push(
      "This public local build does not have a web/search/browser tool. No web request was made.",
    );
  }
  if (has("package_install")) {
    pieces.push(
      "This public local build does not install packages. No package was installed.",
    );
  }
  if (has("send_email")) {
    pieces.push(
      "This public local build does not send email. No message was sent.",
    );
  }
  if (has("git_commit")) {
    pieces.push(
      "This public local build does not touch git. No commit, push, or merge happened.",
    );
  }
  if (has("memory_write")) {
    pieces.push(
      "This public local build does not have a long-term memory tool. Squidley will not remember this beyond the current browser session and conversation.",
    );
  }
  if (pieces.length === 0) {
    return "The local model implied a tool action that this public build cannot actually perform. No tool action took place.";
  }
  return pieces.join(" ");
}
