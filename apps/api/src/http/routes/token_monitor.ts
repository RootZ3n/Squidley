import type { FastifyInstance } from "fastify";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { requireAdmin } from "../admin.js";

type TokenStats = {
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  cost: number;
};

type ReceiptLite = {
  receipt_id: string;
  created_at: string;
  kind: string | null;
  tier?: string | null;
  provider?: string | null;
  model?: string | null;
  escalated?: boolean | null;
  escalation_reason?: string | null;
  tokens?: TokenStats;
};

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isoDayUTC(iso: string): string {
  // created_at is ISO; day bucketing in UTC avoids local timezone surprises
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toISOString().slice(0, 10);
}

/**
 * Best-effort extractor that tolerates schema drift.
 * We look in a few common spots; missing values are 0.
 */
function extractTokensAndCost(receipt: any): TokenStats {
  // Common shapes we might see over time:
  // - receipt.usage.{input_tokens,output_tokens,total_tokens,cost}
  // - receipt.meta.{tokens_in,tokens_out,tokens_total,cost}
  // - receipt.provider_response.usage.{prompt_tokens,completion_tokens,total_tokens}
  // - receipt.provider_response.cost
  // - receipt.provider_response.raw.usage ...
  // - receipt.provider_response (ollama may not have usage at all)
  const usage = receipt?.usage ?? receipt?.meta?.usage ?? null;
  const meta = receipt?.meta ?? null;
  const pr = receipt?.provider_response ?? null;
  const prUsage = pr?.usage ?? pr?.raw?.usage ?? pr?.raw?.data?.usage ?? null;

  const tokens_in =
    toNum(usage?.tokens_in) ||
    toNum(usage?.input_tokens) ||
    toNum(meta?.tokens_in) ||
    toNum(prUsage?.prompt_tokens) ||
    toNum(prUsage?.input_tokens) ||
    0;

  const tokens_out =
    toNum(usage?.tokens_out) ||
    toNum(usage?.output_tokens) ||
    toNum(meta?.tokens_out) ||
    toNum(prUsage?.completion_tokens) ||
    toNum(prUsage?.output_tokens) ||
    0;

  const tokens_total =
    toNum(usage?.tokens_total) ||
    toNum(usage?.total_tokens) ||
    toNum(meta?.tokens_total) ||
    toNum(prUsage?.total_tokens) ||
    (tokens_in + tokens_out);

  const cost =
    toNum(receipt?.cost) ||
    toNum(usage?.cost) ||
    toNum(meta?.cost) ||
    toNum(pr?.cost) ||
    toNum(pr?.raw?.cost) ||
    0;

  return { tokens_in, tokens_out, tokens_total, cost };
}

async function listReceiptFiles(receiptsDir: string): Promise<string[]> {
  const files = await readdir(receiptsDir).catch(() => []);
  return files.filter((f) => f.endsWith(".json"));
}

async function readReceipts(receiptsDir: string, limit: number): Promise<any[]> {
  const files = await listReceiptFiles(receiptsDir);
  const parsed: any[] = [];

  // Read newest-first by filename sort is not guaranteed; we’ll sort by created_at after parse
  for (const f of files) {
    try {
      const raw = await readFile(path.resolve(receiptsDir, f), "utf-8");
      parsed.push(JSON.parse(raw));
    } catch {
      // ignore bad files
    }
  }

  parsed.sort((a, b) =>
    String(a?.created_at ?? "") < String(b?.created_at ?? "") ? 1 : -1
  );
  return parsed.slice(0, limit);
}

function addToAgg(agg: TokenStats, inc: TokenStats) {
  agg.tokens_in += inc.tokens_in;
  agg.tokens_out += inc.tokens_out;
  agg.tokens_total += inc.tokens_total;
  agg.cost += inc.cost;
}

export async function registerTokenMonitorRoutes(
  app: FastifyInstance,
  deps: {
    receiptsDir: () => string;
  }
) {
  // Summary
  app.get(
    "/skills/token-monitor/summary",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const url = new URL(req.url, "http://127.0.0.1");
      const limitRaw = url.searchParams.get("limit");
      const limit = Math.max(1, Math.min(2000, Number(limitRaw ?? "200")));

      const receiptsDir = deps.receiptsDir();
      const receipts = await readReceipts(receiptsDir, limit);

      const totals: TokenStats = {
        tokens_in: 0,
        tokens_out: 0,
        tokens_total: 0,
        cost: 0
      };

      const by_provider: Record<string, TokenStats> = {};
      const by_model: Record<string, TokenStats> = {};
      const by_day: Record<string, TokenStats> = {};

      for (const r of receipts) {
        const provider = String(r?.decision?.provider ?? "unknown");
        const model = String(r?.decision?.model ?? "unknown");
        const day = isoDayUTC(String(r?.created_at ?? ""));

        const ts = extractTokensAndCost(r);

        addToAgg(totals, ts);

        by_provider[provider] ??= {
          tokens_in: 0,
          tokens_out: 0,
          tokens_total: 0,
          cost: 0
        };
        addToAgg(by_provider[provider], ts);

        const modelKey = `${provider}::${model}`;
        by_model[modelKey] ??= {
          tokens_in: 0,
          tokens_out: 0,
          tokens_total: 0,
          cost: 0
        };
        addToAgg(by_model[modelKey], ts);

        by_day[day] ??= {
          tokens_in: 0,
          tokens_out: 0,
          tokens_total: 0,
          cost: 0
        };
        addToAgg(by_day[day], ts);
      }

      // Make provider/model tables nicer to consume (sorted arrays)
      const providers = Object.entries(by_provider)
        .map(([provider, stats]) => ({ provider, ...stats }))
        .sort((a, b) => b.cost - a.cost || b.tokens_total - a.tokens_total);

      const models = Object.entries(by_model)
        .map(([key, stats]) => {
          const [provider, model] = key.split("::");
          return { provider, model, ...stats };
        })
        .sort((a, b) => b.cost - a.cost || b.tokens_total - a.tokens_total);

      const days = Object.entries(by_day)
        .map(([day, stats]) => ({ day, ...stats }))
        .sort((a, b) => (a.day < b.day ? 1 : -1)); // newest first

      return reply.send({
        ok: true,
        limit,
        totals,
        providers,
        models,
        days
      });
    }
  );

  // Top receipts
  app.get(
    "/skills/token-monitor/top",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const url = new URL(req.url, "http://127.0.0.1");
      const limitRaw = url.searchParams.get("limit");
      const limit = Math.max(1, Math.min(200, Number(limitRaw ?? "20")));

      // we may need more than limit to rank if many receipts have 0 cost/tokens
      const scan = Math.max(limit, 50);

      const receiptsDir = deps.receiptsDir();
      const receipts = await readReceipts(receiptsDir, scan);

      const lite: ReceiptLite[] = receipts.map((r: any) => {
        const ts = extractTokensAndCost(r);
        return {
          receipt_id: String(r?.receipt_id ?? ""),
          created_at: String(r?.created_at ?? ""),
          kind: r?.request?.kind ?? null,
          tier: r?.decision?.tier ?? null,
          provider: r?.decision?.provider ?? null,
          model: r?.decision?.model ?? null,
          escalated: r?.decision?.escalated ?? null,
          escalation_reason: r?.decision?.escalation_reason ?? null,
          tokens: ts
        };
      });

      // Rank by cost first; fallback to tokens_total
      lite.sort((a, b) => {
        const ac = a.tokens?.cost ?? 0;
        const bc = b.tokens?.cost ?? 0;
        if (bc !== ac) return bc - ac;
        const at = a.tokens?.tokens_total ?? 0;
        const bt = b.tokens?.tokens_total ?? 0;
        return bt - at;
      });

      return reply.send({
        ok: true,
        limit,
        receipts: lite.slice(0, limit)
      });
    }
  );
}