// apps/api/src/http/routes/receipts.ts
import type { FastifyInstance } from "fastify";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { loadConfig, type ReceiptV1 } from "@zensquid/core";

type Deps = {
  zensquidRoot: () => string;
  receiptsDir: () => string;
  preview: (s: unknown, n?: number) => string;
};

async function listReceiptFiles(receiptsDir: () => string): Promise<string[]> {
  const dir = receiptsDir();
  const files = await readdir(dir).catch(() => []);
  return files.filter((f) => f.endsWith(".json"));
}

export async function registerReceiptsRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  /**
   * Receipts
   */
  app.get("/receipts", async (req, reply) => {
    // keep same semantics as server.ts: use req.url + base URL
    const url = new URL(req.url, "http://127.0.0.1");
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.max(1, Math.min(200, Number(limitRaw ?? "50")));

    const files = await listReceiptFiles(deps.receiptsDir);
    const receipts: ReceiptV1[] = [];

    for (const f of files) {
      try {
        const raw = await readFile(path.resolve(deps.receiptsDir(), f), "utf-8");
        receipts.push(JSON.parse(raw));
      } catch {}
    }

    receipts.sort((a, b) => (((a as any).created_at < (b as any).created_at) ? 1 : -1));

    const sliced = receipts.slice(0, limit).map((r: any) => ({
      receipt_id: r.receipt_id,
      created_at: r.created_at,
      kind: r.request?.kind ?? null,
      tier: r.decision?.tier,
      provider: r.decision?.provider,
      model: r.decision?.model,
      escalated: r.decision?.escalated,
      escalation_reason: r.decision?.escalation_reason,
      tool: r.tool_event ? { allowed: r.tool_event.allowed, capability: r.tool_event.capability } : null,
      input_preview: deps.preview(r.request?.input, 120)
    }));

    return reply.send({ count: sliced.length, receipts: sliced });
  });

  app.get("/receipts/:id", async (req, reply) => {
    const id = (req.params as any).id as string;
    const file = path.resolve(deps.receiptsDir(), `${id}.json`);

    try {
      const raw = await readFile(file, "utf-8");
      const receipt = JSON.parse(raw) as ReceiptV1;
      return reply.send(receipt);
    } catch {
      return reply.code(404).send({ error: "Receipt not found", receipt_id: id });
    }
  });

  /**
   * (Optional) This route can be useful later for UI “receipt index” sanity,
   * but keeping it out for now since your server.ts didn't have it.
   */
  void loadConfig; // silence TS “unused” if build settings get strict later
}