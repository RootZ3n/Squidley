// apps/api/src/chat/contextBuilder.ts
//
// Builds a compact workspace snapshot injected into Squidley's system prompt.
// Gives her awareness of: repo structure, git state, available skills, active thread.
// All operations are best-effort — never throws, never blocks the request.

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function zensquidRoot(): string {
  return process.env.ZENSQUID_ROOT ?? process.cwd();
}

function threadsDir(): string {
  return path.resolve(zensquidRoot(), "memory", "threads");
}

function skillsDir(): string {
  return path.resolve(zensquidRoot(), "skills");
}

// ── Git context ───────────────────────────────────────────────────────────────

async function getGitBranch(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: zensquidRoot(),
      timeout: 3000,
    });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

async function getLastCommit(): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "-1", "--pretty=format:%h %s (%cr)"],
      { cwd: zensquidRoot(), timeout: 3000 }
    );
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

async function getGitStatus(): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["status", "--short"],
      { cwd: zensquidRoot(), timeout: 3000 }
    );
    const lines = stdout.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return "clean";
    if (lines.length > 8) return `${lines.length} modified/untracked files`;
    return lines.join(", ");
  } catch {
    return "unknown";
  }
}

// ── Directory structure ───────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", ".next", "build", "coverage",
  ".turbo", ".cache", "tmp", ".pnpm", "__pycache__"
]);

async function buildDirTree(dir: string, depth: number, maxDepth: number): Promise<string[]> {
  if (depth > maxDepth) return [];
  const lines: string[] = [];
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })) as import("node:fs").Dirent[];
  } catch {
    return [];
  }

  const indent = "  ".repeat(depth);
  const dirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith("."));
  const files = entries.filter((e) => e.isFile() && !e.name.startsWith("."));

  for (const d of dirs.slice(0, 12)) {
    lines.push(`${indent}${d.name}/`);
    const children = await buildDirTree(path.join(dir, d.name), depth + 1, maxDepth);
    lines.push(...children);
  }
  for (const f of files.slice(0, 8)) {
    lines.push(`${indent}${f.name}`);
  }
  return lines;
}

async function getRepoMap(): Promise<string> {
  try {
    const root = zensquidRoot();
    const lines = await buildDirTree(root, 0, 2);
    return lines.slice(0, 60).join("\n");
  } catch {
    return "unavailable";
  }
}

// ── Skills index ──────────────────────────────────────────────────────────────

async function getSkillsList(): Promise<string> {
  try {
    const dir = skillsDir();
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const skills: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const fp = path.join(dir, e.name, "skill.md");
      try {
        const raw = await fs.readFile(fp, "utf8");
        const lines = raw.split("\n");
        // Prefer "# Skill: <name>" title over folder name
        const titleLine = lines.find((l) => l.startsWith("# Skill:"));
        const title = titleLine ? titleLine.replace("# Skill:", "").trim() : e.name;
        // Get purpose — first non-empty line after "## Purpose"
        const purposeIdx = lines.findIndex((l) => l.startsWith("## Purpose"));
        const purpose = purposeIdx >= 0
          ? lines.slice(purposeIdx + 1).find((l) => l.trim().length > 0)?.trim().slice(0, 100) ?? ""
          : "";
        skills.push(`- ${title}${purpose ? `: ${purpose}` : ""}`);
      } catch {
        skills.push(`- ${e.name}`);
      }
    }
    return skills.length > 0 ? skills.join("\n") : "none";
  } catch {
    return "none";
  }
}

// ── Active thread ─────────────────────────────────────────────────────────────

async function getActiveThread(): Promise<string> {
  try {
    const activeFp = path.join(threadsDir(), "_active.txt");
    const activeId = (await fs.readFile(activeFp, "utf8")).trim().split("\n")[0]?.trim();
    if (!activeId) return "none";

    const threadFp = path.join(threadsDir(), `${activeId}.json`);
    const raw = await fs.readFile(threadFp, "utf8");
    const thread = JSON.parse(raw);

    const lines: string[] = [];
    lines.push(`id: ${thread.thread_id}`);
    lines.push(`title: ${thread.title}`);
    if (thread.summary) lines.push(`summary: ${thread.summary.slice(0, 200)}`);
    if (Array.isArray(thread.open_loops) && thread.open_loops.length > 0) {
      lines.push("open_loops:");
      for (const l of thread.open_loops.slice(0, 4)) {
        lines.push(`  - ${l}`);
      }
    }
    return lines.join("\n");
  } catch {
    return "none";
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export type WorkspaceContext = {
  branch: string;
  last_commit: string;
  git_status: string;
  repo_map: string;
  skills: string;
  agents: string;
  active_thread: string;
};

// ── Agents index ──────────────────────────────────────────────────────────────

async function getAgentsList(): Promise<string> {
  try {
    const dir = path.resolve(zensquidRoot(), "agents");
    const entries = await fs.readdir(dir, { withFileTypes: true }) as import("node:fs").Dirent[];
    const agents: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const fp = path.resolve(dir, e.name, "agent.md");
      try {
        const raw = await fs.readFile(fp, "utf8");
        const roleMatch = raw.match(/^## Role\s*\n([\s\S]*?)(?=\n## |\n# |$)/m);
        const role = roleMatch?.[1]?.trim().split("\n")[0]?.slice(0, 80) ?? "";
        agents.push(`- ${e.name}${role ? `: ${role}` : ""}`);
      } catch {
        agents.push(`- ${e.name}`);
      }
    }
    return agents.length > 0 ? agents.join("\n") : "none";
  } catch {
    return "none";
  }
}

export async function buildWorkspaceContext(): Promise<WorkspaceContext> {
  const [branch, last_commit, git_status, repo_map, skills, agents, active_thread] = await Promise.all([
    getGitBranch(),
    getLastCommit(),
    getGitStatus(),
    getRepoMap(),
    getSkillsList(),
    getAgentsList(),
    getActiveThread(),
  ]);

  return { branch, last_commit, git_status, repo_map, skills, agents, active_thread };
}

export function formatWorkspaceContext(ctx: WorkspaceContext): string {
  const lines: string[] = [];
  lines.push("# WORKSPACE CONTEXT");
  lines.push("");
  lines.push("## Git");
  lines.push(`- branch: ${ctx.branch}`);
  lines.push(`- last commit: ${ctx.last_commit}`);
  lines.push(`- status: ${ctx.git_status}`);
  lines.push("");
  lines.push("## Repo structure");
  lines.push("```");
  lines.push(ctx.repo_map);
  lines.push("```");
  lines.push("");
  lines.push("## Available skills");
  lines.push(ctx.skills);
  lines.push("");
  lines.push("## Available agents");
  lines.push(ctx.agents);
  lines.push("");
  lines.push("## Active thread");
  lines.push(ctx.active_thread);
  return lines.join("\n");
}
