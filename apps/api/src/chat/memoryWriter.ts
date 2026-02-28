// apps/api/src/chat/memoryWriter.ts
//
// Auto-writes thread summaries after Squidley analyzes tool output.
// Called after git.log, git.diff, git.status analysis returns.
// Writes to memory/threads/<thread_id>.json and updates _active.txt.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export type ThreadEntry = {
  thread_id: string;
  title: string;
  status: "active" | "closed";
  tags: string[];
  summary: string;
  open_loops: string[];
  last_touched: string;
};

function zensquidRoot(): string {
  return process.env.ZENSQUID_ROOT ?? process.cwd();
}

function threadsDir(): string {
  return path.resolve(zensquidRoot(), "memory", "threads");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function nowIso(): string {
  return new Date().toISOString();
}

function shortId(): string {
  return crypto.randomBytes(3).toString("hex");
}

/**
 * Extract open loops from Squidley's analysis text.
 * Looks for numbered lists, bullet points, "next steps", etc.
 */
export function extractOpenLoops(analysisText: string): string[] {
  const loops: string[] = [];
  const lines = analysisText.split(/\r?\n/);

  let inNextSteps = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Detect "next steps" section headers
    if (/next\s+steps?|recommendations?|todo|action\s+items?/i.test(line)) {
      inNextSteps = true;
      continue;
    }

    // Inside next steps — grab numbered or bulleted items
    if (inNextSteps) {
      const m = line.match(/^(?:\d+[.)]\s*|[-*•]\s*\*{0,2})(.+)/);
      if (m?.[1]) {
        const text = m[1].replace(/\*{1,2}/g, "").trim();
        if (text.length > 10 && text.length < 200) {
          loops.push(text);
        }
      }
      // Stop after 6 items or if we hit another header
      if (loops.length >= 6) break;
      if (line.startsWith("#") && loops.length > 0) break;
    }
  }

  // Fallback: grab any numbered list items from the whole text
  if (loops.length === 0) {
    for (const raw of lines) {
      const line = raw.trim();
      const m = line.match(/^\d+[.)]\s+(.{10,150})$/);
      if (m?.[1]) {
        loops.push(m[1].replace(/\*{1,2}/g, "").trim());
        if (loops.length >= 6) break;
      }
    }
  }

  return loops;
}

/**
 * Extract a short summary from analysis text (first 2-3 sentences).
 */
export function extractSummary(analysisText: string, toolId: string): string {
  // Strip markdown bold/headers
  const clean = analysisText
    .replace(/#{1,3}\s*/g, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/\r?\n+/g, " ")
    .trim();

  // Take first ~250 chars, end at sentence boundary
  const truncated = clean.slice(0, 300);
  const lastPeriod = truncated.lastIndexOf(".");
  const summary = lastPeriod > 80 ? truncated.slice(0, lastPeriod + 1) : truncated;

  return `[${toolId}] ${summary}`.slice(0, 350);
}

/**
 * Infer tags from tool ID and analysis content.
 */
function inferTags(toolId: string, analysisText: string): string[] {
  const tags: string[] = [];

  if (toolId === "git.log") tags.push("git", "history");
  if (toolId === "git.diff") tags.push("git", "diff", "changes");
  if (toolId === "git.status") tags.push("git", "status");
  if (toolId === "rg.search") tags.push("search", "codebase");

  const text = analysisText.toLowerCase();
  if (text.includes("typescript") || text.includes(".ts")) tags.push("typescript");
  if (text.includes("test") || text.includes("playwright")) tags.push("testing");
  if (text.includes("memory") || text.includes("thread")) tags.push("memory");
  if (text.includes("tool") || text.includes("runner")) tags.push("tools");
  if (text.includes("api") || text.includes("fastify")) tags.push("api");
  if (text.includes("ui") || text.includes("next.js") || text.includes("react")) tags.push("ui");

  return [...new Set(tags)].slice(0, 6);
}

/**
 * Generate a thread ID from the tool and timestamp.
 */
function makeThreadId(toolId: string): string {
  const tool = toolId.replace(".", "-");
  const stamp = new Date().toISOString().slice(0, 10); // 2026-02-28
  return `${tool}-${stamp}-${shortId()}`;
}

/**
 * Load existing thread by ID if it exists.
 */
async function loadThread(threadId: string): Promise<ThreadEntry | null> {
  const fp = path.resolve(threadsDir(), `${threadId}.json`);
  try {
    const raw = await fs.readFile(fp, "utf8");
    return JSON.parse(raw) as ThreadEntry;
  } catch {
    return null;
  }
}

/**
 * Write a thread JSON file.
 */
async function writeThread(entry: ThreadEntry): Promise<void> {
  await fs.mkdir(threadsDir(), { recursive: true });
  const fp = path.resolve(threadsDir(), `${entry.thread_id}.json`);
  await fs.writeFile(fp, JSON.stringify(entry, null, 2), "utf8");
}

/**
 * Read the current active thread ID.
 */
async function readActiveThreadId(): Promise<string> {
  const fp = path.resolve(threadsDir(), "_active.txt");
  try {
    const raw = await fs.readFile(fp, "utf8");
    return raw.trim().split(/\r?\n/)[0]?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Write the active thread pointer.
 */
async function writeActiveThreadId(threadId: string): Promise<void> {
  await fs.mkdir(threadsDir(), { recursive: true });
  const fp = path.resolve(threadsDir(), "_active.txt");
  await fs.writeFile(fp, threadId + "\n", "utf8");
}

/**
 * Main entry point — call this after tool analysis completes.
 *
 * Strategy:
 * - If current active thread was created by a git tool today, update it.
 * - Otherwise create a new thread for this analysis session.
 * - Always update _active.txt to point at the latest thread.
 */
export async function writeAnalysisThread(args: {
  toolId: string;
  analysisText: string;
  rawToolOutput: string;
}): Promise<{ thread_id: string; wrote: boolean }> {
  try {
    const { toolId, analysisText } = args;

    const summary = extractSummary(analysisText, toolId);
    const openLoops = extractOpenLoops(analysisText);
    const tags = inferTags(toolId, analysisText);
    const today = new Date().toISOString().slice(0, 10);

    // Check if active thread is a git thread from today — if so, update it
    const activeId = await readActiveThreadId();
    let existing: ThreadEntry | null = null;

    if (activeId && activeId.includes(today) && activeId.startsWith(toolId.replace(".", "-"))) {
      existing = await loadThread(activeId);
    }

    if (existing) {
      // Update existing thread — merge open loops, update summary
      const mergedLoops = [...new Set([...openLoops, ...existing.open_loops])].slice(0, 8);
      const updated: ThreadEntry = {
        ...existing,
        summary,
        open_loops: mergedLoops,
        tags: [...new Set([...tags, ...existing.tags])].slice(0, 6),
        last_touched: nowIso(),
      };
      await writeThread(updated);
      return { thread_id: updated.thread_id, wrote: true };
    }

    // Create new thread
    const threadId = makeThreadId(toolId);
    const toolLabel: Record<string, string> = {
      "git.log": "Git history analysis",
      "git.diff": "Git diff analysis",
      "git.status": "Repo status check",
      "rg.search": "Codebase search",
    };

    const entry: ThreadEntry = {
      thread_id: threadId,
      title: `${toolLabel[toolId] ?? toolId} — ${today}`,
      status: "active",
      tags,
      summary,
      open_loops: openLoops,
      last_touched: nowIso(),
    };

    await writeThread(entry);
    await writeActiveThreadId(threadId);

    return { thread_id: threadId, wrote: true };
  } catch (e) {
    // Never crash the request — memory write is best-effort
    console.error("[memoryWriter] failed:", e);
    return { thread_id: "", wrote: false };
  }
}
