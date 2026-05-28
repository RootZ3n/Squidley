/**
 * Path & extension safety for approval-gated file inspection.
 *
 * Pure: no IO. Tests can run without a filesystem. The orchestrator
 * combines these checks with an injected reader to actually fetch the
 * file contents.
 *
 * Hard rules enforced here:
 *   - resolved path MUST be inside the configured project root.
 *   - traversal sequences ('..') are rejected before resolution.
 *   - absolute paths outside root are rejected.
 *   - dotfiles / secret / key / cert filenames are blocked outright.
 *   - heavy / build dirs are blocked (node_modules, .git, dist, etc.).
 *   - only allow-listed extensions are inspectable.
 *   - files above MAX_INSPECT_FILE_BYTES are blocked, not silently
 *     truncated.
 */

export const MAX_INSPECT_FILE_BYTES = 256 * 1024; // 256 KB

export const ALLOWED_INSPECT_EXTENSIONS: readonly string[] = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mdx",
  ".css",
  ".scss",
  ".html",
  ".yml",
  ".yaml",
  ".txt",
] as const;

export const BLOCKED_DIR_SEGMENTS: readonly string[] = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  "out",
  ".cache",
  ".turbo",
  ".vercel",
  "tmp",
  ".pnpm-store",
  ".yarn",
] as const;

/**
 * Filename / basename patterns we refuse to read regardless of extension
 * or location. Files matching any of these are treated as "blocked", not
 * "redacted" — we don't even open them.
 */
export const BLOCKED_BASENAME_PATTERNS: readonly RegExp[] = [
  /^\.env(\..+)?$/i,
  /^\.npmrc$/i,
  /^\.yarnrc(\..+)?$/i,
  /^\.netrc$/i,
  /^\.htpasswd$/i,
  /^\.aws$/i,
  /^aws[-_]?credentials$/i,
  /^id_rsa(\..+)?$/i,
  /^id_ed25519(\..+)?$/i,
  /^id_dsa(\..+)?$/i,
  /^id_ecdsa(\..+)?$/i,
  /^.*\.pem$/i,
  /^.*\.key$/i,
  /^.*\.cer$/i,
  /^.*\.crt$/i,
  /^.*\.p12$/i,
  /^.*\.pfx$/i,
  /^.*\.keystore$/i,
  /^known_hosts$/i,
  /^authorized_keys$/i,
  /^secrets?(\..+)?$/i,
  /^credentials?(\..+)?$/i,
  /^.*\.lock$/i, // lockfiles aren't secret but blocking saves budget
];

export type PathSafetyReason =
  | "empty-path"
  | "traversal-rejected"
  | "absolute-outside-root"
  | "outside-root-after-resolve"
  | "blocked-dir-segment"
  | "blocked-basename"
  | "extension-not-allowed"
  | "file-too-large"
  | "not-a-string";

export interface PathSafetyOk {
  readonly ok: true;
  /** Cleaned path RELATIVE to projectRoot (no leading ./), POSIX separators. */
  readonly relativePath: string;
  /** Absolute resolved path — use this to actually read the file. */
  readonly absolutePath: string;
  /** Basename of the file (no directories). */
  readonly basename: string;
  /** Lowercased extension including the dot. */
  readonly extension: string;
}

export interface PathSafetyError {
  readonly ok: false;
  readonly reason: PathSafetyReason;
  readonly detail: string;
}

export type PathSafetyResult = PathSafetyOk | PathSafetyError;

export interface CheckPathOptions {
  /** Absolute, normalized project root. Required. No trailing slash. */
  readonly projectRoot: string;
  /** Optional file size to enforce against MAX_INSPECT_FILE_BYTES. */
  readonly fileSize?: number;
  /** Override the maximum size. Tests may use this. */
  readonly maxBytes?: number;
}

const POSIX_SEP_RE = /\\+/g;

function toPosix(path: string): string {
  return path.replace(POSIX_SEP_RE, "/");
}

function normalize(path: string): string {
  // Conservative POSIX-only normalization: collapse '/./', remove
  // trailing slashes, collapse repeated '/'. We do NOT collapse '..'
  // because we treat it as a hard reject signal.
  const cleaned = toPosix(path)
    .replace(/\/+/g, "/")
    .replace(/\/\.\//g, "/")
    .replace(/^\.\//, "");
  return cleaned.endsWith("/") && cleaned.length > 1
    ? cleaned.slice(0, -1)
    : cleaned;
}

function lastSegment(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

function lowerExtension(name: string): string {
  const i = name.lastIndexOf(".");
  if (i === -1) return "";
  return name.slice(i).toLowerCase();
}

function fail(reason: PathSafetyReason, detail: string): PathSafetyError {
  return { ok: false, reason, detail };
}

/**
 * Validate a user-supplied path against all safety rules.
 *
 * The projectRoot must be supplied by the caller — this module never
 * inspects environment variables on its own. The route resolves env →
 * projectRoot once.
 */
export function checkInspectPath(
  rawPath: unknown,
  options: CheckPathOptions,
): PathSafetyResult {
  if (typeof rawPath !== "string") {
    return fail("not-a-string", "Path must be a string.");
  }
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) {
    return fail("empty-path", "Path is empty.");
  }

  // Reject traversal early. We never want to see ".." anywhere in the
  // request, even if normalization would clean it up.
  if (trimmed.includes("..")) {
    return fail(
      "traversal-rejected",
      "Paths with '..' are refused, even if they would resolve inside the root.",
    );
  }

  const projectRoot = normalize(options.projectRoot);
  if (!projectRoot.startsWith("/")) {
    return fail(
      "outside-root-after-resolve",
      "Project root must be an absolute path.",
    );
  }

  const posix = toPosix(trimmed);
  let absolute: string;
  if (posix.startsWith("/")) {
    // Absolute path: must be exactly inside projectRoot.
    const normalized = normalize(posix);
    if (
      normalized !== projectRoot &&
      !normalized.startsWith(`${projectRoot}/`)
    ) {
      return fail(
        "absolute-outside-root",
        "Absolute paths must be inside the configured project root.",
      );
    }
    absolute = normalized;
  } else {
    absolute = normalize(`${projectRoot}/${posix}`);
  }

  // Defence-in-depth: even after normalization, confirm absolute path
  // lies under projectRoot. (Catches sneaky inputs like "..foo".)
  if (
    absolute !== projectRoot &&
    !absolute.startsWith(`${projectRoot}/`)
  ) {
    return fail(
      "outside-root-after-resolve",
      "Resolved path is outside the project root.",
    );
  }

  // Walk path segments looking for blocked dirs.
  const relative = absolute === projectRoot ? "" : absolute.slice(projectRoot.length + 1);
  const segments = relative.split("/").filter((s) => s.length > 0);
  for (const segment of segments) {
    if (BLOCKED_DIR_SEGMENTS.includes(segment)) {
      return fail(
        "blocked-dir-segment",
        `Refusing to inspect inside '${segment}'.`,
      );
    }
  }

  const basename = lastSegment(absolute);
  if (basename.length === 0) {
    return fail("empty-path", "Path does not name a file.");
  }
  for (const pattern of BLOCKED_BASENAME_PATTERNS) {
    if (pattern.test(basename)) {
      return fail(
        "blocked-basename",
        `Refusing to inspect '${basename}' — likely contains secrets or credentials.`,
      );
    }
  }

  const extension = lowerExtension(basename);
  if (!ALLOWED_INSPECT_EXTENSIONS.includes(extension)) {
    return fail(
      "extension-not-allowed",
      `Peh only inspects source/doc files (${ALLOWED_INSPECT_EXTENSIONS.join(", ")}).`,
    );
  }

  const maxBytes = options.maxBytes ?? MAX_INSPECT_FILE_BYTES;
  if (typeof options.fileSize === "number" && options.fileSize > maxBytes) {
    return fail(
      "file-too-large",
      `File is ${options.fileSize} bytes; limit is ${maxBytes}.`,
    );
  }

  return {
    ok: true,
    relativePath: relative,
    absolutePath: absolute,
    basename,
    extension,
  };
}

/**
 * Convenience: list the human-readable rules so the UI / approval card
 * can render them honestly.
 */
export const FILE_INSPECTION_SAFETY_RULES: readonly string[] = [
  "Only files inside the configured project root may be read.",
  "Paths containing '..' are always refused.",
  `Only these extensions are allowed: ${ALLOWED_INSPECT_EXTENSIONS.join(", ")}.`,
  ".env, credentials, keys, certificates, and ssh files are never opened.",
  `node_modules, .git, .next, dist, build, coverage, out, .cache, .turbo, .vercel, and tmp are never traversed.`,
  `Files larger than ${MAX_INSPECT_FILE_BYTES} bytes are refused, never silently truncated.`,
];
