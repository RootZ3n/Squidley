// scripts/fix-chat-context-cleanup.mjs
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const serverPath = path.join(repoRoot, "apps/api/src/server.ts");

let src = fs.readFileSync(serverPath, "utf8");

function fail(msg) {
  throw new Error(msg);
}

// 1) Remove the conflicting import (because buildChatSystemPrompt is declared locally)
src = src.replace(
  /^\s*import\s+\{\s*buildChatSystemPrompt\s*\}\s+from\s+["']\.\/chat_context\.js["'];\s*\n/m,
  ""
);

// 2) Find the /chat handler block
const head =
  `app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat", async (req, reply) => {`;

const start = src.indexOf(head);
if (start < 0) fail("Could not find /chat route head (expected exact signature).");

let i = start + head.length;
let depth = 1;
while (i < src.length && depth > 0) {
  const ch = src[i];
  if (ch === "{") depth++;
  else if (ch === "}") depth--;
  i++;
}
if (depth !== 0) fail("Brace scan failed: could not find end of /chat handler.");

const end = i;
let block = src.slice(start, end);

// 3) Remove the injected duplicate block that starts with:
//    // Dynamic system prompt: SOUL.md ...
//    const selectedSkill = ...
//    const dynamicSystem = ...
//
// We remove from that comment up to just before:  const input = ...
const injStart = block.indexOf("// Dynamic system prompt: SOUL.md + IDENTITY.md + optional skill + relevant memory");
if (injStart >= 0) {
  const inputIdx = block.indexOf("const input =");
  if (inputIdx < 0) fail("Cleanup: found injected block but could not find `const input =` inside /chat.");
  block = block.slice(0, injStart) + block.slice(inputIdx);
}

// 4) Now fix the call to buildChatSystemPrompt to use selected_skill (snake_case).
// You currently have something like:
//   const system = await buildChatSystemPrompt({
//     selectedSkill,
//     input
//   });
//
// Replace ONLY inside /chat block.
block = block.replace(
  /const\s+system\s*=\s*await\s+buildChatSystemPrompt\s*\(\s*\{\s*([\s\S]*?)\}\s*\)\s*;/m,
  (m, inner) => {
    // normalize whitespace
    const hasSelectedSkill = /selectedSkill\s*,/m.test(inner) || /selectedSkill\s*:/m.test(inner);
    const hasSelected_skill = /selected_skill\s*,/m.test(inner) || /selected_skill\s*:/m.test(inner);
    const hasInput = /\binput\b/m.test(inner);

    // We want: { input, selected_skill: selectedSkill }
    // Build a safe replacement regardless of what was there.
    const lines = [];
    if (!hasInput) {
      // If for some reason input wasn't included, keep existing inner, but append input
      lines.push("    input,");
    } else {
      lines.push("    input,");
    }

    lines.push("    selected_skill: selectedSkill");

    return `const system = await buildChatSystemPrompt({\n${lines.join("\n")}\n  });`;
  }
);

// 5) Ensure there is exactly ONE selectedSkill declaration in the handler.
// If there are still two, remove the earlier one (rare, but we’ll be defensive).
const matches = block.match(/const\s+selectedSkill\s*=/g) ?? [];
if (matches.length > 1) {
  // remove the first declaration block line only
  block = block.replace(/^\s*const\s+selectedSkill\s*=.*\n/m, "");
}

// 6) Write it back
src = src.slice(0, start) + block + src.slice(end);
fs.writeFileSync(serverPath, src, "utf8");

console.log("Cleaned /chat: removed duplicate injected selectedSkill/dynamicSystem, removed conflicting import, and fixed buildChatSystemPrompt args (selected_skill).");
