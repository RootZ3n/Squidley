// apps/api/src/http/routes/archivum.ts
//
// Archivum — curated knowledge vault.
// Manual control, inspectable, searchable.

import type { FastifyInstance } from "fastify";
import { readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface ArchivumRouteOptions {
  zensquidRoot: string;
}

const ARCHIVUM_DIR = (root: string) => path.join(root, "memory", "archivum");

interface ArchivumMeta {
  id: string;
  filename: string;
  title: string;
  category: string;
  tags: string[];
  analysis: string;
  created_at: string;
  size_bytes: number;
}

async function loadMeta(entryDir: string): Promise<ArchivumMeta | null> {
  try {
    const raw = await readFile(path.join(entryDir, "meta.json"), "utf8");
    return JSON.parse(raw) as ArchivumMeta;
  } catch {
    return null;
  }
}

export async function registerArchivumRoutes(
  app: FastifyInstance,
  opts: ArchivumRouteOptions
): Promise<void> {
  const { zensquidRoot } = opts;
  const archivumDir = ARCHIVUM_DIR(zensquidRoot);

  // GET /archivum — list all entries
  app.get("/archivum", async (_req, reply) => {
    try {
      await mkdir(archivumDir, { recursive: true });
      const entries = await readdir(archivumDir).catch(() => [] as string[]);
      const metas: ArchivumMeta[] = [];

      for (const entry of entries) {
        const entryDir = path.join(archivumDir, entry);
        const meta = await loadMeta(entryDir);
        if (meta) metas.push(meta);
      }

      metas.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return reply.send({ ok: true, entries: metas, total: metas.length });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // GET /archivum/search?q=term — search by title, tags, analysis
  app.get("/archivum/search", async (req, reply) => {
    try {
      const { q, category } = req.query as any;
      if (!q && !category) {
        return reply.code(400).send({ error: "q or category query param required" });
      }

      const entries = await readdir(archivumDir).catch(() => [] as string[]);
      const results: ArchivumMeta[] = [];

      for (const entry of entries) {
        const entryDir = path.join(archivumDir, entry);
        const meta = await loadMeta(entryDir);
        if (!meta) continue;

        const matchesCategory = !category || meta.category === category;
        const searchTarget = `${meta.title} ${meta.tags.join(" ")} ${meta.analysis} ${meta.filename}`.toLowerCase();
        const matchesQuery = !q || searchTarget.includes((q as string).toLowerCase());

        if (matchesCategory && matchesQuery) results.push(meta);
      }

      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return reply.send({ ok: true, results, total: results.length });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // GET /archivum/:id — read a specific entry
  app.get("/archivum/:id", async (req, reply) => {
    try {
      const { id } = req.params as any;
      const entryDir = path.join(archivumDir, id);
      const meta = await loadMeta(entryDir);

      if (!meta) return reply.code(404).send({ error: "Entry not found" });

      const filePath = path.join(entryDir, meta.filename);
      let content: string | null = null;
      let base64: string | null = null;

      if (meta.category === "image") {
        try {
          const buf = await readFile(filePath);
          base64 = buf.toString("base64");
        } catch {}
      } else {
        try { content = await readFile(filePath, "utf8"); } catch {}
      }

      return reply.send({ ok: true, meta, content, base64 });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // PATCH /archivum/:id — update tags or title
  app.patch("/archivum/:id", async (req, reply) => {
    try {
      const { id } = req.params as any;
      const body = req.body as any;
      const entryDir = path.join(archivumDir, id);
      const meta = await loadMeta(entryDir);

      if (!meta) return reply.code(404).send({ error: "Entry not found" });

      if (body.title !== undefined) meta.title = body.title;
      if (body.tags !== undefined) meta.tags = body.tags;

      await writeFile(path.join(entryDir, "meta.json"), JSON.stringify(meta, null, 2));
      return reply.send({ ok: true, meta });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // DELETE /archivum/:id — remove permanently
  app.delete("/archivum/:id", async (req, reply) => {
    try {
      const { id } = req.params as any;
      const entryDir = path.join(archivumDir, id);
      await rm(entryDir, { recursive: true, force: true });
      return reply.send({ ok: true, deleted: id });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
