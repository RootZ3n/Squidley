// apps/api/src/tools/runner.ts
//
// Single hardened tool runner for all allowlisted tools.
// All subprocess spawns use shell: false.
// All tool executions write a receipt.
// Admin-gated tools check the token before running.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TOOL_ALLOWLIST, getSearxngBaseUrl } from "./allowlist.js";
import { getWorkspaceRoot, type WorkspaceName } from "./workspaces.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RunToolRequest = {
  workspace: WorkspaceName;
  tool_id: string;
  args?: Record<string, unknown> | string[];
  // Admin token — required for requiresAdmin tools
  admin_token?: string;
};

export type RunToolResult = {
  receipt_id: string;
  ok: boolean;
  tool_id: string;
  workspace: WorkspaceName;
  cwd: string;
  command: { cmd: string; args: string[] };
  started_at: string;
  finished_at: string;
  duration_ms: number;
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  truncated: { stdout: boolean; stderr: boolean };
};

type ToolRunnerErrorCode = "BAD_REQUEST" | "FORBIDDEN" | "INTERNAL";

class ToolRunnerError extends Error {
  code: ToolRunnerErrorCode;
  receipt_id?: string;

  constructor(code: ToolRunnerErrorCode, message: string, receipt_id?: string) {
    super(message);
    this.code = code;
    if (receipt_id) this.receipt_id = receipt_id;
  }
}

// ── State dir + receipts ──────────────────────────────────────────────────────

function stateDir(): string {
  return process.env.SQUIDLEY_STATE_DIR || path.join(os.homedir(), ".squidley");
}

async function writeReceipt(payload: RunToolResult) {
  const dir = path.join(stateDir(), "receipts");
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, `${payload.receipt_id}.json`);
  await fs.writeFile(fp, JSON.stringify(payload, null, 2), "utf8");
}

// ── Output clamping ───────────────────────────────────────────────────────────

function clampOutput(buf: Buffer, maxBytes: number) {
  if (buf.byteLength <= maxBytes) return { text: buf.toString("utf8"), truncated: false };
  const sliced = buf.subarray(0, maxBytes);
  return { text: sliced.toString("utf8") + "\n…(truncated)…\n", truncated: true };
}

// ── Admin token check ─────────────────────────────────────────────────────────

function checkAdminToken(provided: string | undefined): boolean {
  const expected = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();
  if (expected.length < 12) return false;
  const got = String(provided ?? "").trim();
  if (got.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Arg normalization ─────────────────────────────────────────────────────────

function normalizeUserArgs(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (raw && typeof raw === "object") return [];
  return [];
}

function getArg(args: RunToolRequest["args"], key: string, fallback = ""): string {
  if (!args || Array.isArray(args)) return fallback;
  return String((args as Record<string, unknown>)[key] ?? fallback).trim();
}

function getArgNumber(args: RunToolRequest["args"], key: string, fallback: number): number {
  if (!args || Array.isArray(args)) return fallback;
  const v = Number((args as Record<string, unknown>)[key] ?? fallback);
  return Number.isFinite(v) ? v : fallback;
}

// ── Path safety ───────────────────────────────────────────────────────────────

function normalizeRelPath(rel: string): string {
  const s = String(rel ?? "").replace(/\\/g, "/").trim();
  if (!s) return "";
  if (s.startsWith("/")) return "";
  if (s.includes("..")) return "";
  return s;
}

// ── Internal JS tool handlers ─────────────────────────────────────────────────

async function handleJsTool(
  tool_id: string,
  args: RunToolRequest["args"],
  repoRoot: string,
  maxOutputBytes: number,
  timeoutMs: number
): Promise<{ ok: boolean; stdout: string; stderr: string }> {

  // ── diag.sleep ──────────────────────────────────────────────────────────────
  if (tool_id === "diag.sleep") {
    const ms = Math.min(60_000, Math.max(0, getArgNumber(args, "ms", 250)));
    await new Promise((r) => setTimeout(r, ms));
    return { ok: true, stdout: `slept ${ms}ms\n`, stderr: "" };
  }

  // ── web.search ──────────────────────────────────────────────────────────────
  if (tool_id === "web.search") {
    const query = getArg(args, "query") || getArg(args, "q");
    if (!query) return { ok: false, stdout: "", stderr: "missing_query" };

    const base = getSearxngBaseUrl();
    const u = new URL(base);
    u.pathname = "/search";
    u.searchParams.set("q", query);
    u.searchParams.set("format", "json");

    const categories = getArg(args, "categories");
    const language = getArg(args, "language");
    if (categories) u.searchParams.set("categories", categories);
    if (language) u.searchParams.set("language", language);

    try {
      const res = await fetch(u.toString(), {
        headers: { accept: "application/json", "user-agent": "zensquid/runner (web.search)" },
        signal: AbortSignal.timeout(timeoutMs - 1000),
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, stdout: "", stderr: `HTTP ${res.status}: ${text.slice(0, 400)}` };

      const json = JSON.parse(text);
      const results = Array.isArray(json?.results) ? json.results : [];
      // Return human-readable summary, not raw JSON
      const lines = results.slice(0, 10).map((r: any, i: number) =>
        `${i + 1}. ${r.title ?? "?"}\n   ${r.url ?? ""}\n   ${String(r.content ?? "").slice(0, 120)}`
      );
      const out = lines.length > 0
        ? `Found ${results.length} results for "${query}":\n\n${lines.join("\n\n")}\n`
        : `No results found for "${query}"\n`;
      return { ok: true, stdout: out, stderr: "" };
    } catch (e: any) {
      return { ok: false, stdout: "", stderr: String(e?.message ?? "fetch failed") };
    }
  }

  // ── fs.read ─────────────────────────────────────────────────────────────────
  if (tool_id === "fs.read") {
    const rel = normalizeRelPath(getArg(args, "path") || getArg(args, "rel"));
    if (!rel) return { ok: false, stdout: "", stderr: "invalid_path" };
    const abs = path.resolve(repoRoot, rel);
    try {
      const st = await fs.stat(abs);
      if (!st.isFile()) return { ok: false, stdout: "", stderr: "not_a_file" };
      const raw = await fs.readFile(abs, "utf-8");
      const clamped = clampOutput(Buffer.from(raw, "utf-8"), maxOutputBytes);
      return { ok: true, stdout: clamped.text, stderr: "" };
    } catch (e: any) {
      return { ok: false, stdout: "", stderr: String(e?.message ?? "read failed") };
    }
  }

  // ── fs.write ────────────────────────────────────────────────────────────────
  if (tool_id === "fs.write") {
    const rel = normalizeRelPath(getArg(args, "path") || getArg(args, "rel"));
    const text = getArg(args, "text") || getArg(args, "content");
    if (!rel) return { ok: false, stdout: "", stderr: "invalid_path" };
    const abs = path.resolve(repoRoot, rel);
    // Safety: must be inside repo root
    if (!abs.startsWith(repoRoot + path.sep) && abs !== repoRoot) {
      return { ok: false, stdout: "", stderr: "path_outside_root" };
    }
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, text, "utf-8");
      return { ok: true, stdout: `wrote ${Buffer.byteLength(text, "utf-8")} bytes to ${rel}\n`, stderr: "" };
    } catch (e: any) {
      return { ok: false, stdout: "", stderr: String(e?.message ?? "write failed") };
    }
  }

  // ── proc.exec ───────────────────────────────────────────────────────────────
  if (tool_id === "proc.exec") {
    const cmd = getArg(args, "cmd");
    const rawArgv = (args && !Array.isArray(args)) ? (args as any).argv : [];
    const argv = Array.isArray(rawArgv) ? rawArgv.map(String) : [];
    if (!cmd) return { ok: false, stdout: "", stderr: "missing_cmd" };

    return new Promise((resolve) => {
      const child = spawn(cmd, argv, {
        cwd: repoRoot,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString("utf-8")));
      child.stderr.on("data", (d) => (stderr += d.toString("utf-8")));

      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ ok: code === 0, stdout, stderr });
      });
    });
  }

  // ── systemctl.user ──────────────────────────────────────────────────────────
  if (tool_id === "systemctl.user") {
    const action = getArg(args, "action");
    const unit = getArg(args, "unit");
    const allowed = new Set(["status", "restart", "stop", "start"]);
    if (!allowed.has(action)) return { ok: false, stdout: "", stderr: `invalid_action: ${action}` };
    if (!unit) return { ok: false, stdout: "", stderr: "missing_unit" };

    return new Promise((resolve) => {
      const child = spawn("systemctl", ["--user", action, unit], {
        cwd: repoRoot,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString("utf-8")));
      child.stderr.on("data", (d) => (stderr += d.toString("utf-8")));

      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ ok: code === 0, stdout, stderr });
      });
    });
  }

  return { ok: false, stdout: "", stderr: `js_handler_not_implemented: ${tool_id}` };
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runTool(req: RunToolRequest): Promise<RunToolResult> {
  const spec = TOOL_ALLOWLIST[req.tool_id];
  if (!spec) {
    throw new ToolRunnerError("FORBIDDEN", `Tool not in allowlist: ${req.tool_id}`);
  }

  // Admin gate
  if (spec.requiresAdmin && !checkAdminToken(req.admin_token)) {
    throw new ToolRunnerError("FORBIDDEN", `Tool requires admin token: ${req.tool_id}`);
  }

  const workspaceRoot = getWorkspaceRoot(req.workspace);
  const repoRoot = spec.cwd ?? workspaceRoot;

  // Shell operator filter for array-style args
  const userArgs = normalizeUserArgs(req.args);
  for (const a of userArgs) {
    if (/[;&|`$<>]/.test(a)) {
      throw new ToolRunnerError("BAD_REQUEST", `Disallowed characters in args: "${a}"`);
    }
  }

  const receipt_id = crypto.randomUUID();
  const started = Date.now();
  const started_at = new Date(started).toISOString();

  const failWithReceipt = async (code: ToolRunnerErrorCode, message: string) => {
    const finished = Date.now();
    const result: RunToolResult = {
      receipt_id,
      ok: false,
      tool_id: req.tool_id,
      workspace: req.workspace,
      cwd: repoRoot,
      command: { cmd: spec.cmd, args: [...spec.argsPrefix, ...userArgs] },
      started_at,
      finished_at: new Date(finished).toISOString(),
      duration_ms: finished - started,
      exit_code: null,
      signal: null,
      stdout: "",
      stderr: message,
      truncated: { stdout: false, stderr: false },
    };
    await writeReceipt(result);
    throw new ToolRunnerError(code, message, receipt_id);
  };

  // ── JS internal tool path ────────────────────────────────────────────────────
  if (spec.cmd === "__js__") {
    try {
      const r = await Promise.race([
        handleJsTool(req.tool_id, req.args, repoRoot, spec.maxOutputBytes, spec.timeoutMs),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new ToolRunnerError("BAD_REQUEST", `Tool timed out after ${spec.timeoutMs}ms`)), spec.timeoutMs)
        ),
      ]);

      const finished = Date.now();
      const outClamped = clampOutput(Buffer.from(r.stdout ?? "", "utf-8"), spec.maxOutputBytes);
      const errClamped = clampOutput(Buffer.from(r.stderr ?? "", "utf-8"), spec.maxOutputBytes);

      const result: RunToolResult = {
        receipt_id,
        ok: r.ok,
        tool_id: req.tool_id,
        workspace: req.workspace,
        cwd: repoRoot,
        command: { cmd: spec.cmd, args: [] },
        started_at,
        finished_at: new Date(finished).toISOString(),
        duration_ms: finished - started,
        exit_code: r.ok ? 0 : 1,
        signal: null,
        stdout: outClamped.text,
        stderr: errClamped.text,
        truncated: { stdout: outClamped.truncated, stderr: errClamped.truncated },
      };

      await writeReceipt(result);

      if (!r.ok) {
        throw new ToolRunnerError("INTERNAL", r.stderr || "Internal tool failed", receipt_id);
      }

      return result;
    } catch (e: any) {
      if (e instanceof ToolRunnerError) throw e;
      return await failWithReceipt("INTERNAL", String(e?.message ?? e ?? "JS tool failed"));
    }
  }

  // ── Subprocess tool path ──────────────────────────────────────────────────────
  const fullArgs = [...spec.argsPrefix, ...userArgs];
  const env = { ...process.env, ...(spec.env ?? {}) };

  let stdoutChunks: Buffer[] = [];
  let stderrChunks: Buffer[] = [];

  const child = spawn(spec.cmd, fullArgs, {
    cwd: repoRoot,
    shell: false,
    env,
  });

  let killedByTimeout = false;
  const timer = setTimeout(() => {
    killedByTimeout = true;
    child.kill("SIGKILL");
  }, spec.timeoutMs);

  child.stdout.on("data", (d) => stdoutChunks.push(Buffer.from(d)));
  child.stderr.on("data", (d) => stderrChunks.push(Buffer.from(d)));

  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal: signal as any }));
  });

  clearTimeout(timer);

  const finished = Date.now();
  const out = clampOutput(Buffer.concat(stdoutChunks), spec.maxOutputBytes);
  const err = clampOutput(Buffer.concat(stderrChunks), spec.maxOutputBytes);
  const ok = !killedByTimeout && exit.code === 0;

  const result: RunToolResult = {
    receipt_id,
    ok,
    tool_id: req.tool_id,
    workspace: req.workspace,
    cwd: repoRoot,
    command: { cmd: spec.cmd, args: fullArgs },
    started_at,
    finished_at: new Date(finished).toISOString(),
    duration_ms: finished - started,
    exit_code: exit.code,
    signal: exit.signal,
    stdout: out.text,
    stderr: err.text,
    truncated: { stdout: out.truncated, stderr: err.truncated },
  };

  await writeReceipt(result);

  if (killedByTimeout) {
    throw new ToolRunnerError("BAD_REQUEST", `Tool timed out after ${spec.timeoutMs}ms`, receipt_id);
  }

  return result;
}
