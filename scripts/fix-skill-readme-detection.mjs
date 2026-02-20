// scripts/fix-skill-readme-detection.mjs
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const serverPath = path.join(repoRoot, "apps/api/src/server.ts");

let src = fs.readFileSync(serverPath, "utf8");

// If the endpoints aren't present, bail.
if (!src.includes('app.get("/skills/:name"') || !src.includes("readme_rel")) {
  console.error("Could not find /skills/:name endpoint block. Did it get added?");
  process.exit(1);
}

// Replace the "Prefer README.md" logic with README.md OR skill.md (OpenClaw style).
const needle = `  // Prefer README.md if present
  const readmeRel = files.find((f) => f.toLowerCase() === "readme.md") ?? null;`;

if (!src.includes(needle)) {
  console.error("Could not find the readme selection block to patch.");
  process.exit(1);
}

const replacement = `  // Prefer README.md, fallback to skill.md (OpenClaw-style skills)
  const readmeRel =
    files.find((f) => f.toLowerCase() === "readme.md") ??
    files.find((f) => f.toLowerCase() === "skill.md") ??
    null;`;

src = src.replace(needle, replacement);

fs.writeFileSync(serverPath, src, "utf8");
console.log("Patched /skills/:name to use README.md or skill.md as the readme.");
