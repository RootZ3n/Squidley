// scripts/fix-orphan-close.mjs
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const serverPath = path.join(repoRoot, "apps/api/src/server.ts");

let src = fs.readFileSync(serverPath, "utf8");

const chatHead =
  `app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat", async (req, reply) => {`;

const start = src.indexOf(chatHead);
if (start < 0) {
  throw new Error("Could not find /chat route head to anchor cleanup.");
}

// Find the end of the /chat handler (brace scan)
let i = start + chatHead.length;
let depth = 1;
while (i < src.length && depth > 0) {
  const ch = src[i];
  if (ch === "{") depth++;
  else if (ch === "}") depth--;
  i++;
}
if (depth !== 0) throw new Error("Brace scan failed: could not find end of /chat handler.");

const after = src.slice(i);

// Remove one or more orphan lines that are *exactly* `);` (with optional whitespace)
const cleanedAfter = after.replace(/^\s*\);\s*\n+/m, "\n");

// If nothing changed, try a slightly broader fix: remove `);\n` if it appears immediately after handler
let finalAfter = cleanedAfter;
if (finalAfter === after) {
  finalAfter = after.replace(/^\s*\);\s*$/m, "");
}

if (finalAfter === after) {
  throw new Error(
    "Did not find an orphan `);` immediately after /chat handler. We may need to inspect around the error line."
  );
}

src = src.slice(0, i) + finalAfter;
fs.writeFileSync(serverPath, src, "utf8");

console.log("Fixed: removed orphan `);` after /chat handler.");
