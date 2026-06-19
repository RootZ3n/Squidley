/**
 * Deterministic verification of a tiny edit after it was applied.
 *
 * Pure: no IO, no model calls, no shell. Every check is a tiny string
 * predicate that runs in milliseconds.
 *
 * Checks vary by extension:
 *   - All:        replacement-present, original-removed, file-not-empty,
 *                 file-length-reasonable.
 *   - .json:      json-parses.
 *   - .ts/.tsx/.js/.jsx: balanced-delimiters, no-unterminated-strings
 *                 (very lightweight — no real parser).
 *
 * If `original-removed` would be false because the snippet legitimately
 * appears elsewhere, the safety layer would have already rejected the
 * edit (multiple matches). Here we only re-confirm.
 */

import type { TinyEditCheck, TinyEditCheckId, TinyEditVerification } from "./types";

export interface BuildVerificationArgs {
  readonly path: string;
  readonly originalBefore: string;
  readonly proposedSnippet: string;
  readonly contentAfter: string;
  readonly contentBefore: string;
  readonly extension: string;
}

function check(
  id: TinyEditCheckId,
  description: string,
  passed: boolean,
  detail?: string,
): TinyEditCheck {
  return { id, description, passed, ...(detail ? { detail } : {}) };
}

function isBalanced(s: string): boolean {
  const stack: string[] = [];
  const open = "([{";
  const close = ")]}";
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let inString: string | null = null;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (inString) {
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      // line comment — skip to next newline
      const nl = s.indexOf("\n", i + 2);
      i = nl === -1 ? s.length : nl;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      const end = s.indexOf("*/", i + 2);
      i = end === -1 ? s.length : end + 1;
      continue;
    }
    if (open.includes(c)) stack.push(c);
    else if (close.includes(c)) {
      const want = pairs[c];
      if (stack.pop() !== want) return false;
    }
  }
  return stack.length === 0 && inString === null;
}

function unterminatedString(s: string): boolean {
  let inString: string | null = null;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (inString) {
      if (c === inString) inString = null;
      else if (c === "\n" && inString !== "`") return true;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") inString = c;
    if (c === "/" && s[i + 1] === "/") {
      const nl = s.indexOf("\n", i + 2);
      i = nl === -1 ? s.length : nl;
    }
    if (c === "/" && s[i + 1] === "*") {
      const end = s.indexOf("*/", i + 2);
      i = end === -1 ? s.length : end + 1;
    }
  }
  return inString !== null;
}

export function buildVerification(args: BuildVerificationArgs): TinyEditVerification {
  const checks: TinyEditCheck[] = [];

  checks.push(
    check(
      "replacement-present",
      "The proposed snippet appears in the file after the edit.",
      args.contentAfter.includes(args.proposedSnippet),
    ),
  );

  // "original-removed" — the *anchor* snippet should no longer appear
  // at the position it occupied. We confirm by checking that exactly
  // one match has been replaced: the new file should NOT contain the
  // original snippet at all (safety layer already rejected multiple-
  // match cases).
  checks.push(
    check(
      "original-removed",
      "The original snippet was replaced.",
      !args.contentAfter.includes(args.originalBefore),
      args.contentAfter.includes(args.originalBefore)
        ? "The original snippet is still present after writing — apply was a no-op or partial."
        : undefined,
    ),
  );

  checks.push(
    check(
      "file-not-empty",
      "The file is not empty after the edit.",
      args.contentAfter.length > 0,
    ),
  );

  const ratio = args.contentBefore.length === 0 ? 1 : args.contentAfter.length / args.contentBefore.length;
  checks.push(
    check(
      "file-length-reasonable",
      "The file length did not balloon or vanish unexpectedly.",
      ratio > 0.1 && ratio < 10,
      `length ratio after/before = ${ratio.toFixed(2)}`,
    ),
  );

  if (args.extension === ".json") {
    let parsed = false;
    try {
      JSON.parse(args.contentAfter);
      parsed = true;
    } catch {
      parsed = false;
    }
    checks.push(
      check(
        "json-parses",
        "The JSON file still parses after the edit.",
        parsed,
        parsed ? undefined : "JSON.parse threw on the new contents.",
      ),
    );
  }

  if (
    args.extension === ".ts" ||
    args.extension === ".tsx" ||
    args.extension === ".js" ||
    args.extension === ".jsx"
  ) {
    checks.push(
      check(
        "balanced-delimiters",
        "Brackets, braces, and parentheses are balanced after the edit.",
        isBalanced(args.contentAfter),
      ),
    );
    checks.push(
      check(
        "no-unterminated-strings",
        "No string literal is left unterminated after the edit.",
        !unterminatedString(args.contentAfter),
      ),
    );
  }

  const failedCheck = checks.find((c) => !c.passed);
  if (failedCheck) {
    return {
      checks,
      expectedOutcome:
        "Peh expected the file to contain the proposed snippet and remain well-formed.",
      verificationStatus: "failed",
      failureReason: failedCheck.detail ?? `Failed check: ${failedCheck.id}`,
    };
  }
  return {
    checks,
    expectedOutcome:
      "Peh expected the file to contain the proposed snippet and remain well-formed.",
    verificationStatus: "passed",
  };
}
