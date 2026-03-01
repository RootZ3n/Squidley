// apps/api/src/tools/runner.ts
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import * as fsNode from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TOOL_ALLOWLIST } from "./allowlist.js";
import { getWorkspaceRoot, type WorkspaceName } from "./workspaces.js";

export type RunToolRequest = {
  workspace: WorkspaceName;
  tool_id: string;
  // user args — string[] for subprocess tools, Record for internal JS tools
  args?: string[] | Record<string, string | string[]>;
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
  // optional: surfaced to HTTP layer so UI can link to receipt
  receipt_id?: string;

  constructor(code: ToolRunnerErrorCode, message: string, receipt_id?: string) {
    super(message);
    this.code = code;
    if (receipt_id) this.receipt_id = receipt_id;
  }
}

function stateDir(): string {
  // keep this stable across machines
  return process.env.SQUIDLEY_STATE_DIR || path.join(os.homedir(), ".squidley");
}

async function writeReceipt(payload: RunToolResult) {
  const dir = path.join(stateDir(), "receipts");
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, `${payload.receipt_id}.json`);
  await fs.writeFile(fp, JSON.stringify(payload, null, 2), "utf8");
}

function clampOutput(buf: Buffer, maxBytes: number) {
  if (buf.byteLength <= maxBytes) return { text: buf.toString("utf8"), truncated: false };
  const sliced = buf.subarray(0, maxBytes);
  return { text: sliced.toString("utf8") + "\n…(truncated)…\n", truncated: true };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSleepMs(args: string[], defaultMs = 250, maxMs = 60_000): number {
  const raw = args?.[0];
  const n = Number.parseInt(String(raw ?? ""), 10);
  const ms = Number.isFinite(n) ? n : defaultMs;
  if (ms < 0) return 0;
  return Math.min(ms, maxMs);
}

/**
 * Internal tools (no shell, no subprocess).
 * Contract: spec.cmd === "__js__"
 */
async function runInternalTool(opts: {
  tool_id: string;
  specTimeoutMs: number;
  maxOutputBytes: number;
  userArgs: string[];
  rawArgs?: string[] | Record<string, string | string[]>;
}): Promise<{
  ok: boolean;
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  truncated: { stdout: boolean; stderr: boolean };
}> {
  // Timeout wrapper
  const timerPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new ToolRunnerError("BAD_REQUEST", `Tool timed out after ${opts.specTimeoutMs}ms`));
    }, opts.specTimeoutMs);
  });

  const workPromise = (async () => {
    if (opts.tool_id === "diag.sleep") {
      const ms = parseSleepMs(opts.userArgs, 250, 60_000);
      await sleep(ms);
      return {
        ok: true,
        exit_code: 0,
        signal: null as NodeJS.Signals | null,
        stdout: `slept ${ms}ms\n`,
        stderr: "",
        truncated: { stdout: false, stderr: false }
      };
    }

    if (opts.tool_id === "fs.read") {
      // userArgs: [relPath] or rawArgs: { path: "..." }
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const relPath = (rawArgsObj?.path as string ?? opts.userArgs[0] ?? "").trim();
      if (!relPath || relPath.includes("..") || path.isAbsolute(relPath)) {
        throw new ToolRunnerError("BAD_REQUEST", "fs.read: invalid path");
      }
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const abs = path.resolve(repoRoot, relPath);
      // Safety: must stay inside repo root
      if (!abs.startsWith(repoRoot + path.sep) && abs !== repoRoot) {
        throw new ToolRunnerError("FORBIDDEN", "fs.read: path escapes repo root");
      }
      const raw = await fsNode.readFile(abs, "utf8");
      return {
        ok: true,
        exit_code: 0,
        signal: null as NodeJS.Signals | null,
        stdout: raw,
        stderr: "",
        truncated: { stdout: false, stderr: false }
      };
    }

    if (opts.tool_id === "web.search") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const query = (rawArgsObj?.query as string ?? opts.userArgs[0] ?? "").trim();
      if (!query) throw new ToolRunnerError("BAD_REQUEST", "web.search: query required");
      const searxUrl = process.env.SEARXNG_URL ?? "http://127.0.0.1:8080";
      const url = `${searxUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!resp.ok) throw new ToolRunnerError("INTERNAL", `SearXNG returned ${resp.status}`);
      const data = await resp.json() as any;
      const results = (data.results ?? []).slice(0, 8);
      const lines: string[] = [`Search: ${query}`, ""];
      for (const r of results) {
        lines.push(`## ${r.title ?? "Untitled"}`);
        lines.push(`URL: ${r.url ?? ""}`);
        if (r.content) lines.push(r.content.slice(0, 200));
        lines.push("");
      }
      return {
        ok: true,
        exit_code: 0,
        signal: null as NodeJS.Signals | null,
        stdout: lines.join("\n"),
        stderr: "",
        truncated: { stdout: false, stderr: false }
      };
    }

    if (opts.tool_id === "job.detect-form" || opts.tool_id === "job.fill-form") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const { detectApplicationForm, fillApplicationForm } = await import("./jobApply.js");

      if (opts.tool_id === "job.detect-form") {
        const url = (rawArgsObj?.url as string ?? opts.userArgs[0] ?? "").trim();
        if (!url) throw new ToolRunnerError("BAD_REQUEST", "job.detect-form: url required");
        const result = await detectApplicationForm(url);
        const lines = [
          `# Application Form: ${url}`,
          `Platform: ${result.platform}`,
          `Fields found: ${result.fields.length}`,
          "",
          "## Fields",
          ...result.fields.map((f: any) => `- [${f.required ? "required" : "optional"}] ${f.label} (${f.type}) → ${f.selector}`),
          result.screenshot_path ? `\nScreenshot: ${result.screenshot_path}` : "",
        ];
        return { ok: true, exit_code: 0, signal: null as any, stdout: lines.join("\n"), stderr: "", truncated: { stdout: false, stderr: false } };
      }

      if (opts.tool_id === "job.fill-form") {
        const planJson = rawArgsObj?.plan as string ?? "{}";
        const dryRun = rawArgsObj?.dry_run !== "false";
        const plan = JSON.parse(planJson);
        const result = await fillApplicationForm(plan, dryRun);
        const lines = [
          dryRun ? "# DRY RUN — no fields were filled" : "# Form Fill Complete",
          `Filled: ${result.filled} fields`,
          `Skipped: ${result.skipped.length} fields`,
          ...result.skipped.map((s: string) => `- Skipped: ${s}`),
          result.screenshot_path ? `Screenshot: ${result.screenshot_path}` : "",
          "\n⚠️ Browser left open — review and submit manually.",
        ];
        return { ok: result.ok, exit_code: result.ok ? 0 : 1, signal: null as any, stdout: lines.join("\n"), stderr: "", truncated: { stdout: false, stderr: false } };
      }
    }

    if (opts.tool_id === "fs.survey" || opts.tool_id === "fs.organize") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const { surveyDirectory, buildOrganizerPlan, executeMoves } = await import("./fileOrganizer.js");
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();

      if (opts.tool_id === "fs.survey") {
        const targetDir = (rawArgsObj?.dir as string ?? rawArgsObj?.path as string ?? opts.userArgs[0] ?? process.env.HOME ?? "/home").trim();
        const entries = await surveyDirectory(targetDir, 300);
        const plan = await buildOrganizerPlan(entries, targetDir);
        const lines = [
          `# File Survey: ${targetDir}`,
          `${plan.summary}`,
          "",
          "## Proposed Auto-Moves",
          ...plan.moves.slice(0, 30).map(m => `- ${m.from} → ${m.to} (${m.reason})`),
          plan.moves.length > 30 ? `... and ${plan.moves.length - 30} more` : "",
          "",
          "## Needs Review",
          ...plan.needsReview.slice(0, 20).map(r => `- ${r.path} — ${r.reason}`),
          "",
          "## Duplicates",
          ...plan.duplicates.slice(0, 10).map(d => `- ${d.files.join(" == ")}`),
        ];
        return {
          ok: true, exit_code: 0, signal: null as any,
          stdout: lines.filter(l => l !== undefined).join("\n"),
          stderr: "", truncated: { stdout: false, stderr: false }
        };
      }

      if (opts.tool_id === "fs.organize") {
        const movesJson = rawArgsObj?.moves as string ?? "[]";
        const dryRun = rawArgsObj?.dry_run !== "false";
        const moves = JSON.parse(movesJson);
        const result = await executeMoves(moves, dryRun);
        return {
          ok: result.ok, exit_code: result.ok ? 0 : 1, signal: null as any,
          stdout: `${dryRun ? "[DRY RUN] " : ""}Moved ${result.moved} files. Errors: ${result.errors.length}\n${result.errors.join("\n")}`,
          stderr: "", truncated: { stdout: false, stderr: false }
        };
      }
    }

    if (opts.tool_id.startsWith("browser.")) {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const action = opts.tool_id.replace("browser.", "") as any;
      const url = (rawArgsObj?.url as string ?? opts.userArgs[0] ?? "").trim();
      const query = (rawArgsObj?.query as string ?? opts.userArgs[0] ?? "").trim();
      const selector = (rawArgsObj?.selector as string ?? "").trim() || undefined;
      const wait_for = (rawArgsObj?.wait_for as string ?? "").trim() || undefined;
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const { runBrowserTool } = await import("./browser.js");
      const result = await runBrowserTool({ action, url: url || undefined, query: query || undefined, selector, wait_for }, repoRoot);
      if (!result.ok) throw new ToolRunnerError("INTERNAL", result.error ?? "browser tool failed");
      const lines: string[] = [];
      if (result.title) lines.push(`# ${result.title}`);
      if (result.text) lines.push(result.text);
      if (result.links?.length) {
        lines.push("\n## Links");
        result.links.forEach(l => lines.push(`- [${l.text}](${l.href})`));
      }
      if (result.screenshot_path) lines.push(`Screenshot saved: ${result.screenshot_path}`);
      return {
        ok: true,
        exit_code: 0,
        signal: null as NodeJS.Signals | null,
        stdout: lines.join("\n"),
        stderr: "",
        truncated: { stdout: false, stderr: false }
      };
    }

    if (opts.tool_id === "fs.write") {
      // userArgs: [relPath, content] or rawArgs: { path: "...", content: "..." }
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const relPath = (rawArgsObj?.path as string ?? opts.userArgs[0] ?? "").trim();
      if (!relPath || relPath.includes("..") || path.isAbsolute(relPath)) {
        throw new ToolRunnerError("BAD_REQUEST", "fs.write: invalid path");
      }
      // Only allow writing to skills/ and memory/ directories for safety
      const allowedPrefixes = ["skills/", "memory/"];
      const isAllowed = allowedPrefixes.some((p) => relPath.startsWith(p));
      if (!isAllowed) {
        throw new ToolRunnerError("FORBIDDEN", `fs.write: path must be under skills/ or memory/ (got: ${relPath})`);
      }
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const abs = path.resolve(repoRoot, relPath);
      if (!abs.startsWith(repoRoot + path.sep) && abs !== repoRoot) {
        throw new ToolRunnerError("FORBIDDEN", "fs.write: path escapes repo root");
      }
      const content = (rawArgsObj?.content as string ?? opts.userArgs.slice(1).join("\n"));
      await fsNode.mkdir(path.dirname(abs), { recursive: true });
      await fsNode.writeFile(abs, content, "utf8");
      return {
        ok: true,
        exit_code: 0,
        signal: null as NodeJS.Signals | null,
        stdout: `wrote ${content.length} bytes to ${relPath}\n`,
        stderr: "",
        truncated: { stdout: false, stderr: false }
      };
    }
  })();

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const r = (await Promise.race([workPromise, timerPromise]))!;

  // Clamp output (mostly cosmetic for internal tools)
  const out = clampOutput(Buffer.from(r.stdout ?? "", "utf8"), opts.maxOutputBytes);
  const err = clampOutput(Buffer.from(r.stderr ?? "", "utf8"), opts.maxOutputBytes);

  return {
    ok: r.ok,
    exit_code: r.exit_code,
    signal: r.signal,
    stdout: out.text,
    stderr: err.text,
    truncated: { stdout: out.truncated, stderr: err.truncated }
  };
}

export async function runTool(req: RunToolRequest): Promise<RunToolResult> {
  const spec = TOOL_ALLOWLIST[req.tool_id];
  if (!spec) {
    // no receipt_id exists yet
    throw new ToolRunnerError("FORBIDDEN", `Tool not allowed: ${req.tool_id}`);
  }

  const workspaceRoot = getWorkspaceRoot(req.workspace);
  const cwd = workspaceRoot;

  // harden: never allow args that try to smuggle shell operators; we don't use a shell,
  // but this also prevents weird accidental garbage.
  // Normalize args: accept string[] or Record<string, ...> (for internal JS tools)
  const rawReqArgs = req.args ?? [];
  const userArgs: string[] = Array.isArray(rawReqArgs)
    ? rawReqArgs.filter(Boolean).map(String)
    : Object.values(rawReqArgs).flat().filter(Boolean).map(String);
  // Skip injection guard for internal JS tools (fs.read, fs.write, diag.sleep)
  // They handle their own validation and never spawn a shell
  if (spec.cmd !== "__js__") {
    for (const a of userArgs) {
      if (/[;&|`$<>]/.test(a)) {
        throw new ToolRunnerError("BAD_REQUEST", `Disallowed characters in args: "${a}"`);
      }
    }
  }

  const receipt_id = crypto.randomUUID();
  const started = Date.now();
  const started_at = new Date(started).toISOString();

  const failWithReceipt = async (code: ToolRunnerErrorCode, message: string) => {
    const finished = Date.now();
    const finished_at = new Date(finished).toISOString();

    const result: RunToolResult = {
      receipt_id,
      ok: false,
      tool_id: req.tool_id,
      workspace: req.workspace,
      cwd,
      command: { cmd: spec.cmd, args: [...spec.argsPrefix, ...userArgs] },
      started_at,
      finished_at,
      duration_ms: finished - started,
      exit_code: null,
      signal: null,
      stdout: "",
      stderr: message,
      truncated: { stdout: false, stderr: false }
    };

    await writeReceipt(result);

    // throw error WITH receipt_id attached
    throw new ToolRunnerError(code, message, receipt_id);
  };

  // Internal tool path (no subprocess)
  if (spec.cmd === "__js__") {
    try {
      const r = await runInternalTool({
        tool_id: req.tool_id,
        specTimeoutMs: spec.timeoutMs,
        maxOutputBytes: spec.maxOutputBytes,
        userArgs,
        rawArgs: rawReqArgs
      });

      const finished = Date.now();
      const finished_at = new Date(finished).toISOString();

      const result: RunToolResult = {
        receipt_id,
        ok: r.ok,
        tool_id: req.tool_id,
        workspace: req.workspace,
        cwd,
        command: { cmd: spec.cmd, args: [...spec.argsPrefix, ...userArgs] },
        started_at,
        finished_at,
        duration_ms: finished - started,
        exit_code: r.exit_code,
        signal: r.signal,
        stdout: r.stdout,
        stderr: r.stderr,
        truncated: r.truncated
      };

      await writeReceipt(result);

      if (!r.ok) {
        return await failWithReceipt("INTERNAL", r.stderr || "Internal tool failed");
      }

      return result;
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "Internal tool failed");
      const code: ToolRunnerErrorCode = (e?.code as ToolRunnerErrorCode) || "INTERNAL";
      return await failWithReceipt(code, msg);
    }
  }

  // Subprocess tool path (spawn)
  const fullArgs = [...spec.argsPrefix, ...userArgs];

  let stdoutChunks: Buffer[] = [];
  let stderrChunks: Buffer[] = [];

  const child = spawn(spec.cmd, fullArgs, {
    cwd,
    shell: false,
    env: {
      ...process.env,
      NODE_OPTIONS: (process.env.NODE_OPTIONS || "") + " --dns-result-order=ipv4first"
    }
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
  const finished_at = new Date(finished).toISOString();

  const stdoutBuf = Buffer.concat(stdoutChunks);
  const stderrBuf = Buffer.concat(stderrChunks);

  const out = clampOutput(stdoutBuf, spec.maxOutputBytes);
  const err = clampOutput(stderrBuf, spec.maxOutputBytes);

  const ok = !killedByTimeout && exit.code === 0;

  const result: RunToolResult = {
    receipt_id,
    ok,
    tool_id: req.tool_id,
    workspace: req.workspace,
    cwd,
    command: { cmd: spec.cmd, args: fullArgs },
    started_at,
    finished_at,
    duration_ms: finished - started,
    exit_code: exit.code,
    signal: exit.signal,
    stdout: out.text,
    stderr: err.text,
    truncated: { stdout: out.truncated, stderr: err.truncated }
  };

  await writeReceipt(result);

  if (killedByTimeout) {
    throw new ToolRunnerError("BAD_REQUEST", `Tool timed out after ${spec.timeoutMs}ms`, receipt_id);
  }

  return result;
}