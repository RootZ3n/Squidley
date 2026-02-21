// apps/api/src/http/routes/skills.ts
import type { FastifyInstance } from "fastify";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

type Deps = {
  zensquidRoot: () => string;
};

function skillsDir(zensquidRoot: () => string): string {
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
    const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
    const abs = path.join(dirAbs, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await listFilesRecursive(abs, rel)));
    } else {
      out.push(rel);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export async function registerSkillsRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  // ✅ Installed skills list (has skills/<name>/skill.md)
  app.get("/skills", async () => {
    const root = skillsDir(deps.zensquidRoot);
    const dirs = await readdir(root, { withFileTypes: true }).catch(() => []);
    const skills: Array<{ name: string; has_skill_md: boolean }> = [];

    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const name = d.name;
      const p = path.resolve(root, name, "skill.md");
      let ok = false;
      try {
        const st = await stat(p);
        ok = st.isFile();
      } catch {
        ok = false;
      }
      skills.push({ name, has_skill_md: ok });
    }

    const installed = skills
      .filter((s) => s.has_skill_md)
      .map((s) => ({ name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { ok: true, count: installed.length, skills: installed };
  });

  app.get("/skills/:name", async (req, reply) => {
    const name = String((req.params as any)?.name ?? "").trim();
    if (!name) return reply.code(400).send({ ok: false, error: "Missing skill name" });

    const base = skillsDir(deps.zensquidRoot);
    let skillRootAbs: string;
    try {
      skillRootAbs = safeJoinUnder(base, name);
    } catch {
      return reply.code(400).send({ ok: false, error: "Invalid skill name" });
    }

    const files = await listFilesRecursive(skillRootAbs).catch(() => null);
    if (!files) return reply.code(404).send({ ok: false, error: "Skill not found", name });

    const readmeRel =
      files.find((f) => f.toLowerCase() === "readme.md") ??
      files.find((f) => f.toLowerCase() === "skill.md") ??
      null;

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
      root: path.relative(deps.zensquidRoot(), skillRootAbs).replace(/\\/g, "/"),
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

    const base = skillsDir(deps.zensquidRoot);
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
}