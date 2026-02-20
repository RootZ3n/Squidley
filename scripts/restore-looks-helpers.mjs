// scripts/restore-looks-helpers.mjs
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const serverPath = path.join(repoRoot, "apps/api/src/server.ts");
let src = fs.readFileSync(serverPath, "utf8");

// If they already exist, don't double-insert.
if (src.includes("function looksInfraOrTooling(") && src.includes("function looksCodey(")) {
  console.log("looksInfraOrTooling + looksCodey already exist. Nothing to do.");
  process.exit(0);
}

const helpersBlock = `

function looksInfraOrTooling(input: string): boolean {
  const s = input.toLowerCase();
  return (
    s.includes("zensquid") ||
    s.includes("squidley") ||
    s.includes("openclaw") ||
    s.includes("receipt") ||
    s.includes("receipts") ||
    s.includes("snapshot") ||
    s.includes("doctor") ||
    s.includes("sanity") ||
    s.includes("systemctl") ||
    s.includes("journalctl") ||
    s.includes("curl ") ||
    s.includes("port ") ||
    s.includes("http://") ||
    s.includes("https://") ||
    s.includes("/health") ||
    s.includes("/runtime") ||
    s.includes("/skills") ||
    s.includes("/memory")
  );
}

function looksCodey(input: string): boolean {
  const s = input.toLowerCase();
  return (
    s.includes("diff --git") ||
    s.includes("--- a/") ||
    s.includes("+++ b/") ||
    s.includes("@@ ") ||
    s.includes("stack trace") ||
    s.includes("traceback") ||
    s.includes("tsconfig") ||
    s.includes("package.json") ||
    s.includes("systemd") ||
    s.includes("dockerfile") ||
    s.includes("error ts") ||
    s.includes("cannot find module") ||
    s.includes("module not found")
  );
}
`;

// Insert right before the /chat route declaration
const chatHead =
  `app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat", async (req, reply) => {`;

const idx = src.indexOf(chatHead);
if (idx < 0) {
  throw new Error('Could not find /chat route head to insert helpers before.');
}

src = src.slice(0, idx) + helpersBlock + "\n" + src.slice(idx);

fs.writeFileSync(serverPath, src, "utf8");
console.log("Restored looksInfraOrTooling + looksCodey above /chat.");
