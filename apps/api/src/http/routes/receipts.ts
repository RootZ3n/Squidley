// apps/api/src/http/routes/receipts.ts
import type { FastifyInstance } from "fastify";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

type ReceiptAny = Record<string, any>;

const TOOLRUN_SCHEMA = "squidley.toolrun.v1";
const ZENSQUID_SCHEMA = "zensquid.receipt.v1";

function safeNum(v: any, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getKind(r: ReceiptAny): string | null {
  return (r?.request?.kind ?? r?.request?.mode ?? null) as string | null;
}

function pick(obj: any, keys: string[]) {
  const out: any = {};
  for (const k of keys) out[k] = obj?.[k] ?? null;
  return out;
}

/**
 * Normalize older / alternate receipt schemas into the single public schema.
 * IMPORTANT: this is output-only. We don't mutate what is stored on disk.
 */
function normalizeReceiptForPublic(r: ReceiptAny): ReceiptAny {
  if (!r || typeof r !== "object") return r;

  // Fold squidley.toolrun.v1 into zensquid.receipt.v1
  if (r.schema === TOOLRUN_SCHEMA) {
    const req = (r.request && typeof r.request === "object") ? r.request : {};
    const meta = (r.meta && typeof r.meta === "object") ? r.meta : {};

    // toolrun receipts may have tool-ish fields elsewhere; we only surface safe summary fields.
    const toolrun =
      (meta.toolrun && typeof meta.toolrun === "object")
        ? meta.toolrun
        : (r.toolrun && typeof r.toolrun === "object")
          ? r.toolrun
          : null;

    return {
      ...r,
      schema: ZENSQUID_SCHEMA,
      request: {
        ...req,
        kind: "tool",
      },
      // Keep decision as-is (toolrun receipts may not have decision populated)
      meta: {
        ...meta,
        // only keep toolrun if it already exists somewhere; sanitizeReceipt will reduce it further
        ...(toolrun ? { toolrun } : {}),
      },
    };
  }

  return r;
}

function sanitizeReceipt(r0: ReceiptAny) {
  // IMPORTANT: this is the only shape the public UI sees.
  // No provider_response, no tool stdout, no injected context bodies, etc.

  const r = normalizeReceiptForPublic(r0);

  // very small, safe toolrun summary (only if present after normalization)
  const toolrunSafe =
    r?.meta?.toolrun && typeof r.meta.toolrun === "object"
      ? pick(r.meta.toolrun, ["tool_id", "ok", "exit_code", "timed_out", "statusCode"])
      : null;

  return {
    schema: r?.schema ?? null,
    receipt_id: r?.receipt_id ?? null,
    created_at: r?.created_at ?? null,
    node: r?.node ?? null,
    request: {
      kind: getKind(r),
      mode: r?.request?.mode ?? null,
      force_tier: r?.request?.force_tier ?? null,
      selected_skill: r?.request?.selected_skill ?? null,
    },
    decision: {
      tier: r?.decision?.tier ?? null,
      provider: r?.decision?.provider ?? null,
      model: r?.decision?.model ?? null,
      escalated: r?.decision?.escalated ?? null,
      escalation_reason: r?.decision?.escalation_reason ?? null,
      active_model: r?.decision?.active_model
        ? pick(r.decision.active_model, ["provider", "model", "model_class", "param_b", "class_source"])
        : null,
    },
    error: r?.error ? pick(r.error, ["message"]) : null,
    meta: {
      ms: r?.meta?.ms ?? null,
      toolrun: toolrunSafe,
    },
  };
}

async function listReceiptFilesSorted(dir: string): Promise<string[]> {
  const files = await readdir(dir).catch(() => []);
  const jsons = files.filter((f) => f.endsWith(".json"));

  // Sort newest first using mtime
  const withTime = await Promise.all(
    jsons.map(async (f) => {
      const p = path.resolve(dir, f);
      try {
        const st = await stat(p);
        return { f, t: st.mtimeMs || 0 };
      } catch {
        return { f, t: 0 };
      }
    })
  );

  withTime.sort((a, b) => b.t - a.t);
  return withTime.map((x) => x.f);
}

async function readReceiptJson(p: string): Promise<ReceiptAny | null> {
  try {
    const raw = await readFile(p, "utf-8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? (j as ReceiptAny) : null;
  } catch {
    return null;
  }
}

export async function registerReceiptsRoutes(
  app: FastifyInstance,
  opts: {
    zensquidRoot: () => string;
    receiptsDir: () => string;
    preview: (s: unknown, n?: number) => string;
    adminTokenOk?: (req: any) => boolean; // optional; if missing, full endpoint is disabled
  }
) {
  const receiptsDir = opts.receiptsDir;

  // ✅ Public, sanitized receipts list
  // GET /receipts?limit=5&kind=chat
  app.get("/receipts", async (req, reply) => {
    const q: any = (req as any).query ?? {};
    const limit = Math.min(Math.max(safeNum(q.limit, 10), 1), 50);
    const wantKind = typeof q.kind === "string" && q.kind.trim() ? q.kind.trim() : null;

    const dir = receiptsDir();
    const files = await listReceiptFilesSorted(dir);

    const receipts: any[] = [];

    for (const f of files) {
      if (receipts.length >= limit) break;

      const p = path.resolve(dir, f);
      const r = await readReceiptJson(p);
      if (!r) continue;

      const k = getKind(normalizeReceiptForPublic(r));
      if (wantKind && k !== wantKind) continue;

      receipts.push(sanitizeReceipt(r));
    }

    return reply.send({
      ok: true,
      count: files.length,
      receipts,
    });
  });

  // ✅ Public convenience endpoint (latest receipt, sanitized)
  // GET /receipts/latest?kind=chat
  app.get("/receipts/latest", async (req, reply) => {
    const q: any = (req as any).query ?? {};
    const wantKind = typeof q.kind === "string" && q.kind.trim() ? q.kind.trim() : null;

    const dir = receiptsDir();
    const files = await listReceiptFilesSorted(dir);

    for (const f of files) {
      const p = path.resolve(dir, f);
      const r = await readReceiptJson(p);
      if (!r) continue;

      const k = getKind(normalizeReceiptForPublic(r));
      if (wantKind && k !== wantKind) continue;

      return reply.send({ ok: true, receipt: sanitizeReceipt(r) });
    }

    return reply.send({ ok: true, receipt: null });
  });

  // 🔒 Admin-only: full receipt list (optional; helpful for debugging)
  // GET /receipts/full?limit=5&kind=chat
  app.get("/receipts/full", async (req, reply) => {
    if (!opts.adminTokenOk) {
      return reply.code(501).send({ ok: false, error: "adminTokenOk not wired for /receipts/full" });
    }
    if (!opts.adminTokenOk(req)) {
      return reply.code(401).send({ ok: false, error: "unauthorized" });
    }

    const q: any = (req as any).query ?? {};
    const limit = Math.min(Math.max(safeNum(q.limit, 10), 1), 50);
    const wantKind = typeof q.kind === "string" && q.kind.trim() ? q.kind.trim() : null;

    const dir = receiptsDir();
    const files = await listReceiptFilesSorted(dir);

    const receipts: any[] = [];

    for (const f of files) {
      if (receipts.length >= limit) break;

      const p = path.resolve(dir, f);
      const r = await readReceiptJson(p);
      if (!r) continue;

      const k = getKind(normalizeReceiptForPublic(r));
      if (wantKind && k !== wantKind) continue;

      // FULL endpoint returns raw receipts; we still normalize schema for consistency (optional)
      receipts.push(normalizeReceiptForPublic(r));
    }

    return reply.send({
      ok: true,
      count: files.length,
      receipts,
    });
  });
}