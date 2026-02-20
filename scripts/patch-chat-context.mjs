// scripts/patch-chat-context.mjs
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const serverPath = path.join(repoRoot, "apps/api/src/server.ts");

let src = fs.readFileSync(serverPath, "utf8");

// ---------------- helpers ----------------
function replaceAll(re, replacement) {
  src = src.replace(re, replacement);
}

function findRouteBlock(routeHead) {
  const start = src.indexOf(routeHead);
  if (start < 0) throw new Error(`Could not find route head: ${routeHead}`);

  const afterHead = start + routeHead.length;

  // brace-scan to find end of handler block
  let i = afterHead;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  if (depth !== 0) throw new Error("Brace scan failed (could not find end of route).");

  return { start, end: i, block: src.slice(start, i) };
}

// ---------------- 1) fix TS errors globally ----------------

// Fix import extension if present
replaceAll(
  /import\s+\{\s*buildChatSystemPrompt\s*\}\s+from\s+["']\.\/chat_context["'];/g,
  `import { buildChatSystemPrompt } from "./chat_context.js";`
);

// If there is already a .js import, keep it; if there is no import at all, we will insert later.

// Remove the illegal repoRoot property line wherever it appears
replaceAll(/^\s*repoRoot:\s*process\.cwd\(\)\s*,\s*\n/m, "");

// ---------------- 2) ensure we have the import line (insert if missing) ----------------
if (!src.includes(`import { buildChatSystemPrompt } from "./chat_context.js";`)) {
  // remove any non-.js variant first (just in case)
  replaceAll(
    /import\s+\{\s*buildChatSystemPrompt\s*\}\s+from\s+["']\.\/chat_context(?:\.js)?["'];\s*\n?/g,
    ""
  );

  const importLine = `import { buildChatSystemPrompt } from "./chat_context.js";\n`;

  const m = src.match(/^(?:import .*;\s*)+/m);
  if (!m) throw new Error("Could not find import block in server.ts to insert chat_context import.");

  src = src.replace(m[0], m[0] + importLine);
}

// ---------------- 3) patch /chat route to use dynamic system prompt ----------------
const chatHead =
  `app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat", async (req, reply) => {`;

const { start, end, block } = findRouteBlock(chatHead);
let chatBlock = block;

// Identify the variable that contains the structured request object with `input`
// Works for:
//   const normalized: ChatRequest = { input, ... }
//   const normalized = { input, ... }
//   const foo = { input, ... }
let inputExpr = null;
let selectedSkillExpr = `(req.body as any)?.selected_skill ?? null`;

const normMatch = chatBlock.match(
  /const\s+(\w+)\s*(?::\s*ChatRequest)?\s*=\s*\{\s*input\b/m
);
if (normMatch) {
  const varName = normMatch[1];
  inputExpr = `${varName}.input`;
}

// Fallback if we can't find a normalized object
if (!inputExpr) {
  // try to find a plain input var: const input = ...
  const inputVarMatch = chatBlock.match(/const\s+(\w+)\s*=\s*.*\bbody\.\s*input\b.*;/m);
  if (inputVarMatch) inputExpr = inputVarMatch[1];
}

// absolute fallback
if (!inputExpr) {
  inputExpr = `typeof (req.body as any)?.input === "string" ? (req.body as any).input : ""`;
}

// Inject dynamicSystem creation once
if (!chatBlock.includes("const dynamicSystem = await buildChatSystemPrompt")) {
  // Prefer to insert after the normalized object ends (after first "};" following that const)
  let insertAt = -1;

  if (normMatch) {
    const idx = chatBlock.indexOf(normMatch[0]);
    if (idx >= 0) {
      const endObj = chatBlock.indexOf("};", idx);
      if (endObj >= 0) insertAt = endObj + 2;
    }
  }

  // Otherwise insert after cfg load
  if (insertAt < 0) {
    const cfgIdx = chatBlock.indexOf("const cfg = await loadConfig");
    if (cfgIdx >= 0) {
      const afterLine = chatBlock.indexOf(";", cfgIdx);
      if (afterLine >= 0) insertAt = afterLine + 1;
    }
  }

  // Otherwise insert right after route head
  if (insertAt < 0) {
    insertAt = chatHead.length;
  }

  const inject = `

  // Dynamic system prompt: SOUL.md + IDENTITY.md + optional skill + relevant memory
  const selectedSkill = ${selectedSkillExpr};
  const dynamicSystem = await buildChatSystemPrompt({
    input: ${inputExpr},
    selectedSkill
  });
`;

  chatBlock = chatBlock.slice(0, insertAt) + inject + chatBlock.slice(insertAt);
}

// Replace system prompt usage inside /chat block
// 1) content: SYSTEM_PROMPT
chatBlock = chatBlock.replace(/content:\s*SYSTEM_PROMPT/g, "content: dynamicSystem");

// 2) If there are any system messages using something else, we still want dynamicSystem
// Replace system message content in messages arrays in this handler
chatBlock = chatBlock.replace(
  /(role\s*:\s*["']system["']\s*,\s*content\s*:\s*)([^}\n]+)(\s*\})/g,
  (_, a, _old, c) => `${a}dynamicSystem${c}`
);

// sanity check
if (!chatBlock.includes("dynamicSystem")) {
  throw new Error("Patch failed: /chat route still does not reference dynamicSystem.");
}

// Write patched file back
src = src.slice(0, start) + chatBlock + src.slice(end);

fs.writeFileSync(serverPath, src, "utf8");
console.log("Patched server.ts: fixed import (.js), removed repoRoot, /chat now builds dynamic SOUL/IDENTITY/skill/memory system prompt.");
