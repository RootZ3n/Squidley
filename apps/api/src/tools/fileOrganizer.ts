// apps/api/src/tools/fileOrganizer.ts
//
// Safe file organization tool.
// Always dry-runs first, requires explicit approval before moving anything.

import { readdir, stat, rename, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export type FileEntry = {
  path: string;
  name: string;
  ext: string;
  size: number;
  modified: Date;
  hash?: string;
  category?: string;
};

export type OrganizerPlan = {
  moves: Array<{ from: string; to: string; reason: string }>;
  duplicates: Array<{ files: string[]; hash: string }>;
  needsReview: Array<{ path: string; reason: string }>;
  summary: string;
};

// Category rules based on extension
const EXTENSION_CATEGORIES: Record<string, string> = {
  // Installers
  ".exe": "Software/Installers", ".deb": "Software/Installers",
  ".AppImage": "Software/Installers", ".rpm": "Software/Installers",
  ".dmg": "Software/Installers", ".msi": "Software/Installers",
  // Images
  ".jpg": "Pictures", ".jpeg": "Pictures", ".png": "Pictures",
  ".gif": "Pictures", ".webp": "Pictures", ".heic": "Pictures",
  ".svg": "Pictures", ".bmp": "Pictures",
  // Videos
  ".mp4": "Videos", ".mkv": "Videos", ".avi": "Videos",
  ".mov": "Videos", ".webm": "Videos",
  // Audio
  ".mp3": "Music", ".flac": "Music", ".wav": "Music", ".ogg": "Music",
  // Documents
  ".pdf": "Documents/PDFs", ".docx": "Documents/Word",
  ".xlsx": "Documents/Spreadsheets", ".pptx": "Documents/Presentations",
  ".txt": "Documents/Text", ".md": "Documents/Notes",
  // Archives
  ".zip": "Archives", ".tar": "Archives", ".gz": "Archives",
  ".7z": "Archives", ".rar": "Archives",
  // Code — never auto-move
  ".py": "__review__", ".ts": "__review__", ".js": "__review__",
  ".rs": "__review__", ".go": "__review__", ".cpp": "__review__",
  ".json": "__review__", ".toml": "__review__", ".yaml": "__review__",
};

async function hashFile(filepath: string): Promise<string> {
  try {
    const buf = await readFile(filepath);
    return crypto.createHash("md5").update(buf).digest("hex");
  } catch { return ""; }
}

export async function surveyDirectory(
  targetDir: string,
  maxFiles = 500
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  async function walk(dir: string, depth = 0): Promise<void> {
    if (depth > 4 || entries.length >= maxFiles) return;
    try {
      const items = await readdir(dir);
      for (const item of items) {
        if (entries.length >= maxFiles) break;
        // Skip hidden dirs and known system dirs
        if (item.startsWith(".") || item === "node_modules" || item === "__pycache__") continue;
        const full = path.join(dir, item);
        try {
          const s = await stat(full);
          if (s.isDirectory()) {
            await walk(full, depth + 1);
          } else {
            const ext = path.extname(item).toLowerCase();
            entries.push({
              path: full,
              name: item,
              ext,
              size: s.size,
              modified: s.mtime,
              category: EXTENSION_CATEGORIES[ext],
            });
          }
        } catch {}
      }
    } catch {}
  }

  await walk(targetDir);
  return entries;
}

export async function buildOrganizerPlan(
  entries: FileEntry[],
  baseDir: string
): Promise<OrganizerPlan> {
  const moves: OrganizerPlan["moves"] = [];
  const needsReview: OrganizerPlan["needsReview"] = [];
  const hashMap = new Map<string, string[]>();

  for (const entry of entries) {
    // Hash for duplicate detection (only files < 100MB)
    if (entry.size < 100 * 1024 * 1024 && entry.size > 0) {
      const h = await hashFile(entry.path);
      if (h) {
        entry.hash = h;
        const existing = hashMap.get(h) ?? [];
        existing.push(entry.path);
        hashMap.set(h, existing);
      }
    }

    if (!entry.category) {
      needsReview.push({ path: entry.path, reason: `Unknown extension: ${entry.ext}` });
    } else if (entry.category === "__review__") {
      needsReview.push({ path: entry.path, reason: `Code file — needs manual review` });
    } else {
      const dest = path.join(baseDir, entry.category, entry.name);
      if (dest !== entry.path) {
        moves.push({
          from: entry.path,
          to: dest,
          reason: `${entry.ext} → ${entry.category}`,
        });
      }
    }
  }

  const duplicates = Array.from(hashMap.entries())
    .filter(([, files]) => files.length > 1)
    .map(([hash, files]) => ({ hash, files }));

  const summary = [
    `Surveyed ${entries.length} files`,
    `${moves.length} auto-moves proposed`,
    `${needsReview.length} files need review`,
    `${duplicates.length} duplicate groups found`,
  ].join(", ");

  return { moves, duplicates, needsReview, summary };
}

export async function executeMoves(
  moves: Array<{ from: string; to: string }>,
  dryRun = true
): Promise<{ ok: boolean; moved: number; errors: string[] }> {
  const errors: string[] = [];
  let moved = 0;

  for (const { from, to } of moves) {
    try {
      if (!dryRun) {
        await mkdir(path.dirname(to), { recursive: true });
        await rename(from, to);
      }
      moved++;
    } catch (e: any) {
      errors.push(`${from} → ${to}: ${e.message}`);
    }
  }

  return { ok: errors.length === 0, moved, errors };
}
