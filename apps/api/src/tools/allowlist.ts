// apps/api/src/tools/allowlist.ts
//
// Single source of truth for all allowlisted tools.
// Every tool here is spawned with shell: false by runner.ts.
// To add a new tool: add an entry here, handle it in runner.ts.

export type AllowlistedTool = {
  id: string;
  title: string;
  cmd: string;
  argsPrefix: string[];
  cwd?: string;
  env?: Record<string, string>;
  requiresAdmin?: boolean;
  timeoutMs: number;
  maxOutputBytes: number;
};

export type ToolAllowlist = Record<string, AllowlistedTool>;

function getRepoRoot(): string {
  return process.env.ZENSQUID_ROOT ?? process.cwd();
}

function getPlaywrightBrowsersPath(): string {
  return (
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    `${getRepoRoot()}/.playwright-browsers`
  );
}

function getSearxngUrl(): string {
  const raw = process.env.ZENSQUID_SEARXNG_URL ?? process.env.SEARXNG_URL ?? "http://127.0.0.1:8080";
  return String(raw).trim().replace(/\/+$/, "");
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;

export const TOOL_ALLOWLIST: ToolAllowlist = {

  // ── Diagnostics ────────────────────────────────────────────────────────────

  "diag.sleep": {
    id: "diag.sleep",
    title: "Diagnostics: sleep (no shell)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    timeoutMs: 5_000,
    maxOutputBytes: 16 * 1024,
  },

  // ── Git ────────────────────────────────────────────────────────────────────

  "git.status": {
    id: "git.status",
    title: "Git: repo status",
    cmd: "git",
    argsPrefix: ["status", "--porcelain=v1"],
    get cwd() { return getRepoRoot(); },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  },

  "git.diff": {
    id: "git.diff",
    title: "Git: diff",
    cmd: "git",
    argsPrefix: ["diff"],
    get cwd() { return getRepoRoot(); },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  },

  "git.log": {
    id: "git.log",
    title: "Git: log (last 20)",
    cmd: "git",
    argsPrefix: ["log", "-n", "20", "--oneline", "--decorate"],
    get cwd() { return getRepoRoot(); },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  },

  // ── Search ─────────────────────────────────────────────────────────────────

  "rg.search": {
    id: "rg.search",
    title: "Ripgrep: search codebase",
    cmd: "rg",
    argsPrefix: ["-n", "--no-heading", "--color", "never"],
    get cwd() { return getRepoRoot(); },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  },

  "web.search": {
    id: "web.search",
    title: "Web: search via SearXNG (local)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    timeoutMs: 20_000,
    maxOutputBytes: 512 * 1024,
  },

  // ── Job application ───────────────────────────────────────────────────────

  "job.detect-form": {
    id: "job.detect-form",
    title: "Job Apply: detect form fields on application page (read-only)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    timeoutMs: 30_000,
    maxOutputBytes: 512 * 1024,
  },

  "job.fill-form": {
    id: "job.fill-form",
    title: "Job Apply: fill application form fields (requires approval, never auto-submits)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    timeoutMs: 60_000,
    maxOutputBytes: 512 * 1024,
  },

  // ── File organizer ────────────────────────────────────────────────────────

  "fs.survey": {
    id: "fs.survey",
    title: "File System: survey a directory and build organization plan (read-only)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    timeoutMs: 60_000,
    maxOutputBytes: 512 * 1024,
  },

  "fs.organize": {
    id: "fs.organize",
    title: "File System: execute approved file moves (requires approval)",
    cmd: "__js__",
    argsPrefix: [],
    requiresAdmin: false,
    get cwd() { return getRepoRoot(); },
    timeoutMs: 60_000,
    maxOutputBytes: 512 * 1024,
  },

  // ── Filesystem read/write (admin-gated) ───────────────────────────────────

  "fs.read": {
    id: "fs.read",
    title: "File: read (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 10_000,
    maxOutputBytes: 512 * 1024,
  },

  "fs.write": {
    id: "fs.write",
    title: "File: write (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 10_000,
    maxOutputBytes: 64 * 1024,
  },

  // ── Filesystem expanded (admin-gated) ─────────────────────────────────────

  "fs.mkdir": {
    id: "fs.mkdir",
    title: "File System: create directory (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 10_000,
    maxOutputBytes: 64 * 1024,
  },

  "fs.move": {
    id: "fs.move",
    title: "File System: move or rename file/directory (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 10_000,
    maxOutputBytes: 64 * 1024,
  },

  "fs.delete": {
    id: "fs.delete",
    title: "File System: delete file or empty directory (admin, no recursive)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 10_000,
    maxOutputBytes: 64 * 1024,
  },

  "fs.diff": {
    id: "fs.diff",
    title: "File System: diff two files (read-only)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: false,
    timeoutMs: 10_000,
    maxOutputBytes: 256 * 1024,
  },

  "fs.tree": {
    id: "fs.tree",
    title: "File System: directory tree (read-only)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: false,
    timeoutMs: 10_000,
    maxOutputBytes: 256 * 1024,
  },

  // ── Browser control ───────────────────────────────────────────────────────

  "browser.visit": {
    id: "browser.visit",
    title: "Browser: visit URL and extract text (read-only)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    timeoutMs: 30_000,
    maxOutputBytes: 512 * 1024,
  },

  "browser.extract": {
    id: "browser.extract",
    title: "Browser: extract structured content from URL (read-only)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    timeoutMs: 30_000,
    maxOutputBytes: 512 * 1024,
  },

  "browser.search": {
    id: "browser.search",
    title: "Browser: search Google and return results (read-only)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    timeoutMs: 30_000,
    maxOutputBytes: 512 * 1024,
  },

  "browser.screenshot": {
    id: "browser.screenshot",
    title: "Browser: screenshot a URL (read-only, saves to memory/screenshots/)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    timeoutMs: 30_000,
    maxOutputBytes: 512 * 1024,
  },

  // ── Build + Test ──────────────────────────────────────────────────────────

  "web.build": {
    id: "web.build",
    title: "Build: web UI (Next.js)",
    cmd: "pnpm",
    argsPrefix: ["-C", "apps/web", "build"],
    get cwd() { return getRepoRoot(); },
    timeoutMs: 5 * 60_000,
    maxOutputBytes: 512 * 1024,
  },

  "web.pw": {
    id: "web.pw",
    title: "Test: Playwright (apps/web)",
    cmd: "pnpm",
    argsPrefix: ["-C", "apps/web", "exec", "playwright", "test"],
    get cwd() { return getRepoRoot(); },
    get env() {
      return { PLAYWRIGHT_BROWSERS_PATH: getPlaywrightBrowsersPath() };
    },
    timeoutMs: 5 * 60_000,
    maxOutputBytes: 512 * 1024,
  },

  // ── Process execution (admin-gated) ───────────────────────────────────────

  "proc.exec": {
    id: "proc.exec",
    title: "Exec: run command (admin, no shell)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 5 * 60_000,
    maxOutputBytes: 512 * 1024,
  },

  // ── Systemd (admin-gated) ─────────────────────────────────────────────────

  "systemctl.user": {
    id: "systemctl.user",
    title: "Systemd: user service control (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 30_000,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  },

  // ── Process management (admin-gated) ──────────────────────────────────────

  "proc.list": {
    id: "proc.list",
    title: "Process: list running processes (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 10_000,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  },

  "proc.kill": {
    id: "proc.kill",
    title: "Process: kill a process by PID (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 10_000,
    maxOutputBytes: 64 * 1024,
  },

  // ── Systemd status (read-only) ────────────────────────────────────────────

  "systemctl.status": {
    id: "systemctl.status",
    title: "Systemd: check service status (read-only)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: false,
    timeoutMs: 10_000,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  },

  // ── Environment (admin-gated) ─────────────────────────────────────────────

  "env.read": {
    id: "env.read",
    title: "Environment: read specific env vars by name (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 5_000,
    maxOutputBytes: 64 * 1024,
  },

  // ── Network (admin-gated) ─────────────────────────────────────────────────

  "http.get": {
    id: "http.get",
    title: "Network: HTTP GET request (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 30_000,
    maxOutputBytes: 512 * 1024,
  },

  "http.post": {
    id: "http.post",
    title: "Network: HTTP POST request (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 30_000,
    maxOutputBytes: 512 * 1024,
  },

  "dns.lookup": {
    id: "dns.lookup",
    title: "Network: DNS lookup (read-only)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: false,
    timeoutMs: 10_000,
    maxOutputBytes: 64 * 1024,
  },

  // ── Git write (admin-gated) ───────────────────────────────────────────────

  "git.add": {
    id: "git.add",
    title: "Git: stage files (admin)",
    cmd: "git",
    argsPrefix: ["add"],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  },

  "git.commit": {
    id: "git.commit",
    title: "Git: commit staged changes (admin)",
    cmd: "git",
    argsPrefix: ["commit", "-m"],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  },

  "git.push": {
    id: "git.push",
    title: "Git: push to remote (admin)",
    cmd: "git",
    argsPrefix: ["push"],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 60_000,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  },

  // ── Dev tools ─────────────────────────────────────────────────────────────

  "pnpm.run": {
    id: "pnpm.run",
    title: "pnpm: run a script in a workspace package (admin)",
    cmd: "pnpm",
    argsPrefix: ["run"],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 5 * 60_000,
    maxOutputBytes: 512 * 1024,
  },

  "lint.check": {
    id: "lint.check",
    title: "Lint: run TypeScript type check (read-only)",
    cmd: "pnpm",
    argsPrefix: ["-C", "apps/api", "exec", "tsc", "--noEmit", "--pretty"],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: false,
    timeoutMs: 2 * 60_000,
    maxOutputBytes: 512 * 1024,
  },

  "test.run": {
    id: "test.run",
    title: "Test: run Playwright or vitest tests (admin)",
    cmd: "pnpm",
    argsPrefix: ["test"],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 5 * 60_000,
    maxOutputBytes: 512 * 1024,
  },

  // ── Ollama (local AI) ─────────────────────────────────────────────────────

  "ollama.list": {
    id: "ollama.list",
    title: "Ollama: list downloaded models (read-only)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: false,
    timeoutMs: 10_000,
    maxOutputBytes: 128 * 1024,
  },

  "ollama.pull": {
    id: "ollama.pull",
    title: "Ollama: pull a model (admin, long-running)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 30 * 60_000, // 30 min — large models take time
    maxOutputBytes: 128 * 1024,
  },
// ── ComfyUI ───────────────────────────────────────────────────────────────
  "comfyui.status": {
    id: "comfyui.status",
    title: "ComfyUI: check if server is running (read-only)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: false,
    timeoutMs: 10_000,
    maxOutputBytes: 16 * 1024,
  },
  "comfyui.start": {
    id: "comfyui.start",
    title: "ComfyUI: start the image generation server (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 30_000,
    maxOutputBytes: 16 * 1024,
  },
  "comfyui.stop": {
    id: "comfyui.stop",
    title: "ComfyUI: stop the image generation server (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 15_000,
    maxOutputBytes: 16 * 1024,
  },
  "comfyui.generate": {
    id: "comfyui.generate",
    title: "ComfyUI: generate an image from a prompt (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 5 * 60_000, // 5 min — large images can take time
    maxOutputBytes: 256 * 1024,
  },
  
  // ── Skill security ────────────────────────────────────────────────────────

  "skill.scan": {
    id: "skill.scan",
    title: "Skill: security scan a skill file (read-only)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: false,
    timeoutMs: 30_000,
    maxOutputBytes: 128 * 1024,
  },

  "skill.quarantine": {
    id: "skill.quarantine",
    title: "Skill: move a skill to quarantine (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 10_000,
    maxOutputBytes: 64 * 1024,
  },

  "skill.build": {
    id: "skill.build",
    title: "Skill: draft, scan, and write a new skill file (admin)",
    cmd: "__js__",
    argsPrefix: [],
    get cwd() { return getRepoRoot(); },
    requiresAdmin: true,
    timeoutMs: 60_000,
    maxOutputBytes: 128 * 1024,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function listTools(includeAdmin = false): { id: string; title: string }[] {
  return Object.values(TOOL_ALLOWLIST)
    .filter((t) => includeAdmin || !t.requiresAdmin)
    .map((t) => ({ id: t.id, title: t.title }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getSearxngBaseUrl(): string {
  return getSearxngUrl();
}
