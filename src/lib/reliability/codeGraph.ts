/**
 * Code graph scaffold.
 *
 * A *very* small, future-facing code graph. The goal of this module is
 * NOT to be a full TypeScript indexer — it is to give the reliability
 * runner one cheap way to answer "which file is likely relevant?"
 * without dumping the whole repository into a prompt.
 *
 * Hard constraints:
 *   - Ignore heavy dirs (`node_modules`, `.git`, `.next`, `dist`, etc.)
 *   - Skip files above `maxFileBytes` — we never parse a giant file.
 *   - Use conservative regex only. We do not pretend to be a real parser.
 *   - Honest about limits: if a file is skipped, the graph records why.
 */

export type CodeGraphNodeKind =
  | "file"
  | "function"
  | "class"
  | "route"
  | "component"
  | "unknown";

export interface CodeGraphNode {
  readonly id: string;
  readonly path: string;
  readonly kind: CodeGraphNodeKind;
  readonly name: string;
  readonly exports: readonly string[];
  readonly imports: readonly string[];
  readonly calls: readonly string[];
  readonly summary: string;
}

export interface CodeGraphSummary {
  readonly nodes: readonly CodeGraphNode[];
  readonly skipped: readonly { path: string; reason: string }[];
  readonly indexedAt: number;
}

export interface CodeGraphQuery {
  readonly question: string;
  readonly relevantPaths?: readonly string[];
  readonly symbols?: readonly string[];
  readonly maxResults?: number;
}

export interface CodeGraphIndexer {
  readDir(path: string): Promise<readonly { name: string; isDirectory: boolean; size?: number }[]>;
  readFile(path: string): Promise<string>;
}

export interface CodeGraphIndexOptions {
  readonly rootPath: string;
  readonly maxFileBytes?: number;
  readonly maxNodes?: number;
  readonly now?: number;
}

export const HEAVY_DIRS_TO_IGNORE: readonly string[] = [
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  "out",
  ".cache",
  ".turbo",
  ".vercel",
  "tmp",
];

const DEFAULT_MAX_FILE_BYTES = 64 * 1024;
const DEFAULT_MAX_NODES = 1000;
const INDEXABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function hasIndexableExtension(name: string): boolean {
  return INDEXABLE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function joinPath(parent: string, name: string): string {
  if (parent.endsWith("/")) return `${parent}${name}`;
  return `${parent}/${name}`;
}

function kindForFile(path: string, exports: readonly string[]): CodeGraphNodeKind {
  if (/route\.(t|j)sx?$/.test(path)) return "route";
  if (/Component|component/.test(path)) return "component";
  if (/\.tsx$/.test(path) && exports.some((e) => /^[A-Z]/.test(e))) return "component";
  return "file";
}

function scanForSymbols(body: string): {
  exports: string[];
  imports: string[];
  calls: string[];
} {
  const exports = new Set<string>();
  const imports = new Set<string>();
  const calls = new Set<string>();

  const exportRe = /^\s*export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  const reExportRe = /^\s*export\s*\{\s*([^}]+)\s*\}/gm;
  const importRe = /^\s*import\s+(?:.*?)from\s+["']([^"']+)["']/gm;
  const callRe = /\b([A-Za-z_$][\w$]{2,})\s*\(/g;

  for (const match of body.matchAll(exportRe)) {
    if (match[1]) exports.add(match[1]);
  }
  for (const match of body.matchAll(reExportRe)) {
    for (const piece of (match[1] ?? "").split(",")) {
      const name = piece.trim().split(/\s+as\s+/i).pop()?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) exports.add(name);
    }
  }
  for (const match of body.matchAll(importRe)) {
    if (match[1]) imports.add(match[1]);
  }
  for (const match of body.matchAll(callRe)) {
    const name = match[1];
    if (!name) continue;
    // Skip syntax-noise pseudo-calls like "if", "for", "while", "switch".
    if (
      ["if", "for", "while", "switch", "return", "function", "catch", "await", "yield", "typeof"].includes(
        name,
      )
    ) {
      continue;
    }
    calls.add(name);
    if (calls.size > 30) break; // hard cap for cheapness
  }

  return {
    exports: [...exports],
    imports: [...imports],
    calls: [...calls],
  };
}

export async function indexCodeGraph(
  indexer: CodeGraphIndexer,
  options: CodeGraphIndexOptions,
): Promise<CodeGraphSummary> {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const indexedAt = options.now ?? Date.now();

  const nodes: CodeGraphNode[] = [];
  const skipped: { path: string; reason: string }[] = [];

  async function walk(path: string, depth: number): Promise<void> {
    if (depth > 8) return;
    if (nodes.length >= maxNodes) return;

    let entries: readonly { name: string; isDirectory: boolean; size?: number }[] = [];
    try {
      entries = await indexer.readDir(path);
    } catch (err) {
      skipped.push({
        path,
        reason: err instanceof Error ? `readdir: ${err.message}` : "readdir failed",
      });
      return;
    }

    for (const entry of entries) {
      if (nodes.length >= maxNodes) return;
      if (HEAVY_DIRS_TO_IGNORE.includes(entry.name)) {
        skipped.push({ path: joinPath(path, entry.name), reason: "heavy-dir-ignored" });
        continue;
      }
      // Skip dotfiles/dotdirs except a couple of common ones.
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

      const childPath = joinPath(path, entry.name);
      if (entry.isDirectory) {
        await walk(childPath, depth + 1);
        continue;
      }
      if (!hasIndexableExtension(entry.name)) continue;
      if (typeof entry.size === "number" && entry.size > maxFileBytes) {
        skipped.push({ path: childPath, reason: `too-large (${entry.size}b)` });
        continue;
      }

      let body: string;
      try {
        body = await indexer.readFile(childPath);
      } catch (err) {
        skipped.push({
          path: childPath,
          reason: err instanceof Error ? `readfile: ${err.message}` : "readfile failed",
        });
        continue;
      }
      if (body.length > maxFileBytes) {
        skipped.push({ path: childPath, reason: `too-large-after-read (${body.length}b)` });
        continue;
      }

      const symbols = scanForSymbols(body);
      const kind = kindForFile(childPath, symbols.exports);
      const fileName = entry.name.replace(/\.[^.]+$/, "");
      const summary = `${kind} with ${symbols.exports.length} exports, ${symbols.imports.length} imports.`;
      nodes.push({
        id: `node-${nodes.length}-${fileName}`,
        path: childPath,
        kind,
        name: fileName,
        exports: symbols.exports,
        imports: symbols.imports,
        calls: symbols.calls,
        summary,
      });
    }
  }

  await walk(options.rootPath, 0);

  return { nodes, skipped, indexedAt };
}

/**
 * Cheap relevance scorer: returns nodes whose path or exports best match
 * the query. No semantic search — we just look for substring matches in
 * paths, exports, and imports.
 */
export function queryCodeGraph(
  summary: CodeGraphSummary,
  query: CodeGraphQuery,
): readonly CodeGraphNode[] {
  const max = query.maxResults ?? 10;
  const needles = [
    ...(query.relevantPaths ?? []),
    ...(query.symbols ?? []),
    ...query.question.split(/\s+/).filter((w) => w.length > 2),
  ].map((s) => s.toLowerCase());

  if (needles.length === 0) return summary.nodes.slice(0, max);

  const scored = summary.nodes.map((node) => {
    let score = 0;
    const haystack = (
      node.path + " " + node.exports.join(" ") + " " + node.imports.join(" ")
    ).toLowerCase();
    for (const needle of needles) {
      if (haystack.includes(needle)) score++;
    }
    return { node, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.node);
}
