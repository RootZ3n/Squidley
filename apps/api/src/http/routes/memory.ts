// apps/api/src/http/routes/memory.ts
import type { FastifyInstance } from "fastify";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig, newReceiptId, type ReceiptV1 } from "@zensquid/core";
import type { CapabilityAction } from "../../capabilities/types.js";

type Deps = {
  zensquidRoot: () => string;

  adminTokenOk: (req: any) => boolean;

  // from ./chat/systemPrompt.js
  ensureMemoryRoot: () => Promise<void>;
  normalizeRelPath: (s: string) => string;
  memoryAbs: (rel: string) => string;

  // from server.ts (or elsewhere)
  memoryRoot: () => string;
  safeReadText: (p: string, maxBytes?: number) => Promise<string>;
  gateOrDenyTool: (args: {
    cfg: any;
    action: CapabilityAction;
    reply: any;
    receiptBase: Partial<ReceiptV1>;
  }) => Promise<any>;
};

type SearchResult = { path: string; snippet: string };

function preview(s: unknown, n = 140): string {
  const t = String(s ?? "");
  const oneLine = t.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}

function makeSnippet(text: string, needle: string, maxLen = 140): string {
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return preview(text, maxLen);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + 120);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return slice.length > maxLen ? slice.slice(0, maxLen - 1) + "…" : slice;
}

async function walkMarkdownFiles(root: string, maxFiles = 600): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    if (out.length >= maxFiles) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      const p = path.resolve(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".markdown"))) out.push(p);
    }
  }
  await walk(root);
  return out;
}

export async function registerMemoryRoutes(app: FastifyInstance, deps: Deps) {
  /**
   * ✅ Memory API (admin-only)
   */
  app.get("/memory/folders", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    await deps.ensureMemoryRoot();

    const entries = await readdir(deps.memoryRoot(), { withFileTypes: true }).catch(() => []);
    const folders = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    return reply.send({ ok: true, count: folders.length, folders });
  });

  app.get("/memory/list", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    await deps.ensureMemoryRoot();

    const url = new URL(req.url, "http://127.0.0.1");
    const folderRaw = url.searchParams.get("folder") ?? "";
    const folder = deps.normalizeRelPath(folderRaw);
    if (!folder) return reply.code(400).send({ ok: false, error: "Missing/invalid folder" });

    const absFolder = deps.memoryAbs(folder);
    const entries = await readdir(absFolder, { withFileTypes: true }).catch(() => []);
    const files = entries
      .filter((e) => e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".markdown")))
      .map((e) => `${folder}/${e.name}`.replace(/\\/g, "/"))
      .sort();

    return reply.send({ ok: true, folder: `memory/${folder}`, count: files.length, files });
  });

  app.get("/memory/read", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    await deps.ensureMemoryRoot();

    const url = new URL(req.url, "http://127.0.0.1");
    const relRaw = url.searchParams.get("path") ?? "";
    const rel = deps.normalizeRelPath(relRaw);
    if (!rel) return reply.code(400).send({ ok: false, error: "Missing/invalid path" });

    const abs = deps.memoryAbs(rel);

    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const receipt_id = newReceiptId();
    const base: Partial<ReceiptV1> = {
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: { input: `[memory read] memory/${rel}` } as any,
      decision: { tier: "tool", provider: "local", model: "fs.read", escalated: false } as any
    };

    const deny = await deps.gateOrDenyTool({
      cfg,
      action: { kind: "fs.read", capability: "fs.read", path: abs },
      reply,
      receiptBase: base
    });
    if (deny) return deny;

    const content = await deps.safeReadText(abs, 200_000);
    return reply.send({ ok: true, path: `memory/${rel}`, abs, content, receipt_id });
  });

  app.post("/memory/write", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    await deps.ensureMemoryRoot();

    const body = (req.body ?? {}) as any;
    const rel = deps.normalizeRelPath(body?.path ?? "");
    const content = typeof body?.content === "string" ? body.content : null;

    if (!rel || content === null) {
      return reply.code(400).send({ ok: false, error: "Missing/invalid path or content" });
    }

    const abs = deps.memoryAbs(rel);

    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const receipt_id = newReceiptId();
    const base: Partial<ReceiptV1> = {
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: { input: `[memory write] memory/${rel}` } as any,
      decision: { tier: "tool", provider: "local", model: "fs.write", escalated: false } as any
    };

    const deny = await deps.gateOrDenyTool({
      cfg,
      action: { kind: "fs.write", capability: "fs.write", path: abs, bytes: Buffer.byteLength(content) },
      reply,
      receiptBase: base
    });
    if (deny) return deny;

    await mkdir(path.dirname(abs), { recursive: true }).catch(() => {});
    await writeFile(abs, content, "utf-8");

    return reply.send({
      ok: true,
      path: `memory/${rel}`,
      abs,
      bytes: Buffer.byteLength(content),
      receipt_id
    });
  });

  app.get("/memory/search", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    await deps.ensureMemoryRoot();

    const url = new URL(req.url, "http://127.0.0.1");
    const q = (url.searchParams.get("q") ?? "").trim();
    const folderRaw = (url.searchParams.get("folder") ?? "").trim();

    if (!q) return reply.code(400).send({ ok: false, error: "Missing q" });

    let folderAbs = deps.memoryRoot();
    let folderRelPrefix = "memory";

    if (folderRaw) {
      const cleaned = folderRaw.startsWith("memory/") ? folderRaw.slice("memory/".length) : folderRaw;
      const rel = deps.normalizeRelPath(cleaned);
      if (!rel) return reply.code(400).send({ ok: false, error: "Invalid folder" });
      folderAbs = deps.memoryAbs(rel);
      folderRelPrefix = `memory/${rel}`;
    }

    const files = await walkMarkdownFiles(folderAbs, 600);
    const results: SearchResult[] = [];

    for (const abs of files) {
      const raw = await deps.safeReadText(abs, 120_000);
      if (!raw) continue;
      if (raw.toLowerCase().includes(q.toLowerCase())) {
        const rel = path.relative(deps.zensquidRoot(), abs).replace(/\\/g, "/");
        results.push({
          path: rel,
          snippet: makeSnippet(raw, q, 140)
        });
      }
      if (results.length >= 50) break;
    }

    return reply.send({ ok: true, q, folder: folderRelPrefix, count: results.length, results });
  });
}