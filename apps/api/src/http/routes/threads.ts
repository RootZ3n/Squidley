import type { FastifyInstance } from "fastify";
import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export interface ThreadsRouteOptions { zensquidRoot: string; }
const TD = (r: string) => path.join(r, "memory", "threads");

interface ThreadEntry {
  thread_id: string; title: string; status: "active"|"parked"|"closed";
  tags: string[]; summary: string; open_loops: string[]; last_touched: string;
}

async function loadThread(dir: string, id: string): Promise<ThreadEntry|null> {
  try { return JSON.parse(await readFile(path.join(dir, `${id}.json`), "utf8")); } catch { return null; }
}
async function getActiveId(dir: string): Promise<string|null> {
  try { return (await readFile(path.join(dir, "_active.txt"), "utf8")).trim().split("\n")[0]?.trim()||null; } catch { return null; }
}
async function setActiveId(dir: string, id: string) { await writeFile(path.join(dir, "_active.txt"), id+"\n"); }

export async function registerThreadsRoutes(app: FastifyInstance, opts: ThreadsRouteOptions): Promise<void> {
  const td = TD(opts.zensquidRoot);
  await mkdir(td, { recursive: true });

  app.get("/threads/active", async (_req, reply) => {
    const activeId = await getActiveId(td);
    if (!activeId) return reply.send({ ok: true, thread: null, active_id: null });
    return reply.send({ ok: true, thread: await loadThread(td, activeId), active_id: activeId });
  });

  app.get("/threads", async (_req, reply) => {
    const entries = await readdir(td).catch(() => [] as string[]);
    const activeId = await getActiveId(td);
    const threads = [];
    for (const e of entries) {
      if (!e.endsWith(".json") || e.startsWith("_")) continue;
      const id = e.replace(".json","");
      const t = await loadThread(td, id);
      if (t) threads.push({ ...t, is_active: id === activeId });
    }
    threads.sort((a: any, b: any) => new Date(b.last_touched).getTime() - new Date(a.last_touched).getTime());
    return reply.send({ ok: true, threads, active_id: activeId, total: threads.length });
  });

  app.get("/threads/:id", async (req: any, reply) => {
    const t = await loadThread(td, req.params.id);
    if (!t) return reply.code(404).send({ error: "Thread not found" });
    return reply.send({ ok: true, thread: t, is_active: req.params.id === await getActiveId(td) });
  });

  app.post("/threads", async (req: any, reply) => {
    const { title, tags, summary, open_loops, set_active } = req.body as any;
    if (!title) return reply.code(400).send({ error: "title required" });
    const thread_id = `thread-${new Date().toISOString().slice(0,10)}-${crypto.randomBytes(4).toString("hex")}`;
    const thread: ThreadEntry = { thread_id, title, status: "active", tags: tags||[], summary: summary||"", open_loops: open_loops||[], last_touched: new Date().toISOString() };
    await writeFile(path.join(td, `${thread_id}.json`), JSON.stringify(thread, null, 2));
    if (set_active) await setActiveId(td, thread_id);
    return reply.send({ ok: true, thread });
  });

  app.patch("/threads/:id", async (req: any, reply) => {
    const t = await loadThread(td, req.params.id);
    if (!t) return reply.code(404).send({ error: "Thread not found" });
    const b = req.body as any;
    if (b.title !== undefined) t.title = b.title;
    if (b.status !== undefined) t.status = b.status;
    if (b.tags !== undefined) t.tags = b.tags;
    if (b.summary !== undefined) t.summary = b.summary;
    if (b.open_loops !== undefined) t.open_loops = b.open_loops;
    t.last_touched = new Date().toISOString();
    await writeFile(path.join(td, `${req.params.id}.json`), JSON.stringify(t, null, 2));
    return reply.send({ ok: true, thread: t });
  });

  app.post("/threads/:id/activate", async (req: any, reply) => {
    const t = await loadThread(td, req.params.id);
    if (!t) return reply.code(404).send({ error: "Thread not found" });
    await setActiveId(td, req.params.id);
    return reply.send({ ok: true, active_id: req.params.id });
  });

  app.delete("/threads/:id", async (req: any, reply) => {
    await unlink(path.join(td, `${req.params.id}.json`)).catch(() => {});
    const activeId = await getActiveId(td);
    if (activeId === req.params.id) await writeFile(path.join(td, "_active.txt"), "");
    return reply.send({ ok: true, deleted: req.params.id });
  });
}
