import fs from "fs";

const FILE = "apps/api/src/server.ts";
let src = fs.readFileSync(FILE, "utf8");

function findFunctionBlockStart(needle, fromIdx = 0) {
  const idx = src.indexOf(needle, fromIdx);
  if (idx < 0) return -1;
  const brace = src.indexOf("{", idx);
  if (brace < 0) return -1;
  return idx;
}

// Brace matcher that tolerates strings + comments.
function findBlockEnd(openBraceIdx) {
  let i = openBraceIdx;
  let depth = 0;
  let inStr = false;
  let strCh = "";
  let inLine = false;
  let inBlock = false;

  for (; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];

    // comments (only when not inside string)
    if (!inStr) {
      if (!inBlock && !inLine && c === "/" && n === "/") { inLine = true; i++; continue; }
      if (!inBlock && !inLine && c === "/" && n === "*") { inBlock = true; i++; continue; }
      if (inLine && c === "\n") { inLine = false; continue; }
      if (inBlock && c === "*" && n === "/") { inBlock = false; i++; continue; }
      if (inLine || inBlock) continue;
    }

    // strings
    if (!inLine && !inBlock) {
      if (!inStr && (c === "'" || c === '"' || c === "`")) { inStr = true; strCh = c; continue; }
      if (inStr) {
        if (c === "\\") { i++; continue; }
        if (c === strCh) { inStr = false; strCh = ""; continue; }
        continue;
      }
    }

    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) return i + 1; // index *after* closing brace
    }
  }
  return -1;
}

// 1) Remove ALL existing buildChatSystemPrompt() copies (they are currently duplicated/garbled)
const FN_NEEDLE = "async function buildChatSystemPrompt(";
let removed = 0;
for (let scan = 0; scan < 20; scan++) {
  const start = src.indexOf(FN_NEEDLE);
  if (start < 0) break;

  const brace = src.indexOf("{", start);
  if (brace < 0) throw new Error("Found buildChatSystemPrompt but could not locate its opening '{'.");

  const end = findBlockEnd(brace);
  if (end < 0) throw new Error("Brace matching failed while removing buildChatSystemPrompt().");

  // Remove any trailing whitespace/newlines after the function for cleanliness
  let end2 = end;
  while (end2 < src.length && (src[end2] === "\n" || src[end2] === "\r" || src[end2] === " " || src[end2] === "\t")) end2++;

  src = src.slice(0, start) + src.slice(end2);
  removed++;
}

if (removed === 0) {
  console.error("❌ No buildChatSystemPrompt() found to remove — unexpected.");
  process.exit(2);
}

// 2) Insert ONE known-good buildChatSystemPrompt() right after BASE_SYSTEM_PROMPT
const BASE_NEEDLE = "const BASE_SYSTEM_PROMPT";
const baseIdx = src.indexOf(BASE_NEEDLE);
if (baseIdx < 0) {
  console.error("❌ Could not find BASE_SYSTEM_PROMPT in server.ts");
  process.exit(3);
}
const baseSemi = src.indexOf(".trim();", baseIdx);
if (baseSemi < 0) {
  console.error("❌ Could not find end of BASE_SYSTEM_PROMPT (expected .trim();)");
  process.exit(4);
}
const insertAt = src.indexOf("\n", baseSemi);
if (insertAt < 0) {
  console.error("❌ Could not locate newline after BASE_SYSTEM_PROMPT block.");
  process.exit(5);
}

const canonical = `
async function buildChatSystemPrompt(args: { input: string; selected_skill?: string | null }) {
  const { soul, identity } = await loadAgentTexts();
  const memHits = await searchMemoryForChat(args.input, 5);
  const skill = args.selected_skill ? await loadSkillDoc(args.selected_skill) : "";

  const parts: string[] = [];
  parts.push(BASE_SYSTEM_PROMPT);

  if (identity.trim()) parts.push("\\n---\\n# IDENTITY (agent)\\n" + identity.trim());
  if (soul.trim()) parts.push("\\n---\\n# SOUL (agent)\\n" + soul.trim());

  if (skill.trim()) {
    parts.push("\\n---\\n# SELECTED SKILL: " + String(args.selected_skill ?? "") + "\\n" + skill.trim());
  }

  if (memHits.length > 0) {
    const formatted = memHits
      .map((h, idx) => "(" + (idx + 1) + ") " + h.rel + "\\n" + h.snippet)
      .join("\\n\\n");
    parts.push("\\n---\\n# RELEVANT MEMORY (snippets)\\n" + formatted);
  }

  parts.push([
    "---",
    "# RULES",
    "- Prefer local-first solutions. Do not propose cloud escalation unless the user asks or the current task truly requires it.",
    "- Keep answers actionable and short. Provide copy/paste commands when relevant.",
    "- If asked to edit code/configs, prefer full replacement files (not patches)."
  ].join("\\n"));

  return parts.join("\\n");
}
`.trim() + "\n\n";

src = src.slice(0, insertAt + 1) + canonical + src.slice(insertAt + 1);

// 3) Write file
fs.writeFileSync(FILE, src, "utf8");
console.log(`✅ Repaired server.ts: removed ${removed} duplicate buildChatSystemPrompt() blocks and inserted a clean one.`);
