// apps/api/src/tools/allowlist.ts
//
// Single source of truth for all allowlisted tools.
// Every tool here is spawned with shell: false by runner.ts.
// To add a new tool: add an entry here, handle it in runner.ts.

export type AllowlistedTool = {
  id: string;
  title: string;

  // "__js__" = internal JS handler (no subprocess)
  // "__admin__" = requires admin token (checked by runner before exec)
  // anything else = executable name spawned directly
  cmd: string;

  // Static args that come BEFORE user args
  argsPrefix: string[];

  // Optional working directory override
  cwd?: string;

  // Optional environment variables merged onto process.env
  env?: Record<string, string>;

  // Whether admin token is required to run this tool
  requiresAdmin?: boolean;

  // Safety limits
  timeoutMs: number;
  maxOutputBytes: number;
};

export type ToolAllowlist = Record<string, AllowlistedTool>;

// ✅ Resolved at runtime — works on any machine
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
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024; // 256 KB

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

  // ── Job application ──────────────────────────────────────────────────────
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
  // ── File organizer ───────────────────────────────────────────────────────
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
  // ── Browser control ──────────────────────────────────────────────────────
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
  // ── Build + Test ───────────────────────────────────────────────────────────

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

  // ── Filesystem (admin-gated) ───────────────────────────────────────────────

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
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function listTools(includeAdmin = false): { id: string; title: string }[] {
  return Object.values(TOOL_ALLOWLIST)
    .filter((t) => includeAdmin || !t.requiresAdmin)
    .map((t) => ({ id: t.id, title: t.title }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getSearxngBaseUrl(): string {
  return getSearxngUrl();
}
