// apps/api/src/tools/runner.ts
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import * as fsNode from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TOOL_ALLOWLIST } from "./allowlist.js";
import { getWorkspaceRoot, type WorkspaceName } from "./workspaces.js";

const COMFYUI_URL = (process.env.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/+$/, "");
const COMFYUI_OUTPUT_DIR = process.env.COMFYUI_OUTPUT_DIR ?? "/media/zen/AI/comfyui/output";
const COMFYUI_CHECKPOINT = process.env.COMFYUI_CHECKPOINT ?? "sd_xl_base_1.0.safetensors";

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
 * Parse a command string into [cmd, ...args] without using a shell.
 * Handles quoted strings: 'find /tmp -name "*.ts"' → ["find", "/tmp", "-name", "*.ts"]
 * Does NOT support shell operators (|, &, ;, $, >, <) — throws if found.
 */
function parseCommand(cmdStr: string): string[] {
  // Reject dangerous shell operators (subshell, command injection)
  // Pipes (|) and redirects (>) are allowed since we use shell:true for legitimate agent commands
  if (/[;&`$]/.test(cmdStr)) {
    throw new ToolRunnerError("BAD_REQUEST", `proc.exec: shell operators not allowed in command: "${cmdStr}"`);
  }

  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < cmdStr.length; i++) {
    const ch = cmdStr[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === " " && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);
  if (tokens.length === 0) throw new ToolRunnerError("BAD_REQUEST", "proc.exec: empty command");
  return tokens;
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
  admin_token?: string;
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
    // ── fs.write ──────────────────────────────────────────────────────────────
    // Writes content to a file inside the repo root. Admin-only.
    // rawArgs: { path: "apps/api/src/foo.ts", content: "...", backup?: true }
    if (opts.tool_id === "fs.write") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const relPath = (rawArgsObj?.path as string ?? opts.userArgs[0] ?? "").trim();
      const content = (rawArgsObj?.content as string ?? opts.userArgs[1] ?? "");
      const makeBackup = (rawArgsObj?.backup as unknown as boolean) !== false; // default true
      if (!relPath || relPath.includes("..") || path.isAbsolute(relPath)) {
        throw new ToolRunnerError("BAD_REQUEST", "fs.write: invalid path");
      }
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const abs = path.resolve(repoRoot, relPath);
      if (!abs.startsWith(repoRoot + path.sep)) {
        throw new ToolRunnerError("FORBIDDEN", "fs.write: path escapes repo root");
      }
      // Block writing to dist/ or node_modules/
      if (relPath.startsWith("apps/") && relPath.includes("/dist/")) {
        throw new ToolRunnerError("FORBIDDEN", "fs.write: cannot write to dist/ directly — edit source files");
      }
      if (relPath.includes("node_modules/")) {
        throw new ToolRunnerError("FORBIDDEN", "fs.write: cannot write to node_modules/");
      }
      // Optional backup
      if (makeBackup) {
        try {
          const existing = await fsNode.readFile(abs, "utf8");
          const backupPath = abs + ".sqbak";
          await fsNode.writeFile(backupPath, existing, "utf8");
        } catch { /* file didn't exist yet — no backup needed */ }
      }
      await fsNode.mkdir(path.dirname(abs), { recursive: true });
      await fsNode.writeFile(abs, content, "utf8");
      const lines = content.split("\n").length;
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: `fs.write: wrote ${relPath} (${lines} lines)${makeBackup ? " — backup saved as .sqbak" : ""}\n`,
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }
    // ── fs.patch ──────────────────────────────────────────────────────────────
    // Find-and-replace inside a file. Safer than full rewrite. Admin-only.
    // rawArgs: { path: "...", old_str: "...", new_str: "...", backup?: true }
    if (opts.tool_id === "fs.patch") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const relPath = (rawArgsObj?.path as string ?? "").trim();
      const oldStr = (rawArgsObj?.old_str as string ?? "");
      const newStr = (rawArgsObj?.new_str as string ?? "");
      const makeBackup = (rawArgsObj?.backup as unknown as boolean) !== false;
      if (!relPath || relPath.includes("..") || path.isAbsolute(relPath)) {
        throw new ToolRunnerError("BAD_REQUEST", "fs.patch: invalid path");
      }
      if (!oldStr) throw new ToolRunnerError("BAD_REQUEST", "fs.patch: old_str required");
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const abs = path.resolve(repoRoot, relPath);
      if (!abs.startsWith(repoRoot + path.sep)) {
        throw new ToolRunnerError("FORBIDDEN", "fs.patch: path escapes repo root");
      }
      if (relPath.startsWith("apps/") && relPath.includes("/dist/")) {
        throw new ToolRunnerError("FORBIDDEN", "fs.patch: cannot patch dist/ directly");
      }
      const original = await fsNode.readFile(abs, "utf8");
      const occurrences = original.split(oldStr).length - 1;
      if (occurrences === 0) {
        throw new ToolRunnerError("BAD_REQUEST", `fs.patch: old_str not found in ${relPath}`);
      }
      if (occurrences > 1) {
        throw new ToolRunnerError("BAD_REQUEST", `fs.patch: old_str matches ${occurrences} times — must be unique`);
      }
      if (makeBackup) {
        await fsNode.writeFile(abs + ".sqbak", original, "utf8");
      }
      const patched = original.replace(oldStr, newStr);
      await fsNode.writeFile(abs, patched, "utf8");
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: `fs.patch: patched ${relPath}${makeBackup ? " — backup saved as .sqbak" : ""}\nReplaced ${occurrences} occurrence(s)\n`,
        stderr: "", truncated: { stdout: false, stderr: false }
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

    // ── fs.mkdir ──────────────────────────────────────────────────────────────
    // Creates a directory (and parents). Admin-only.
    // rawArgs: { path: "memory/new-folder" }
    if (opts.tool_id === "fs.mkdir") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const relPath = (rawArgsObj?.path as string ?? opts.userArgs[0] ?? "").trim();
      if (!relPath || relPath.includes("..") || path.isAbsolute(relPath)) {
        throw new ToolRunnerError("BAD_REQUEST", "fs.mkdir: invalid path");
      }
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const abs = path.resolve(repoRoot, relPath);
      if (!abs.startsWith(repoRoot + path.sep) && abs !== repoRoot) {
        throw new ToolRunnerError("FORBIDDEN", "fs.mkdir: path escapes repo root");
      }
      await fsNode.mkdir(abs, { recursive: true });
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: `created directory: ${relPath}\n`,
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }

    // ── fs.move ───────────────────────────────────────────────────────────────
    // Moves or renames a file or directory. Admin-only.
    // rawArgs: { from: "memory/old.md", to: "memory/new.md" }
    if (opts.tool_id === "fs.move") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const fromRel = (rawArgsObj?.from as string ?? rawArgsObj?.src as string ?? opts.userArgs[0] ?? "").trim();
      const toRel = (rawArgsObj?.to as string ?? rawArgsObj?.dst as string ?? opts.userArgs[1] ?? "").trim();
      if (!fromRel || fromRel.includes("..") || path.isAbsolute(fromRel)) {
        throw new ToolRunnerError("BAD_REQUEST", "fs.move: invalid 'from' path");
      }
      if (!toRel || toRel.includes("..") || path.isAbsolute(toRel)) {
        throw new ToolRunnerError("BAD_REQUEST", "fs.move: invalid 'to' path");
      }
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const absFrom = path.resolve(repoRoot, fromRel);
      const absTo = path.resolve(repoRoot, toRel);
      if (!absFrom.startsWith(repoRoot + path.sep)) throw new ToolRunnerError("FORBIDDEN", "fs.move: 'from' escapes repo root");
      if (!absTo.startsWith(repoRoot + path.sep)) throw new ToolRunnerError("FORBIDDEN", "fs.move: 'to' escapes repo root");
      await fsNode.mkdir(path.dirname(absTo), { recursive: true });
      await fsNode.rename(absFrom, absTo);
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: `moved: ${fromRel} → ${toRel}\n`,
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }

    // ── fs.delete ─────────────────────────────────────────────────────────────
    // Deletes a file or empty directory. Admin-only. No recursive delete.
    // rawArgs: { path: "memory/old-file.md" }
    if (opts.tool_id === "fs.delete") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const relPath = (rawArgsObj?.path as string ?? opts.userArgs[0] ?? "").trim();
      if (!relPath || relPath.includes("..") || path.isAbsolute(relPath)) {
        throw new ToolRunnerError("BAD_REQUEST", "fs.delete: invalid path");
      }
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const abs = path.resolve(repoRoot, relPath);
      if (!abs.startsWith(repoRoot + path.sep)) throw new ToolRunnerError("FORBIDDEN", "fs.delete: path escapes repo root");
      const stat = await fsNode.stat(abs);
      if (stat.isDirectory()) {
        // Only allow deleting empty directories
        const entries = await fsNode.readdir(abs);
        if (entries.length > 0) throw new ToolRunnerError("BAD_REQUEST", `fs.delete: directory not empty: ${relPath}`);
        await fsNode.rmdir(abs);
      } else {
        await fsNode.unlink(abs);
      }
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: `deleted: ${relPath}\n`,
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }

    // ── fs.diff ───────────────────────────────────────────────────────────────
    // Diffs two files using a simple line-by-line comparison. Read-only.
    // rawArgs: { a: "apps/api/src/server.ts", b: "apps/api/src/server.ts.bak" }
    if (opts.tool_id === "fs.diff") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const aRel = (rawArgsObj?.a as string ?? rawArgsObj?.from as string ?? opts.userArgs[0] ?? "").trim();
      const bRel = (rawArgsObj?.b as string ?? rawArgsObj?.to as string ?? opts.userArgs[1] ?? "").trim();
      if (!aRel || aRel.includes("..") || path.isAbsolute(aRel)) throw new ToolRunnerError("BAD_REQUEST", "fs.diff: invalid 'a' path");
      if (!bRel || bRel.includes("..") || path.isAbsolute(bRel)) throw new ToolRunnerError("BAD_REQUEST", "fs.diff: invalid 'b' path");
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const absA = path.resolve(repoRoot, aRel);
      const absB = path.resolve(repoRoot, bRel);
      if (!absA.startsWith(repoRoot + path.sep)) throw new ToolRunnerError("FORBIDDEN", "fs.diff: 'a' escapes repo root");
      if (!absB.startsWith(repoRoot + path.sep)) throw new ToolRunnerError("FORBIDDEN", "fs.diff: 'b' escapes repo root");
      const [textA, textB] = await Promise.all([fsNode.readFile(absA, "utf8"), fsNode.readFile(absB, "utf8")]);
      const linesA = textA.split("\n");
      const linesB = textB.split("\n");
      const diffLines: string[] = [`--- ${aRel}`, `+++ ${bRel}`];
      const maxLines = Math.max(linesA.length, linesB.length);
      let changes = 0;
      for (let i = 0; i < maxLines; i++) {
        const la = linesA[i] ?? "";
        const lb = linesB[i] ?? "";
        if (la !== lb) {
          if (la) diffLines.push(`- ${la}`);
          if (lb) diffLines.push(`+ ${lb}`);
          changes++;
        }
      }
      if (changes === 0) diffLines.push("(files are identical)");
      else diffLines.push(`\n${changes} line(s) differ`);
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: diffLines.join("\n") + "\n",
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }

    // ── fs.tree ───────────────────────────────────────────────────────────────
    // Produces a directory tree. Read-only. Max depth 4.
    // rawArgs: { path: "apps/api/src", depth: "3" }
    if (opts.tool_id === "fs.tree") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const relPath = (rawArgsObj?.path as string ?? rawArgsObj?.dir as string ?? opts.userArgs[0] ?? ".").trim();
      const maxDepth = Math.min(parseInt(String(rawArgsObj?.depth ?? opts.userArgs[1] ?? "3"), 10) || 3, 4);
      if (relPath.includes("..") || path.isAbsolute(relPath)) throw new ToolRunnerError("BAD_REQUEST", "fs.tree: invalid path");
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const abs = path.resolve(repoRoot, relPath);
      if (!abs.startsWith(repoRoot + path.sep) && abs !== repoRoot) throw new ToolRunnerError("FORBIDDEN", "fs.tree: path escapes repo root");

      const IGNORE = new Set(["node_modules", ".git", "dist", ".next", ".playwright-browsers"]);
      const lines: string[] = [relPath === "." ? repoRoot : relPath];

      async function walk(dir: string, prefix: string, depth: number) {
        if (depth > maxDepth) return;
        let entries: import("node:fs").Dirent[];
        try { entries = await fsNode.readdir(dir, { withFileTypes: true }) as import("node:fs").Dirent[]; }
        catch { return; }
        const filtered = entries.filter(e => !IGNORE.has(e.name)).sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });
        for (let i = 0; i < filtered.length; i++) {
          const e = filtered[i];
          const isLast = i === filtered.length - 1;
          const connector = isLast ? "└── " : "├── ";
          const childPrefix = isLast ? prefix + "    " : prefix + "│   ";
          lines.push(prefix + connector + e.name + (e.isDirectory() ? "/" : ""));
          if (e.isDirectory()) await walk(path.join(dir, e.name), childPrefix, depth + 1);
        }
      }

      await walk(abs, "", 1);
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: lines.join("\n") + "\n",
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }

    // ── proc.exec ─────────────────────────────────────────────────────────────
    // Admin-only: runs a command directly without a shell.
    // Accepts rawArgs: { cmd: "find ~/openclaw -type f ..." }
    // or userArgs[0] as the full command string.
    // No shell operators allowed. No shell spawned.
    if (opts.tool_id === "proc.exec") {
      // Require admin token
      const expectedToken = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();
      const providedToken = (opts.admin_token ?? "").trim();
      if (
        expectedToken.length < 12 ||
        providedToken.length !== expectedToken.length ||
        !crypto.timingSafeEqual(Buffer.from(providedToken), Buffer.from(expectedToken))
      ) {
        throw new ToolRunnerError("FORBIDDEN", "proc.exec: admin token required");
      }

      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      // Accept { cmd: "..." } or first userArg as full command string
      const cmdStr = (rawArgsObj?.cmd as string ?? rawArgsObj?.query as string ?? opts.userArgs.join(" ") ?? "").trim();
      if (!cmdStr) throw new ToolRunnerError("BAD_REQUEST", "proc.exec: cmd required");

      // Expand ~ to home directory
      const expandedCmd = cmdStr.replace(/^~(?=\/|$)/, os.homedir()).replace(/(?<=\s)~(?=\/)/g, os.homedir());

      const tokens = parseCommand(expandedCmd);
      const [cmd, ...cmdArgs] = tokens;

      // Resolve working directory — use ZENSQUID_ROOT as cwd for relative paths
      const cwd = process.env.ZENSQUID_ROOT ?? process.cwd();

      const stdout = await new Promise<string>((resolve, reject) => {
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        // shell: true so pipes, find|grep|head etc. work in agent commands.
        // Safe because proc.exec is admin-token gated.
        const child = spawn(expandedCmd, [], {
          cwd,
          shell: true,
          env: { ...process.env },
        });

        child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
        child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new ToolRunnerError("BAD_REQUEST", `proc.exec: command timed out after 30s`));
        }, 30_000);

        child.on("close", (code) => {
          clearTimeout(timer);
          const out = Buffer.concat(stdoutChunks).toString("utf8");
          const err = Buffer.concat(stderrChunks).toString("utf8");
          if (code !== 0) {
            // Non-zero exit — return stderr as part of output so agent can see what failed
            resolve(out + (err ? `\nSTDERR:\n${err}` : ""));
          } else {
            resolve(out);
          }
        });

        child.on("error", (e) => {
          clearTimeout(timer);
          reject(new ToolRunnerError("INTERNAL", `proc.exec: spawn error: ${e.message}`));
        });
      });

      return {
        ok: true,
        exit_code: 0,
        signal: null as NodeJS.Signals | null,
        stdout,
        stderr: "",
        truncated: { stdout: false, stderr: false }
      };
    }

    // ── proc.list ─────────────────────────────────────────────────────────────
    // Lists running processes. Admin-only.
    // rawArgs: { filter: "node" } — optional grep filter
    if (opts.tool_id === "proc.list") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const filter = (rawArgsObj?.filter as string ?? opts.userArgs[0] ?? "").trim().toLowerCase();
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const { stdout: psOut } = await execFileAsync("ps", ["aux", "--no-headers"], { timeout: 8000 });
      const lines = psOut.split("\n").filter(Boolean);
      const filtered = filter ? lines.filter(l => l.toLowerCase().includes(filter)) : lines;
      const summary = filtered.slice(0, 50).join("\n");
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: `${filtered.length} process(es)${filter ? ` matching "${filter}"` : ""}:\n${summary}\n`,
        stderr: "", truncated: { stdout: filtered.length > 50, stderr: false }
      };
    }

    // ── proc.kill ─────────────────────────────────────────────────────────────
    // Kills a process by PID. Admin-only. SIGTERM by default, SIGKILL if forced.
    // rawArgs: { pid: "12345", signal: "SIGTERM" }
    if (opts.tool_id === "proc.kill") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const pidStr = (rawArgsObj?.pid as string ?? opts.userArgs[0] ?? "").trim();
      const sig = (rawArgsObj?.signal as string ?? opts.userArgs[1] ?? "SIGTERM").trim().toUpperCase();
      const pid = parseInt(pidStr, 10);
      if (!pid || isNaN(pid) || pid < 2) throw new ToolRunnerError("BAD_REQUEST", `proc.kill: invalid PID: ${pidStr}`);
      const allowedSignals = ["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP"];
      if (!allowedSignals.includes(sig)) throw new ToolRunnerError("BAD_REQUEST", `proc.kill: signal must be one of: ${allowedSignals.join(", ")}`);
      process.kill(pid, sig as NodeJS.Signals);
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: `sent ${sig} to PID ${pid}\n`,
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }

    // ── systemctl.status ──────────────────────────────────────────────────────
    // Checks status of a systemd user service. Read-only.
    // rawArgs: { service: "squidley-api" }
    if (opts.tool_id === "systemctl.status") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const service = (rawArgsObj?.service as string ?? opts.userArgs[0] ?? "").trim();
      if (!service) throw new ToolRunnerError("BAD_REQUEST", "systemctl.status: service name required");
      if (!/^[a-zA-Z0-9_\-.:@]+$/.test(service)) throw new ToolRunnerError("BAD_REQUEST", "systemctl.status: invalid service name");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      try {
        const { stdout: statusOut } = await execFileAsync(
          "systemctl", ["--user", "status", service, "--no-pager", "-l"],
          { timeout: 8000 }
        );
        return {
          ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
          stdout: statusOut, stderr: "", truncated: { stdout: false, stderr: false }
        };
      } catch (e: any) {
        // systemctl exits non-zero for inactive services — still useful output
        const out = String(e?.stdout ?? e?.message ?? "service not found");
        return {
          ok: true, exit_code: 1, signal: null as NodeJS.Signals | null,
          stdout: out, stderr: "", truncated: { stdout: false, stderr: false }
        };
      }
    }

    // ── env.read ──────────────────────────────────────────────────────────────
    // Reads specific env vars by name. Admin-only. Never dumps all env.
    // rawArgs: { keys: "ZENSQUID_ROOT,NODE_ENV" } or { keys: ["ZENSQUID_ROOT"] }
    if (opts.tool_id === "env.read") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const keysRaw = rawArgsObj?.keys as string | string[] ?? opts.userArgs[0] ?? "";
      const keys = Array.isArray(keysRaw)
        ? keysRaw.map(String)
        : String(keysRaw).split(",").map(s => s.trim()).filter(Boolean);
      if (keys.length === 0) throw new ToolRunnerError("BAD_REQUEST", "env.read: at least one key required");
      if (keys.length > 20) throw new ToolRunnerError("BAD_REQUEST", "env.read: max 20 keys per call");
      // Never expose secrets — block known sensitive key patterns
      const BLOCKED = /password|secret|token|key|credential|auth|private/i;
      const lines: string[] = [];
      for (const k of keys) {
        if (BLOCKED.test(k)) {
          lines.push(`${k}=[REDACTED — sensitive key name]`);
        } else {
          const val = process.env[k];
          lines.push(val !== undefined ? `${k}=${val}` : `${k}=(not set)`);
        }
      }
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: lines.join("\n") + "\n",
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }

    // ── http.get ──────────────────────────────────────────────────────────────
    // Makes an HTTP GET request. Admin-only. Local URLs only by default.
    // rawArgs: { url: "http://127.0.0.1:11434/api/tags" }
    if (opts.tool_id === "http.get") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const url = (rawArgsObj?.url as string ?? opts.userArgs[0] ?? "").trim();
      if (!url) throw new ToolRunnerError("BAD_REQUEST", "http.get: url required");
      const resp = await fetch(url, {
        method: "GET",
        headers: { "accept": "application/json, text/plain, */*" },
        signal: AbortSignal.timeout(25_000),
      });
      const text = await resp.text();
      return {
        ok: resp.ok, exit_code: resp.ok ? 0 : 1, signal: null as NodeJS.Signals | null,
        stdout: `HTTP ${resp.status} ${resp.statusText}\n${text}`,
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }

    // ── http.post ─────────────────────────────────────────────────────────────
    // Makes an HTTP POST request. Admin-only.
    // rawArgs: { url: "http://...", body: "{...}", content_type: "application/json" }
    if (opts.tool_id === "http.post") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const url = (rawArgsObj?.url as string ?? opts.userArgs[0] ?? "").trim();
      const body = (rawArgsObj?.body as string ?? opts.userArgs[1] ?? "").trim();
      const contentType = (rawArgsObj?.content_type as string ?? "application/json").trim();
      if (!url) throw new ToolRunnerError("BAD_REQUEST", "http.post: url required");
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": contentType, "accept": "application/json, text/plain, */*" },
        body: body || undefined,
        signal: AbortSignal.timeout(25_000),
      });
      const text = await resp.text();
      return {
        ok: resp.ok, exit_code: resp.ok ? 0 : 1, signal: null as NodeJS.Signals | null,
        stdout: `HTTP ${resp.status} ${resp.statusText}\n${text}`,
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }

    // ── dns.lookup ────────────────────────────────────────────────────────────
    // DNS lookup for a hostname. Read-only.
    // rawArgs: { hostname: "api.openai.com" }
    if (opts.tool_id === "dns.lookup") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const hostname = (rawArgsObj?.hostname as string ?? rawArgsObj?.host as string ?? opts.userArgs[0] ?? "").trim();
      if (!hostname) throw new ToolRunnerError("BAD_REQUEST", "dns.lookup: hostname required");
      const dns = await import("node:dns/promises");
      try {
        const address = await dns.lookup(hostname);
        const addresses = await dns.resolve(hostname).catch(() => []);
        const lines = [
          `hostname: ${hostname}`,
          `address: ${address.address}`,
          `family: IPv${address.family}`,
        ];
        if (addresses.length > 1) lines.push(`all: ${addresses.join(", ")}`);
        return {
          ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
          stdout: lines.join("\n") + "\n",
          stderr: "", truncated: { stdout: false, stderr: false }
        };
      } catch (e: any) {
        return {
          ok: false, exit_code: 1, signal: null as NodeJS.Signals | null,
          stdout: "", stderr: `dns.lookup failed: ${e?.message ?? e}`,
          truncated: { stdout: false, stderr: false }
        };
      }
    }

    // ── ollama.list ───────────────────────────────────────────────────────────
    // Lists all downloaded Ollama models. Read-only.
    if (opts.tool_id === "ollama.list") {
      const ollamaUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
      const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(8_000) });
      if (!resp.ok) throw new ToolRunnerError("INTERNAL", `ollama.list: Ollama returned ${resp.status}`);
      const data = await resp.json() as any;
      const models = (data?.models ?? []) as any[];
      if (models.length === 0) {
        return { ok: true, exit_code: 0, signal: null as NodeJS.Signals | null, stdout: "No models downloaded.\n", stderr: "", truncated: { stdout: false, stderr: false } };
      }
      const lines = models.map((m: any) => {
        const sizeGb = ((m.size ?? 0) / 1e9).toFixed(1);
        const modified = m.modified_at ? new Date(m.modified_at).toISOString().slice(0, 10) : "unknown";
        return `${m.name.padEnd(40)} ${sizeGb.padStart(6)}GB  ${modified}`;
      });
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: `${models.length} model(s):\n${"name".padEnd(40)} ${"size".padStart(6)}    modified\n${"-".repeat(60)}\n${lines.join("\n")}\n`,
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }

    // ── ollama.pull ───────────────────────────────────────────────────────────
    // Pulls a model from Ollama registry. Admin-only. Long-running.
    // rawArgs: { model: "qwen2.5:7b" }
    if (opts.tool_id === "ollama.pull") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const model = (rawArgsObj?.model as string ?? opts.userArgs[0] ?? "").trim();
      if (!model) throw new ToolRunnerError("BAD_REQUEST", "ollama.pull: model name required");
      if (!/^[a-zA-Z0-9_\-.:]+$/.test(model)) throw new ToolRunnerError("BAD_REQUEST", `ollama.pull: invalid model name: ${model}`);
      const ollamaUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
      const resp = await fetch(`${ollamaUrl}/api/pull`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: model, stream: false }),
        signal: AbortSignal.timeout(29 * 60_000),
      });
      if (!resp.ok) throw new ToolRunnerError("INTERNAL", `ollama.pull: Ollama returned ${resp.status}`);
      const data = await resp.json() as any;
      const status = String(data?.status ?? "unknown");
      return {
        ok: status === "success" || status.includes("success"),
        exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: `ollama.pull ${model}: ${status}\n`,
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }

    // ── skill.scan ────────────────────────────────────────────────────────────
    // Scans a skill file for injection patterns, impersonation, encoding tricks.
    // Read-only — never executes skill content.
    // rawArgs: { path: "skills/my-skill/skill.md" }
    if (opts.tool_id === "skill.scan") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const relPath = (rawArgsObj?.path as string ?? opts.userArgs[0] ?? "").trim();
      if (!relPath || relPath.includes("..") || path.isAbsolute(relPath)) {
        throw new ToolRunnerError("BAD_REQUEST", "skill.scan: invalid path");
      }
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const abs = path.resolve(repoRoot, relPath);
      if (!abs.startsWith(repoRoot + path.sep)) throw new ToolRunnerError("FORBIDDEN", "skill.scan: path escapes repo root");
      const text = await fsNode.readFile(abs, "utf8");
      const { scanSkillText, formatScanResult } = await import("./skillScanner.js");
      const result = scanSkillText(relPath, text);
      return {
        ok: true, exit_code: result.risk === "BLOCK" ? 2 : result.risk === "HIGH" ? 1 : 0,
        signal: null as NodeJS.Signals | null,
        stdout: formatScanResult(result) + "\n",
        stderr: "",
        truncated: { stdout: false, stderr: false }
      };
    }

    // ── skill.quarantine ──────────────────────────────────────────────────────
    // Moves a skill directory to skills/_quarantine/. Admin-only.
    // rawArgs: { skill: "my-skill" }
    if (opts.tool_id === "skill.quarantine") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const skillName = (rawArgsObj?.skill as string ?? rawArgsObj?.name as string ?? opts.userArgs[0] ?? "").trim();
      if (!skillName || skillName.includes("..") || skillName.includes("/")) {
        throw new ToolRunnerError("BAD_REQUEST", "skill.quarantine: invalid skill name");
      }
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const srcDir = path.join(repoRoot, "skills", skillName);
      const quarantineDir = path.join(repoRoot, "skills", "_quarantine");
      const dstDir = path.join(quarantineDir, skillName);
      await fsNode.mkdir(quarantineDir, { recursive: true });
      await fsNode.rename(srcDir, dstDir);
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: `quarantined: skills/${skillName} → skills/_quarantine/${skillName}\n`,
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }
    // ── skill.scan-all ────────────────────────────────────────────────────────
    if (opts.tool_id === "skill.scan-all") {
      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const skillsDir = path.join(repoRoot, "skills");
      const { scanSkillText, formatScanResult } = await import("./skillScanner.js");
      let entries: string[] = [];
      try {
        const dirs = await fsNode.readdir(skillsDir, { withFileTypes: true });
        entries = dirs
          .filter(d => d.isDirectory() && d.name !== "_quarantine" && !d.name.startsWith("."))
          .map(d => d.name).sort();
      } catch {
        throw new ToolRunnerError("INTERNAL", "skill.scan-all: could not read skills directory");
      }
      if (entries.length === 0) return { ok: true, exit_code: 0, signal: null as NodeJS.Signals | null, stdout: "No skills found.\n", stderr: "", truncated: { stdout: false, stderr: false } };
      const results: string[] = [];
      let blockCount = 0, highCount = 0, mediumCount = 0, cleanCount = 0;
      for (const skillName of entries) {
        const relPath = `skills/${skillName}/skill.md`;
        try {
          const text = await fsNode.readFile(path.join(skillsDir, skillName, "skill.md"), "utf8");
          const result = scanSkillText(relPath, text);
          results.push(formatScanResult(result));
          if (result.risk === "BLOCK") blockCount++;
          else if (result.risk === "HIGH") highCount++;
          else if (result.risk === "MEDIUM") mediumCount++;
          else cleanCount++;
        } catch { results.push(`[ERROR] Could not read ${relPath}\n`); }
      }
      let quarantineNote = "";
      try {
        const qe = await fsNode.readdir(path.join(skillsDir, "_quarantine"));
        if (qe.length > 0) quarantineNote = `\nQuarantined: ${qe.join(", ")}\n`;
      } catch { /* ok */ }
      const summary = [
        `skill.scan-all: scanned ${entries.length} skill(s)`,
        `  BLOCK: ${blockCount}  HIGH: ${highCount}  MEDIUM: ${mediumCount}  CLEAN: ${cleanCount}`,
        blockCount > 0 ? `⚠️  CRITICAL: ${blockCount} require quarantine` : "",
        highCount > 0 ? `⚠️  HIGH RISK: ${highCount} need review` : "",
        quarantineNote, "---", ...results
      ].filter(Boolean).join("\n");
      return { ok: true, exit_code: blockCount > 0 ? 2 : highCount > 0 ? 1 : 0, signal: null as NodeJS.Signals | null, stdout: summary + "\n", stderr: "", truncated: { stdout: false, stderr: false } };
    }
    
    // ── skill.build ───────────────────────────────────────────────────────────
    // Drafts a skill using the local model, scans it, and writes it if clean.
    // Admin-only.
    // rawArgs: { name: "my-skill", topic: "how to use rg.search effectively" }
    if (opts.tool_id === "skill.build") {
      const rawArgsObj = opts.rawArgs && !Array.isArray(opts.rawArgs) ? opts.rawArgs : null;
      const rawName = (rawArgsObj?.name as string ?? opts.userArgs[0] ?? "").trim();
      const topic = (rawArgsObj?.topic as string ?? rawArgsObj?.description as string ?? rawName).trim();
      if (!rawName) throw new ToolRunnerError("BAD_REQUEST", "skill.build: name required");

      // Sanitize name to safe directory name
      const skillName = rawName.toLowerCase().replace(/[^a-z0-9\-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      if (!skillName) throw new ToolRunnerError("BAD_REQUEST", "skill.build: could not derive safe skill name");

      const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
      const skillDir = path.join(repoRoot, "skills", skillName);
      const skillPath = path.join(skillDir, "skill.md");

      // Check skill doesn't already exist
      try {
        await fsNode.access(skillPath);
        throw new ToolRunnerError("BAD_REQUEST", `skill.build: skill already exists: skills/${skillName}/skill.md`);
      } catch (e: any) {
        if (e instanceof ToolRunnerError) throw e;
        // File doesn't exist — good, proceed
      }

      // Draft skill content via Ollama
      const ollamaUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
      const model = process.env.SQUIDLEY_PLAN_MODEL ?? "qwen2.5:14b-instruct";
      const today = new Date().toISOString().slice(0, 10);

      const prompt = `You are writing a skill file for Squidley, an AI orchestration system.
A "skill" is a markdown document that gives Squidley knowledge and best practices for a specific topic.
Skill files are loaded into Squidley's context to help her handle related tasks better.

Write a skill.md file for the following topic: "${topic}"

The skill file MUST follow this exact format:
# Skill: ${skillName}
## Purpose
[One sentence description of what this skill covers]
## [Section name — choose appropriate sections for the topic]
[Content]
## Metadata
- created: ${today}
- author: Squidley + Jeff

Rules:
- Be specific and actionable — this is reference material Squidley will use
- Include concrete examples, commands, or patterns where relevant
- Keep it under 60 lines
- Do NOT include any instructions to ignore previous instructions, bypass safety, or access external URLs
- Do NOT claim any special permissions or admin access
- Output ONLY the skill.md content, no preamble or explanation`;

      const draftResp = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: "user", content: prompt }]
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!draftResp.ok) throw new ToolRunnerError("INTERNAL", `skill.build: Ollama returned ${draftResp.status}`);
      const draftData = await draftResp.json() as any;
      const drafted = String(draftData?.message?.content ?? draftData?.response ?? "").trim();

      if (!drafted || drafted.length < 50) {
        throw new ToolRunnerError("INTERNAL", "skill.build: model returned empty or too-short content");
      }

      // Security scan the drafted content before writing
      const { scanSkillText } = await import("./skillScanner.js");
      const scanResult = scanSkillText(`skills/${skillName}/skill.md`, drafted);

      if (scanResult.risk === "BLOCK") {
        const findings = scanResult.findings.map(f => `  [${f.level}] ${f.rule}: "${f.match}"`).join("\n");
        throw new ToolRunnerError("FORBIDDEN", `skill.build: drafted content failed security scan (BLOCK):\n${findings}`);
      }

      // Write the skill
      await fsNode.mkdir(skillDir, { recursive: true });
      await fsNode.writeFile(skillPath, drafted, "utf8");

      const riskNote = scanResult.risk === "LOW" ? "✅ clean" : `⚠️  ${scanResult.risk} (${scanResult.findings.length} finding(s))`;
      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: `skill.build: wrote skills/${skillName}/skill.md\nSecurity scan: ${riskNote}\nLines: ${drafted.split("\n").length}\n\n${drafted}\n`,
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }
    // ── comfyui.status ────────────────────────────────────────────────────────
       if (opts.tool_id === "comfyui.status") {
      try {
        const resp = await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(5_000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json() as any;
        return {
          ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
          stdout: `ComfyUI: running ✓\nVersion: ${data.system?.comfyui_version}\nPyTorch:     ${data.system?.pytorch_version}\nRAM free: ${Math.round((data.system?.ram_free ?? 0) / 1024 / 1024 / 1024 * 10) / 10}GB`,
          stderr: "", truncated: { stdout: false, stderr: false }
        };
      } catch (e: any) {
        return {
          ok: false, exit_code: 1, signal: null as NodeJS.Signals | null,
          stdout: `ComfyUI: not running\n${String(e?.message ?? e)}`,
          stderr: "", truncated: { stdout: false, stderr: false }
        };
      }
    }

    // ── ComfyUI idle auto-stop ────────────────────────────────────────────────────
let comfyuiIdleTimer: ReturnType<typeof setTimeout> | null = null;
const COMFYUI_IDLE_MS = 5 * 60 * 1000; // 5 minutes
function resetComfyUIIdleTimer() {
  if (comfyuiIdleTimer) clearTimeout(comfyuiIdleTimer);
  comfyuiIdleTimer = setTimeout(async () => {
    try {
      const { execSync } = await import("child_process");
      execSync("pkill -f 'comfyui/main.py'", { timeout: 5000 });
      console.log("[comfyui] auto-stopped after 5min idle");
    } catch {}
    comfyuiIdleTimer = null;
  }, COMFYUI_IDLE_MS);
}

// ── comfyui.start ──────────────────────────────────────────────────────────
    // ComfyUI runs locally on ZenPop.
    if (opts.tool_id === "comfyui.start") {
      // Check if already running
      try {
        const resp = await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(3_000) });
        if (resp.ok) { resetComfyUIIdleTimer(); return {
          ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
          stdout: `ComfyUI: already running at ${COMFYUI_URL} ✓`,
          stderr: "", truncated: { stdout: false, stderr: false }
        }; }
      } catch {}
      // Start it
      const { spawn } = await import("child_process");
      const child = spawn("/media/zen/AI/comfyui/venv/bin/python", ["/media/zen/AI/comfyui/main.py", "--listen", "127.0.0.1", "--port", "8188"], {
        detached: true, stdio: "ignore",
        env: { ...process.env, PATH: process.env.PATH ?? "" }
      });
      child.unref();
      // Wait up to 30s for it to come up
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const resp = await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(2_000) });
          if (resp.ok) return {
            ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
            stdout: `ComfyUI started successfully at ${COMFYUI_URL} ✓ (took ${i+1}s) — auto-stop in 5min idle`,
            stderr: "", truncated: { stdout: false, stderr: false }
          };
        } catch {}
      }
      return {
        ok: false, exit_code: 1, signal: null as NodeJS.Signals | null,
        stdout: `ComfyUI failed to start within 30s at ${COMFYUI_URL}`,
        stderr: "", truncated: { stdout: false, stderr: false }
      };
    }
    // ── comfyui.stop ──────────────────────────────────────────────────────────
    if (opts.tool_id === "comfyui.stop") {
      const { execSync } = await import("child_process");
      try {
        execSync("pkill -f 'comfyui/main.py'", { timeout: 5000 });
        return {
          ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
          stdout: "ComfyUI stopped ✓",
          stderr: "", truncated: { stdout: false, stderr: false }
        };
      } catch {
        return {
          ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
          stdout: "ComfyUI was not running.",
          stderr: "", truncated: { stdout: false, stderr: false }
        };
      }
    }
    // ── comfyui.generate ──────────────────────────────────────────────────────
    if (opts.tool_id === "comfyui.generate") {
      const rawArgs = (Array.isArray(opts.rawArgs) ? {} : (opts.rawArgs ?? {})) as Record<string, string>;
      const prompt = String(rawArgs?.prompt ?? rawArgs?.query ?? "").trim();
      const negativePrompt = String(rawArgs?.negative ?? "blurry, bad anatomy, watermark, text, logo").trim();
      const outputName = String(rawArgs?.output ?? rawArgs?.filename ?? "squidley_gen").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
      const steps = Math.min(50, Math.max(1, parseInt(String(rawArgs?.steps ?? "20"), 10)));
      const width = parseInt(String(rawArgs?.width ?? "1024"), 10);
      const height = parseInt(String(rawArgs?.height ?? "1024"), 10);
      const seed = parseInt(String(rawArgs?.seed ?? String(Math.floor(Math.random() * 2**32))), 10);

      if (!prompt) throw new ToolRunnerError("BAD_REQUEST", "comfyui.generate: prompt required");
      resetComfyUIIdleTimer(); // reset idle timer on every generation

      // Check ComfyUI is running
      try {
        const check = await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(3_000) });
        if (!check.ok) throw new Error("not ready");
      } catch {
        throw new ToolRunnerError("INTERNAL", "comfyui.generate: ComfyUI is not running — use comfyui.start first");
      }

      // Build SDXL workflow
      const workflow = {
        "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: COMFYUI_CHECKPOINT } },
        "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
        "3": { class_type: "CLIPTextEncode", inputs: { text: negativePrompt, clip: ["1", 1] } },
        "4": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
        "5": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0], seed, steps, cfg: 7.0, sampler_name: "euler", scheduler: "normal", denoise: 1.0 } },
        "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
        "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: outputName } },
      };

      // Submit prompt
      const submitResp = await fetch(`${COMFYUI_URL}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: workflow }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!submitResp.ok) throw new ToolRunnerError("INTERNAL", `comfyui.generate: submit failed (${submitResp.status})`);
      const submitData = await submitResp.json() as any;
      const promptId = submitData?.prompt_id;
      if (!promptId) throw new ToolRunnerError("INTERNAL", "comfyui.generate: no prompt_id returned");

      // Poll for completion
      const maxWaitMs = 4 * 60_000;
      const pollInterval = 2_000;
      const started = Date.now();
      let outputFile = "";

      while (Date.now() - started < maxWaitMs) {
        await new Promise(r => setTimeout(r, pollInterval));
        try {
          const histResp = await fetch(`${COMFYUI_URL}/history/${promptId}`, { signal: AbortSignal.timeout(5_000) });
          if (!histResp.ok) continue;
          const hist = await histResp.json() as any;
          const entry = hist[promptId];
          if (!entry?.outputs) continue;
          // Find SaveImage output
          for (const nodeOut of Object.values(entry.outputs) as any[]) {
            if (nodeOut?.images?.[0]?.filename) {
              outputFile = nodeOut.images[0].filename;
              break;
            }
          }
          if (outputFile) break;
        } catch {}
      }

      if (!outputFile) throw new ToolRunnerError("INTERNAL", "comfyui.generate: timed out waiting for output");

      const outputPath = path.join(COMFYUI_OUTPUT_DIR, outputFile);
      const elapsedS = ((Date.now() - started) / 1000).toFixed(1);

      return {
        ok: true, exit_code: 0, signal: null as NodeJS.Signals | null,
        stdout: `comfyui.generate: ✓\nFile: ${outputPath}\nPrompt: ${prompt}\nSeed: ${seed}\nSteps: ${steps}\nElapsed: ${elapsedS}s`,
        stderr: "", truncated: { stdout: false, stderr: false }
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

  // Skip injection guard for internal JS tools (fs.read, fs.write, diag.sleep, proc.exec)
  // They handle their own validation and never spawn a shell
  if (spec.cmd !== "__js__") {
    for (const a of userArgs) {
      if (/[;&|`$<>]/.test(a)) {
        throw new ToolRunnerError("BAD_REQUEST", `Disallowed characters in args: "${a}"`);
      }
    }
  }

  const receipt_id = crypto.randomBytes(9).toString("base64url");
  const started = Date.now();
  const started_at = new Date(started).toISOString();

  async function failWithReceipt(code: ToolRunnerErrorCode, msg: string): Promise<never> {
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
      stderr: msg,
      truncated: { stdout: false, stderr: false }
    };
    await writeReceipt(result);
    const err = new ToolRunnerError(code, msg, receipt_id);
    throw err;
  }

  if (spec.cmd === "__js__") {
    try {
      const r = await runInternalTool({
        tool_id: req.tool_id,
        specTimeoutMs: spec.timeoutMs,
        maxOutputBytes: spec.maxOutputBytes,
        userArgs,
        rawArgs: rawReqArgs,
        admin_token: req.admin_token,
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
  }, spec.timeoutMs ?? 30_000);

  child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });

  const finished = Date.now();
  const finished_at = new Date(finished).toISOString();

  const rawStdout = Buffer.concat(stdoutChunks);
  const rawStderr = Buffer.concat(stderrChunks);
  const maxBytes = spec.maxOutputBytes ?? 200_000;
  const outClamped = clampOutput(rawStdout, maxBytes);
  const errClamped = clampOutput(rawStderr, maxBytes);

  const ok = exitCode === 0 && !killedByTimeout;

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
    exit_code: killedByTimeout ? null : exitCode,
    signal: killedByTimeout ? "SIGKILL" : null,
    stdout: outClamped.text,
    stderr: errClamped.text,
    truncated: { stdout: outClamped.truncated, stderr: errClamped.truncated }
  };

  await writeReceipt(result);

  if (!ok) {
    return await failWithReceipt(
      "INTERNAL",
      killedByTimeout
        ? `Command timed out after ${spec.timeoutMs}ms`
        : errClamped.text || `Exit code ${exitCode}`
    );
  }

  return result;
}
