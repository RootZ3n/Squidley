// apps/api/src/chat/resumeVersioner.ts
//
// Handles resume versioning — backs up before any update,
// tracks changelog, maintains version history.

import { readFile, writeFile, copyFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";

function resumeDir(): string {
  return path.resolve(process.env.ZENSQUID_ROOT ?? process.cwd(), "memory", "resume");
}

export async function backupResume(): Promise<string> {
  const src = path.join(resumeDir(), "base-resume.md");
  const versionsDir = path.join(resumeDir(), "versions");
  await mkdir(versionsDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const dest = path.join(versionsDir, `base-resume-${date}.md`);
  await copyFile(src, dest);
  return dest;
}

export async function updateResume(newContent: string): Promise<{ backup: string; updated: boolean }> {
  const backup = await backupResume();
  const dest = path.join(resumeDir(), "base-resume.md");
  await writeFile(dest, newContent, "utf8");
  return { backup, updated: true };
}

export async function listVersions(): Promise<string[]> {
  const versionsDir = path.join(resumeDir(), "versions");
  try {
    const files = await readdir(versionsDir);
    return files.filter(f => f.endsWith(".md")).sort().reverse();
  } catch { return []; }
}

export async function getVersion(filename: string): Promise<string> {
  const versionsDir = path.join(resumeDir(), "versions");
  return readFile(path.join(versionsDir, filename), "utf8");
}
