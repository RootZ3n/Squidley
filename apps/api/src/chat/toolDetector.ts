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
  /want me to (write|save|create)/i,
  /i can (write|save|create) a skill/i,
  /want me to save (this|it)/i,
];

function extractToolId(text: string): string | null {
  if (/i can (write|save|create) a skill/i.test(text) ||
      /want me to (write|save) (a |this )?skill/i.test(text)) {
    return "fs.write";
  }
  for (const id of ALL_TOOL_IDS) {
    const escaped = id.replace(/\./g, "\\.");
    const re = new RegExp(`(?<![a-zA-Z])${escaped}(?![a-zA-Z0-9_])`, "i");
    if (re.test(text)) return id;
  }
  return null;
}

function extractArgs(text: string, tool_id: string): Record<string, string> {
  const args: Record<string, string> = {};

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

  if (tool_id === "git.log") {
    const m = text.match(/last\s+(\d+)\s+commit/i);
    if (m?.[1]) args.count = m[1];
  }

  if (tool_id === "git.diff") {
    const rangeMatch = text.match(/\b(HEAD[~^]\d*|[a-f0-9]{6,}\.{2,3}[a-f0-9]{6,}|[\w\-]+\.{2,3}[\w\-]+)\b/);
    if (rangeMatch?.[1]) args.range = rangeMatch[1];
    const fileMatch = text.match(/(?:diff|changes?|in)\s+(?:to\s+|of\s+)?([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,6})\b/i);
    if (fileMatch?.[1] && !fileMatch[1].includes("git")) args.file = fileMatch[1];
  }

  if (tool_id === "fs.write") {
    const nameMatch = text.match(/skill\s+(?:for|called|named)\s+["""']?([a-zA-Z0-9\s\-_]{2,40})["""']?/i);
    if (nameMatch?.[1]) {
      const skillId = nameMatch[1].trim().toLowerCase().replace(/\s+/g, "-");
      args.path = `skills/${skillId}/skill.md`;
      args.content = `# Skill: ${nameMatch[1].trim()}\n\n## Purpose\nAuto-generated skill.\n`;
    }
  }

  if (tool_id === "fs.read") {
    const m = text.match(/(?:read|open|view)\s+["""'`]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)["""'`]?/i);
    if (m?.[1]) args.path = m[1].trim();
  }

  if (tool_id.startsWith("browser.")) {
    const urlMatch = text.match(/https?:\/\/[^\s"')]+/);
    if (urlMatch) args.url = urlMatch[0].trim();
    const queryMatch = text.match(/(?:search(?:ing)? for|query[:\s]+)["']?([^"'\n]+)["']?/i);
    if (queryMatch) args.query = queryMatch[1].trim();
    args.action = tool_id.replace("browser.", "");
  }

  return args;
}

export function extractToolProposal(modelResponse: string): ToolProposal | null {
  const hasIndicator = PROPOSAL_INDICATORS.some((p) => p.test(modelResponse));
  if (!hasIndicator) return null;

  const tool_id = extractToolId(modelResponse);
  if (!tool_id) return null;

  const args = extractArgs(modelResponse, tool_id);

  return { tool_id, args, raw_match: tool_id };
}

// ── Plan proposal detection ───────────────────────────────────────────────────

const PLAN_PROPOSAL_PATTERNS = [
  /want me to run this plan\?/i,
  /want me to execute this plan\?/i,
  /shall i run this plan\?/i,
  /want me to proceed with this plan\?/i,
  /want me to run these steps\?/i,
  /approve this plan\?/i,
  /run the plan\?/i,
];

export function isPlanProposal(text: string): boolean {
  return PLAN_PROPOSAL_PATTERNS.some((p) => p.test(text));
}

export function extractPlanGoal(text: string): string {
  const m =
    text.match(/to\s+(.{10,120}?)[,.]?\s+i['']?(?:ll|will|can)\s+(?:run|execute|use)/i) ??
    text.match(/i['']?(?:ll|will|can)\s+(?:run|execute|use)\s+(?:these\s+steps\s+)?to\s+(.{10,120})/i);
  if (m?.[1]) return m[1].trim();
  return text.split(/[.!?]/)[0]?.trim().slice(0, 120) ?? "repo health check";
}

// ── Agent proposal detection ──────────────────────────────────────────────────

const AGENT_PROPOSAL_PATTERNS = [
  /i can run the [`"]?([\w-]+)[`"]? agent/i,
  /i can start the [`"]?([\w-]+)[`"]? agent/i,
  /i can spin up the [`"]?([\w-]+)[`"]? agent/i,
  /want me to run the [`"]?([\w-]+)[`"]? agent/i,
  /shall i run the [`"]?([\w-]+)[`"]? agent/i,
  /run the [`"]?([\w-]+)[`"]? agent/i,
  /run the skill-builder/i,
  /skill-builder agent/i,
  /i can run.*skill/i,
];

export type AgentProposal = {
  agent_name: string;
  focus?: string;
};

// Extract a clean path only — matches ~/path or /absolute/path at word boundary
// Intentionally does NOT match relative paths like skills/foo/bar.md
function extractCleanPath(text: string): string | undefined {
  const m = text.match(/(?:^|\s)(~\/[^\s,;.?!'"]+|\/[a-zA-Z0-9_\-]+(?:\/[a-zA-Z0-9_\-./]+)+)/);
  return m?.[1]?.trim();
}

// Extract a topic phrase after "about", "covering", "for", "called", "named", "on"
// Used for skill-builder and similar topic-based agents.
// Returns the raw topic string (not slugified — caller handles that).
function extractTopicFocus(text: string): string | undefined {
  // Priority 1: explicit "called <slug>" or "named <slug>" — most reliable
  const calledMatch = text.match(/(?:called|named)\s+([a-zA-Z0-9][a-zA-Z0-9\-_.]{2,60}?)(?:\s*[,?!.]|\s*$)/i);
  if (calledMatch?.[1]) {
    const topic = calledMatch[1].trim();
    if (!/^(the|a|an|it|this|that|you|me|my|our)$/i.test(topic)) return topic;
  }

  // Priority 2: "skill for <specific-thing>" — only when "skill" precedes "for"
  const skillForMatch = text.match(/skill\s+for\s+([a-zA-Z0-9][a-zA-Z0-9\s\-_.]{2,40}?)(?:\s*[,?!.]|\s*$)/i);
  if (skillForMatch?.[1]) {
    const topic = skillForMatch[1].trim();
    const words = topic.split(/\s+/);
    // Reject if it starts with a pronoun/filler or is too long
    if (words.length <= 5 && !/^(the|a|an|it|this|that|you|me|my|our|which|what|how)$/i.test(words[0])) {
      return topic;
    }
  }

  // Priority 3: "about <topic>" only when clearly a noun phrase
  const aboutMatch = text.match(/skill\s+about\s+([a-zA-Z0-9][a-zA-Z0-9\s\-_.]{2,40}?)(?:\s*[,?!.]|\s*$)/i);
  if (aboutMatch?.[1]) {
    const topic = aboutMatch[1].trim();
    const words = topic.split(/\s+/);
    if (words.length <= 5 && !/^(the|a|an|it|this|that|you|me|my|our)$/i.test(words[0])) {
      return topic;
    }
  }

  return undefined;
}

/**
 * Extract agent proposal from Squidley's response.
 * Optionally pass the original user input for better focus extraction.
 *
 * Focus priority:
 * 1. Clean path from user input (~/ or /absolute) — most reliable
 * 2. Clean path from Squidley's response
 * 3. Named target from user input ("on the openclaw repo")
 * 4. Topic phrase from user input ("about proc.exec best practices")
 * 5. Topic phrase from Squidley's response
 */
export function extractAgentProposal(text: string, userInput?: string): AgentProposal | null {
  for (const pattern of AGENT_PROPOSAL_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const agent_name = m[1].trim().toLowerCase();

      // Priority 1: clean path from user input (user typed it directly — most reliable)
      let focus: string | undefined = userInput ? extractCleanPath(userInput) : undefined;

      // Priority 2: clean path from Squidley's response
      if (!focus) focus = extractCleanPath(text);

      // Priority 3: named target from user input e.g. "on the openclaw repo"
      if (!focus && userInput) {
        const km = userInput.match(
          /(?:on|at|in|for|inspect|analyze|survey|check)\s+(?:the\s+)?([a-zA-Z0-9_\-]+(?:\s+[a-zA-Z0-9_\-]+)?)\s*(?:repo|dir|directory|folder|codebase|project)?/i
        );
        if (km?.[1]) focus = km[1].trim();
      }

      // Priority 4: topic phrase from user input e.g. "about proc.exec best practices"
      if (!focus && userInput) {
        focus = extractTopicFocus(userInput);
      }

      // Priority 5: topic phrase from Squidley's response
      if (!focus) {
        focus = extractTopicFocus(text);
      }

      return { agent_name, focus };
    }
  }
  return null;
}

export function isAgentProposal(text: string): boolean {
  return extractAgentProposal(text) !== null;
}

// ── Image request detection ───────────────────────────────────────────────────

const IMAGE_REQUEST_PATTERNS = [
  /i can generate (an?|the) image/i,
  /i can create (an?|the) image/i,
  /i can draw/i,
  /want me to generate (an?|the) image/i,
  /want me to create (an?|the) image/i,
  /shall i generate (an?|the) image/i,
  /i['']ll generate (an?|the) image/i,
  /i['']ll create (an?|the) image/i,
  /let me generate (an?|the) image/i,
  /generating (an?|the) image/i,
  /comfyui.*generat/i,
  /generat.*comfyui/i,
  /use comfyui/i,
  /photorealistic version/i,
  /higher.fidelity.*version/i,
  /i can generat/i,
  /generate one/i,
  /generate a (?:photo|picture|render|portrait|scene|illustration)/i,
  /create a (?:photo|picture|render|portrait|scene|illustration)/i,
];

export type ImagePromptProposal = {
  prompt: string;
  intent: string;
  negative: string;
};

export function isImageRequest(text: string): boolean {
  return IMAGE_REQUEST_PATTERNS.some((p) => p.test(text));
}

export function extractImagePrompt(text: string, userInput?: string): ImagePromptProposal | null {
  if (!isImageRequest(text)) return null;

  // Use user input as intent if available
  const intent = userInput?.trim() ?? text.split(/[.!?]/)[0]?.trim() ?? "";

  // Extract prompt from Squidley's response — what she says she'll generate
  // e.g. "I can generate an image of a purple squid wearing a wizard hat"
  const promptMatch = text.match(
    /(?:generate|create|draw|make)\s+(?:an?\s+)?image\s+(?:of\s+|showing\s+|depicting\s+)?(.{10,200}?)(?:\s*[.!?]|$)/i
  );
  const prompt = promptMatch?.[1]?.trim() ?? intent;

  // Default negative prompt
  const negative = "blurry, bad anatomy, watermark, tiling, multiple subjects, text, logo";

  if (!prompt) return null;
  return { prompt, intent, negative };
}

