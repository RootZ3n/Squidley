// apps/api/src/tools/runner.ts
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TOOL_ALLOWLIST } from "./allowlist.js";
import { getWorkspaceRoot, type WorkspaceName } from "./workspaces.js";

export type RunToolRequest = {
  workspace: WorkspaceName;
  tool_id: string;
  // user args appended AFTER the allowlisted prefix
  // (ex: rg.search args: ["TODO", "apps/web"])
  args?: string[];
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

    throw new ToolRunnerError("FORBIDDEN", `Tool not allowed: ${opts.tool_id}`);
  })();

  const r = await Promise.race([workPromise, timerPromise]);

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
  const userArgs = (req.args ?? []).filter(Boolean).map(String);
  for (const a of userArgs) {
    if (/[;&|`$<>]/.test(a)) {
      // no receipt_id exists yet
      throw new ToolRunnerError("BAD_REQUEST", `Disallowed characters in args: "${a}"`);
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
        userArgs
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