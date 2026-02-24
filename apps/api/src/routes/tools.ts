// apps/api/src/routes/tools.ts
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

type ToolDef = { id: string; title: string };

const TOOLS: ToolDef[] = [
  { id: "diag.sleep", title: "diagnostics: sleep (no shell)" },
  { id: "git.diff", title: "git diff" },
  { id: "git.log", title: "git log (last 20)" },
  { id: "git.status", title: "git status" },
  { id: "rg.search", title: "ripgrep search" },
  { id: "web.search", title: "web search (SearXNG JSON)" },
  { id: "web.build", title: "pnpm web build" },
  { id: "web.pw", title: "Playwright tests (apps/web)" }
];

type ToolsRunBody = {
  workspace?: string;
  tool_id?: string;
  args?: Record<string, any>;
  // compat top-level fields
  paths?: string[];
  query?: string;
  q?: string;
  limit?: number;
  [k: string]: any;
};

function isObject(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function clampInt(v: unknown, dflt: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function bool(v: unknown, dflt = false): boolean {
  if (typeof v === "boolean") return v;
  const s = str(v).toLowerCase();
  if (!s) return dflt;
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return dflt;
}

function newReceiptId(): string {
  // short-ish, URL-safe
  return crypto.randomBytes(9).toString("base64url");
}

function adminTokenOk(req: any): boolean {
  const expected = str(process.env.ZENSQUID_ADMIN_TOKEN);
  if (expected.length < 12) return false;

  const got = str(req.headers?.["x-zensquid-admin-token"]);
  if (got.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

function mergeArgs(body: ToolsRunBody): Record<string, any> {
  const tool_id = str(body.tool_id);

  const args = isObject(body.args) ? { ...body.args } : {};

  // Merge common compat top-level keys into args if not present already
  const top = { ...body };
  delete top.workspace;
  delete top.tool_id;
  delete top.args;

  for (const [k, v] of Object.entries(top)) {
    if (typeof v !== "undefined" && typeof args[k] === "undefined") args[k] = v;
  }

  // Normalize paths for repo-ish tools
  const needsPaths = tool_id.startsWith("git.") || tool_id === "rg.search";
  if (needsPaths) {
    const okArray =
      Array.isArray(args.paths) &&
      args.paths.length > 0 &&
      args.paths.every((p: any) => typeof p === "string" && p.trim().length > 0);

    if (!okArray) args.paths = ["."];
  }

  return args;
}

async function runCmd(opts: {
  cwd: string;
  cmd: string;
  argv: string[];
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<{ code: number; stdout: string; stderr: string; timed_out: boolean; ms: number }> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000; // 10 min default
  const maxBytes = opts.maxBytes ?? 2_000_000; // 2MB cap

  const t0 = Date.now();

  return await new Promise((resolve, reject) => {
    const child = spawn(opts.cmd, opts.argv, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    let stdout: Buffer = Buffer.alloc(0);
    let stderr: Buffer = Buffer.alloc(0);
    let timed_out = false;

    const append = (buf: Buffer, chunk: Buffer): Buffer => {
      if (buf.length >= maxBytes) return buf;

      const next = Buffer.concat([buf, chunk]);
      if (next.length > maxBytes) return next.subarray(0, maxBytes);
      return next;
    };

    const killTimer = setTimeout(() => {
      timed_out = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      const chunk = Buffer.isBuffer(d) ? d : Buffer.from(d);
      stdout = append(stdout, chunk);
    });

    child.stderr.on("data", (d) => {
      const chunk = Buffer.isBuffer(d) ? d : Buffer.from(d);
      stderr = append(stderr, chunk);
    });

    child.on("error", (e) => {
      clearTimeout(killTimer);
      reject(e);
    });

    child.on("close", (code) => {
      clearTimeout(killTimer);
      resolve({
        code: typeof code === "number" ? code : 1,
        stdout: stdout.toString("utf-8"),
        stderr: stderr.toString("utf-8"),
        timed_out,
        ms: Date.now() - t0
      });
    });
  });
}

function safeWorkspace(w: string): string {
  // Keep it simple: require absolute path to avoid weirdness
  const ws = str(w);
  if (!ws.startsWith("/")) throw new Error("workspace must be an absolute path");
  return ws;
}

function safeHttpUrl(u: string): string {
  const s = str(u);
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    throw new Error("invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must be http(s)");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function trimSnippet(s: string, max = 280): string {
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1) + "…";
}

/**
 * SearXNG search (local)
 * Env override: ZENSQUID_SEARXNG_URL (default http://127.0.0.1:8080)
 */
async function searxngSearch(opts: {
  baseUrl: string;
  query: string;
  limit: number;
  lang?: string;
  safeSearch?: number; // 0..2 (SearXNG)
  timeoutMs?: number;
  raw?: boolean;
}): Promise<{
  query: string;
  limit: number;
  searxng_url: string;
  results: Array<
    | {
        title: string;
        url: string;
        snippet: string;
      }
    | {
        title: string;
        url: string;
        content: string;
        engine?: string | null;
        score?: number | null;
      }
  >;
}> {
  const base = safeHttpUrl(opts.baseUrl);
  const q = opts.query.trim();

  if (!q) return { query: "", limit: 0, searxng_url: base, results: [] };
  if (q.length > 300) throw new Error("query too long (max 300 chars)");

  const limit = clampInt(opts.limit, 5, 1, 10);
  const lang = str(opts.lang || "en-US") || "en-US";
  const safeSearch = clampInt(opts.safeSearch, 1, 0, 2); // default moderate-ish
  const timeoutMs = clampInt(opts.timeoutMs, 8_000, 1_000, 20_000);
  const raw = !!opts.raw;

  const u = new URL(base + "/search");
  u.searchParams.set("q", q);
  u.searchParams.set("format", "json");
  u.searchParams.set("language", lang);
  u.searchParams.set("safesearch", String(safeSearch));
  u.searchParams.set("pageno", "1");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // IMPORTANT: SearXNG bot detection sometimes dislikes "undici" UA and missing IP headers.
    const res = await fetch(u.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "accept-language": lang,
        "user-agent": "zensquid/0.0.1 (local; web.search)",
        // These two headers silence: "X-Forwarded-For nor X-Real-IP header is set!"
        "x-forwarded-for": "127.0.0.1",
        "x-real-ip": "127.0.0.1"
      },
      signal: controller.signal
    });

    if (!res.ok) {
      // keep it concise but debuggable
      throw new Error(`searxng HTTP ${res.status}`);
    }

    const data: any = await res.json().catch(() => null);
    const results = Array.isArray(data?.results) ? data.results : [];

    const mapped = results
      .map((r: any) => {
        const title = str(r?.title).slice(0, 200);
        const url = str(r?.url).slice(0, 2000);

        if (!title || !url) return null;
        if (!/^https?:\/\//i.test(url)) return null;

        const content = str(r?.content ?? r?.snippet ?? "").slice(0, 1200);
        const engine = r?.engine ? str(r.engine).slice(0, 64) : null;
        const score = typeof r?.score === "number" ? r.score : null;

        if (raw) {
          return { title, url, content, engine, score };
        }

        return { title, url, snippet: trimSnippet(content, 280) };
      })
      .filter(Boolean)
      .slice(0, limit) as any[];

    return {
      query: q,
      limit,
      searxng_url: base,
      results: mapped
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function toolsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tools/list", async () => {
    return { ok: true, tools: TOOLS };
  });

  app.post<{ Body: ToolsRunBody }>("/tools/run", async (req, reply) => {
    if (!adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "unauthorized" });

    const receipt_id = newReceiptId();

    const body = (req.body ?? {}) as ToolsRunBody;
    const workspaceRaw = body.workspace;
    const tool_id = str(body.tool_id);

    if (!workspaceRaw || !tool_id) {
      return reply.code(400).send({
        ok: false,
        error: "workspace and tool_id are required",
        receipt_id
      });
    }

    const workspace = safeWorkspace(String(workspaceRaw));
    const args = mergeArgs(body);

    const allowed = TOOLS.some((t) => t.id === tool_id);
    if (!allowed) {
      return reply.code(403).send({
        ok: false,
        error: `tool not allowlisted: ${tool_id}`,
        receipt_id
      });
    }

    const metaBase = {
      toolrun: {
        tool_id,
        // NOTE: do NOT include full args here (can leak queries/paths into receipts).
        // Keep it to safe, bounded telemetry only.
        ms: null as number | null
      }
    };

    try {
      // ---- no-shell tools first ----
      if (tool_id === "diag.sleep") {
        const ms = clampInt(args.ms, 500, 0, 60_000);
        await new Promise((r) => setTimeout(r, ms));
        metaBase.toolrun.ms = ms;
        return reply.send({
          ok: true,
          tool_id,
          receipt_id,
          meta: metaBase,
          output: `slept ${ms}ms`
        });
      }

      if (tool_id === "web.search") {
        const q = str(args.query ?? args.q);
        const limit = clampInt(args.limit, 5, 1, 10);
        const lang = str(args.lang || "en-US") || "en-US";
        const safeSearch = clampInt(args.safeSearch, 1, 0, 2);
        const timeoutMs = clampInt(args.timeoutMs, 8_000, 1_000, 20_000);
        const raw = bool(args.raw, false);

        const baseUrl = safeHttpUrl(process.env.ZENSQUID_SEARXNG_URL || "http://127.0.0.1:8080");

        const out = await searxngSearch({
          baseUrl,
          query: q,
          limit,
          lang,
          safeSearch,
          timeoutMs,
          raw
        });

        // meta: just timings (if you want later, you can include `results_count`)
        metaBase.toolrun.ms = null;

        return reply.send({
          ok: true,
          tool_id,
          receipt_id,
          meta: metaBase,
          output: out
        });
      }

      // ---- allowlisted command tools (still no direct shell; fixed argv) ----
      let cmd = "";
      let argv: string[] = [];
      let timeoutMs: number | undefined;

      if (tool_id.startsWith("git.")) {
        cmd = "git";
        const paths = Array.isArray(args.paths) ? (args.paths as string[]) : ["."];
        const cleanPaths = paths.map((p) => String(p));

        if (tool_id === "git.status") {
          argv = ["status", "--porcelain=v1", "--", ...cleanPaths];
        } else if (tool_id === "git.diff") {
          argv = ["diff", "--", ...cleanPaths];
        } else if (tool_id === "git.log") {
          argv = ["log", "-n", "20", "--oneline", "--decorate"];
        } else {
          return reply.code(400).send({ ok: false, error: "unknown git tool", receipt_id });
        }
      } else if (tool_id === "rg.search") {
        cmd = "rg";
        const q = str(args.query ?? args.q);
        if (!q) {
          return reply.code(400).send({ ok: false, error: "rg.search requires args.query", receipt_id });
        }

        const paths = Array.isArray(args.paths) ? (args.paths as string[]) : ["."];
        const cleanPaths = paths.map((p) => String(p));

        argv = ["-n", "--hidden", "--no-heading", q, ...cleanPaths];
      } else if (tool_id === "web.build") {
        cmd = "pnpm";
        argv = ["-C", "apps/web", "build"];
        timeoutMs = 20 * 60_000;
      } else if (tool_id === "web.pw") {
        cmd = "pnpm";
        argv = ["-C", "apps/web", "pw"];
        timeoutMs = 30 * 60_000;
      } else {
        return reply.code(400).send({ ok: false, error: "unknown tool_id", receipt_id });
      }

      const out = await runCmd({
        cwd: workspace,
        cmd,
        argv,
        timeoutMs
      });

      metaBase.toolrun.ms = out.ms;

      const ok = out.code === 0;
      return reply.code(ok ? 200 : 500).send({
        ok,
        tool_id,
        receipt_id,
        meta: metaBase,
        exit_code: out.code,
        timed_out: out.timed_out,
        output: out.stdout,
        stderr: out.stderr
      });
    } catch (e: any) {
      return reply.code(500).send({
        ok: false,
        tool_id,
        receipt_id,
        meta: metaBase,
        error: String(e?.message ?? e)
      });
    }
  });
}