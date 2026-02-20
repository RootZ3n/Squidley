// scripts/add-skill-detail-endpoints.mjs
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const serverPath = path.join(repoRoot, "apps/api/src/server.ts");

let src = fs.readFileSync(serverPath, "utf8");

// Bail if already added
if (src.includes('app.get("/skills/:name"') || src.includes('app.get("/skills/:name/file"')) {
  console.log("Skill detail endpoints already exist. Nothing to do.");
  process.exit(0);
}

// We insert the new endpoints near the existing /skills list endpoint if possible,
// otherwise we append before app.listen().
const insertBlock = `

/**
 * Skills: detail + file read (markdown-first)
 * - GET /skills/:name
 * - GET /skills/:name/file?path=README.md
 */
function skillsDir(): string {
  return path.resolve(zensquidRoot(), "skills");
}

function safeJoinUnder(baseDir: string, ...parts: string[]): string {
  const joined = path.resolve(baseDir, ...parts);
  const base = path.resolve(baseDir) + path.sep;
  if (!joined.startsWith(base)) {
    throw new Error("Path escapes base dir");
  }
  return joined;
}

async function listFilesRecursive(dirAbs: string, relPrefix = ""): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dirAbs, { withFileTypes: true }).catch(() => []);
  for (const ent of entries) {
    const rel = relPrefix ? \`\${relPrefix}/\${ent.name}\` : ent.name;
    const abs = path.join(dirAbs, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await listFilesRecursive(abs, rel)));
    } else {
      out.push(rel);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

app.get("/skills/:name", async (req, reply) => {
  const name = String((req.params as any)?.name ?? "").trim();
  if (!name) return reply.code(400).send({ ok: false, error: "Missing skill name" });

  const base = skillsDir();
  let skillRootAbs: string;
  try {
    skillRootAbs = safeJoinUnder(base, name);
  } catch {
    return reply.code(400).send({ ok: false, error: "Invalid skill name" });
  }

  // Verify directory exists by attempting to read it
  const files = await listFilesRecursive(skillRootAbs).catch(() => null);
  if (!files) return reply.code(404).send({ ok: false, error: "Skill not found", name });

  // Prefer README.md if present
  const readmeRel = files.find((f) => f.toLowerCase() === "readme.md") ?? null;

  let readme = null;
  if (readmeRel) {
    try {
      const readmeAbs = safeJoinUnder(skillRootAbs, readmeRel);
      readme = await readFile(readmeAbs, "utf-8");
    } catch {
      readme = null;
    }
  }

  return reply.send({
    ok: true,
    name,
    root: path.relative(zensquidRoot(), skillRootAbs).replace(/\\\\/g, "/"),
    readme_rel: readmeRel,
    readme,
    files
  });
});

app.get("/skills/:name/file", async (req, reply) => {
  const name = String((req.params as any)?.name ?? "").trim();
  const url = new URL(req.url, "http://127.0.0.1");
  const relPath = String(url.searchParams.get("path") ?? "").trim();

  if (!name) return reply.code(400).send({ ok: false, error: "Missing skill name" });
  if (!relPath) return reply.code(400).send({ ok: false, error: "Missing file path (?path=...)" });

  const base = skillsDir();
  let skillRootAbs: string;
  try {
    skillRootAbs = safeJoinUnder(base, name);
  } catch {
    return reply.code(400).send({ ok: false, error: "Invalid skill name" });
  }

  let fileAbs: string;
  try {
    fileAbs = safeJoinUnder(skillRootAbs, relPath);
  } catch {
    return reply.code(400).send({ ok: false, error: "Invalid file path" });
  }

  try {
    const content = await readFile(fileAbs, "utf-8");
    return reply.send({
      ok: true,
      name,
      path: relPath,
      abs: fileAbs,
      bytes: Buffer.byteLength(content),
      content
    });
  } catch {
    return reply.code(404).send({ ok: false, error: "File not found", name, path: relPath });
  }
});

`;

function insertBeforeListenOrAppend() {
  // Insert before the final app.listen({ ... });
  const marker = "await app.listen(";
  const idx = src.lastIndexOf(marker);
  if (idx < 0) {
    // fallback: append at end
    src += insertBlock;
    return;
  }
  src = src.slice(0, idx) + insertBlock + "\n" + src.slice(idx);
}

insertBeforeListenOrAppend();

fs.writeFileSync(serverPath, src, "utf8");
console.log("Added /skills/:name and /skills/:name/file endpoints to apps/api/src/server.ts");
