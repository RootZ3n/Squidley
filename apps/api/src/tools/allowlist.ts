// apps/api/src/tools/allowlist.ts
//
// Allowlisted tools only (spawned with NO shell).
// runner.ts expects: argsPrefix, timeoutMs, maxOutputBytes.

export type AllowlistedTool = {
  id: string;
  title: string;

  // Executable name/path (spawned without a shell)
  cmd: string;

  // Static args that come BEFORE user args
  argsPrefix: string[];

  // Optional working directory
  cwd?: string;

  // Optional environment variables (merged onto process.env in runner)
  env?: Record<string, string>;

  // Safety limits
  timeoutMs: number;
  maxOutputBytes: number;
};

export type ToolAllowlist = Record<string, AllowlistedTool>;

const REPO_ROOT = "/media/zen/AI/squidley";

// Where we want Playwright to store downloaded browsers.
// Uses systemd/env override if present; otherwise falls back to your proven repo path.
const PLAYWRIGHT_BROWSERS_PATH =
  process.env.PLAYWRIGHT_BROWSERS_PATH || `${REPO_ROOT}/.playwright-browsers`;

// Sensible defaults (tight by default, loosen per-tool as needed)
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024; // 256 KB

export const TOOL_ALLOWLIST: ToolAllowlist = {
  "diag.sleep": {
    id: "diag.sleep",
    title: "diagnostics: sleep (no shell)",
    // Pure spawn-safe sleep via node (no bash, no sh)
    cmd: "node",
    argsPrefix: ["-e", "setTimeout(()=>process.exit(0), 1000)"],
    cwd: REPO_ROOT,
    timeoutMs: 5_000,
    maxOutputBytes: 16 * 1024
  },

  "git.status": {
    id: "git.status",
    title: "git status",
    cmd: "git",
    argsPrefix: ["status", "--porcelain=v1"],
    cwd: REPO_ROOT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES
  },

  "git.diff": {
    id: "git.diff",
    title: "git diff",
    cmd: "git",
    argsPrefix: ["diff"],
    cwd: REPO_ROOT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES
  },

  "git.log": {
    id: "git.log",
    title: "git log (last 20)",
    cmd: "git",
    argsPrefix: ["log", "-n", "20", "--oneline", "--decorate"],
    cwd: REPO_ROOT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES
  },

  "rg.search": {
    id: "rg.search",
    title: "ripgrep search",
    cmd: "rg",
    // runner will append user args like: [query, path]
    argsPrefix: ["-n"],
    cwd: REPO_ROOT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES
  },

  "web.build": {
    id: "web.build",
    title: "pnpm web build",
    cmd: "pnpm",
    argsPrefix: ["-C", "apps/web", "build"],
    cwd: REPO_ROOT,
    timeoutMs: 5 * 60_000, // builds can take longer
    maxOutputBytes: 512 * 1024
  },

  "web.pw": {
    id: "web.pw",
    title: "Playwright tests (apps/web)",
    cmd: "pnpm",
    argsPrefix: ["-C", "apps/web", "exec", "playwright", "test"],
    cwd: REPO_ROOT,
    env: {
      PLAYWRIGHT_BROWSERS_PATH
    },
    timeoutMs: 5 * 60_000,
    maxOutputBytes: 512 * 1024
  }
};

export function listTools(): { id: string; title: string }[] {
  return Object.values(TOOL_ALLOWLIST)
    .map((t) => ({ id: t.id, title: t.title }))
    .sort((a, b) => a.id.localeCompare(b.id));
}