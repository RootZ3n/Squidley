import fs from "fs";

const FILE = "apps/api/src/server.ts";
const src = fs.readFileSync(FILE, "utf8");

const fnNeedle = "async function buildChatSystemPrompt(";
const start = src.indexOf(fnNeedle);
if (start < 0) {
  console.error("❌ Could not find buildChatSystemPrompt() in server.ts");
  process.exit(2);
}

// Find the end of the function via brace matching starting at the first "{"
const braceOpen = src.indexOf("{", start);
if (braceOpen < 0) {
  console.error("❌ Could not find opening brace for buildChatSystemPrompt()");
  process.exit(3);
}

let i = braceOpen;
let depth = 0;
let inStr = false;
let strCh = "";
let inLineComment = false;
let inBlockComment = false;

for (; i < src.length; i++) {
  const c = src[i];
  const n = src[i + 1];

  // comments
  if (!inStr) {
    if (!inBlockComment && !inLineComment && c === "/" && n === "/") {
      inLineComment = true; i++; continue;
    }
    if (!inBlockComment && !inLineComment && c === "/" && n === "*") {
      inBlockComment = true; i++; continue;
    }
    if (inLineComment && c === "\n") { inLineComment = false; continue; }
    if (inBlockComment && c === "*" && n === "/") { inBlockComment = false; i++; continue; }
    if (inLineComment || inBlockComment) continue;
  }

  // strings
  if (!inLineComment && !inBlockComment) {
    if (!inStr && (c === "'" || c === '"' || c === "`")) { inStr = true; strCh = c; continue; }
    if (inStr) {
      if (c === "\\" ) { i++; continue; }
      if (c === strCh) { inStr = false; strCh = ""; continue; }
      continue;
    }
  }

  // braces
  if (c === "{") depth++;
  if (c === "}") {
    depth--;
    if (depth === 0) { i++; break; }
  }
}

if (depth !== 0) {
  console.error("❌ Brace match failed inside buildChatSystemPrompt()");
  process.exit(4);
}

const end = i; // end index after function closing brace

const replacement = `
async function buildChatSystemPrompt(args: { input: string; selected_skill?: string | null }) {
  const { soul, identity } = await loadAgentTexts();
  const memHits = await searchMemoryForChat(args.input, 5);
  const skill = args.selected_skill ? await loadSkillDoc(args.selected_skill) : "";

  const parts: string[] = [];
  parts.push(BASE_SYSTEM_PROMPT);

  if (identity.trim()) parts.push("\\n---\\n# IDENTITY (agent)\\n" + identity.trim());
  if (soul.trim()) parts.push("\\n---\\n# SOUL (agent)\\n" + soul.trim());
  if (skill.trim()) parts.push(\\`\\n---\\n# SELECTED SKILL: \\${args.selected_skill}\\n\\` + skill.trim());

  if (memHits.length > 0) {
    const formatted = memHits
      .map((h, idx) => \\`(\\${idx + 1}) \\${h.rel}\\n\\${h.snippet}\\`)
      .join("\\n\\n");
    parts.push("\\n---\\n# RELEVANT MEMORY (snippets)\\n" + formatted);
  }

  parts.push(\`
---
# RULES
- Prefer local-first solutions. Do not propose cloud escalation unless the user asks or the current task truly requires it.
- Keep answers actionable and short. Provide copy/paste commands when relevant.
- If asked to edit code/configs, prefer full replacement files (not patches).
\`.trim());

  return parts.join("\\n");
}
`.trim();

const out = src.slice(0, start) + replacement + src.slice(end);
fs.writeFileSync(FILE, out, "utf8");
console.log("✅ Hard-reset buildChatSystemPrompt() to known-good string-returning version.");
