// apps/api/src/chat/toolDetector.ts
//
// Detects tool proposals in Squidley's responses and approval signals
// in follow-up user messages. No LLM calls — pure deterministic parsing.

import { TOOL_ALLOWLIST } from "../tools/allowlist.js";

export type ToolProposal = {
  tool_id: string;
  args: Record<string, string>;
  raw_match: string;
};

// ── Approval detection ────────────────────────────────────────────────────────

const APPROVAL_PATTERNS = [
  /^\s*yes\s*[.!]?\s*$/i,
  /^\s*yeah\s*[.!]?\s*$/i,
  /^\s*yep\s*[.!]?\s*$/i,
  /^\s*sure\s*[.!]?\s*$/i,
  /^\s*go\s*(ahead|for it)\s*[.!]?\s*$/i,
  /^\s*do it\s*[.!]?\s*$/i,
  /^\s*run it\s*[.!]?\s*$/i,
  /^\s*yes[,.]?\s*(run|do|execute|go|search|use)[^a-z]*/i,
  /^\s*ok(ay)?\s*[,.]?\s*(run|do|go|yes)?[.!]?\s*$/i,
  /^\s*please\s*(run|do|execute|go)\s*/i,
  // "yes, search TODO using rg.search" — yes followed by anything
  /^\s*yes[,.]?\s+\w/i,
  /^\s*yeah[,.]?\s+\w/i,
  /^\s*yep[,.]?\s+\w/i,
];

const DENIAL_PATTERNS = [
  /^\s*no\s*[.!]?\s*$/i,
  /^\s*nope\s*[.!]?\s*$/i,
  /^\s*cancel\s*[.!]?\s*$/i,
  /^\s*stop\s*[.!]?\s*$/i,
  /^\s*never mind\s*[.!]?\s*$/i,
  /^\s*skip\s*(it)?\s*[.!]?\s*$/i,
  /^\s*don'?t\s*/i,
];

export function isApproval(input: string): boolean {
  const s = input.trim();
  return APPROVAL_PATTERNS.some((p) => p.test(s));
}

export function isDenial(input: string): boolean {
  const s = input.trim();
  return DENIAL_PATTERNS.some((p) => p.test(s));
}

// ── Tool proposal extraction ──────────────────────────────────────────────────

const ALL_TOOL_IDS = Object.keys(TOOL_ALLOWLIST);

// Patterns that indicate a tool proposal in the model's response
const PROPOSAL_INDICATORS = [
  /want me to run/i,
  /shall i run/i,
  /should i run/i,
  /i can run/i,
  /i['']ll run/i,
  /ready to run/i,
  /want me to (execute|use|try)/i,
  /do you want me to/i,
  /i['']d like to run/i,
];

function extractToolId(text: string): string | null {
  // Look for exact tool IDs in the text
  for (const id of ALL_TOOL_IDS) {
    // Match the tool id as a standalone word/token
    const escaped = id.replace(/\./g, "\\.");
    const re = new RegExp(`(?<![a-zA-Z])${escaped}(?![a-zA-Z0-9_])`, "i");
    if (re.test(text)) return id;
  }
  return null;
}

function extractArgs(text: string, tool_id: string): Record<string, string> {
  const args: Record<string, string> = {};

  // rg.search — extract query pattern
  if (tool_id === "rg.search") {
    const patterns = [
      /(?:search|pattern|query|for|rg\.search)\s+["""'`]([^"""'`\n]+)["""'`]/i,
      /(?:search|look)\s+for\s+["""'`]?([A-Za-z0-9_\-./\\|]+)["""'`]?/i,
      /\bpattern\b\s*["""'`]?([A-Za-z0-9_\-./\\|]+)["""'`]?/i,
      /occurrences\s+of\s+["""'`]?([A-Za-z0-9_\-./\\|]+)["""'`]?/i,
      /find\s+["""'`]?([A-Za-z0-9_\-./\\|]+)["""'`]?\s+in\s+the\s+codebase/i,
      /\bword\s+["""'`]?([A-Za-z0-9_\-./\\|]+)["""'`]?/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) { args.query = m[1].trim(); break; }
    }
  }

  // web.search — extract query
  if (tool_id === "web.search") {
    const patterns = [
      /(?:search|query|for|web\.search)\s+["""'`]([^"""'`\n]+)["""'`]/i,
      /search\s+(?:the\s+web\s+)?for\s+["""'`]?([^.?!\n"'`]+)["""'`]?/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) { args.query = m[1].trim(); break; }
    }
  }

  // git.log — extract count if specified
  if (tool_id === "git.log") {
    const m = text.match(/last\s+(\d+)\s+commit/i);
    if (m?.[1]) args.count = m[1];
  }

  // git.diff — extract range or file path if specified
  if (tool_id === "git.diff") {
    // Range patterns: HEAD~3, main..feature, abc123..def456
    const rangeMatch = text.match(/\b(HEAD[~^]\d*|[a-f0-9]{6,}\.{2,3}[a-f0-9]{6,}|[\w\-]+\.{2,3}[\w\-]+)\b/);
    if (rangeMatch?.[1]) {
      args.range = rangeMatch[1];
    }
    // File path patterns: diff of apps/api/src/server.ts
    const fileMatch = text.match(/(?:diff|changes?|in)\s+(?:to\s+|of\s+)?([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,6})\b/i);
    if (fileMatch?.[1] && !fileMatch[1].includes("git")) {
      args.file = fileMatch[1];
    }
  }

  // fs.read — extract path
  if (tool_id === "fs.read") {
    const m = text.match(/(?:read|open|view)\s+["""'`]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)["""'`]?/i);
    if (m?.[1]) args.path = m[1].trim();
  }

  return args;
}

export function extractToolProposal(modelResponse: string): ToolProposal | null {
  // Must contain a proposal indicator
  const hasIndicator = PROPOSAL_INDICATORS.some((p) => p.test(modelResponse));
  if (!hasIndicator) return null;

  // Must name a known tool
  const tool_id = extractToolId(modelResponse);
  if (!tool_id) return null;

  const args = extractArgs(modelResponse, tool_id);

  return {
    tool_id,
    args,
    raw_match: tool_id,
  };
}
