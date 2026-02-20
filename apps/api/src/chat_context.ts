// apps/api/src/chat_context.ts
import * as path from "node:path";
import * as fs from "node:fs/promises";

type MemoryHit = { path: string; snippet: string };

async function readTextIfExists(absPath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(absPath);
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

function extractKeywords(input: string): string[] {
  const raw = input
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_/]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const stop = new Set([
    "the","a","an","and","or","but","to","of","in","on","for","with","at","by","from",
    "is","are","was","were","be","been","being","it","this","that","these","those",
    "i","me","my","we","our","you","your","they","them","their","as","do","does","did",
    "what","why","how","when","where","who","which","about","tonight"
  ]);

  const keep = raw.filter(w => w.length >= 4 && !stop.has(w)).slice(0, 12);
  return Array.from(new Set(keep));
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string, depth: number) {
    if (depth > 3) return;
    let entries: any[] = [];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(p);
    }
  }
  await walk(dir, 0);
  return out;
}

function makeSnippet(text: string, q: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const idx = clean.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return clean.slice(0, 180);
  const start = Math.max(0, idx - 70);
  const end = Math.min(clean.length, idx + q.length + 110);
  return clean.slice(start, end);
}

async function searchMemory(repoRoot: string, keywords: string[], maxHits: number): Promise<MemoryHit[]> {
  const memRoot = path.join(repoRoot, "memory");
  const files = await listMarkdownFiles(memRoot);
  if (files.length === 0 || keywords.length === 0) return [];

  const hits: MemoryHit[] = [];

  for (const f of files) {
    let content = "";
    try {
      content = (await fs.readFile(f)).toString("utf8");
    } catch {
      continue;
    }
    const lower = content.toLowerCase();
    for (const k of keywords) {
      if (lower.includes(k)) {
        hits.push({
          path: path.relative(repoRoot, f).replace(/\\/g, "/"),
          snippet: makeSnippet(content, k)
        });
        break;
      }
    }
    if (hits.length >= maxHits) break;
  }

  return hits.slice(0, maxHits);
}

export async function buildChatSystemPrompt(args: {
  input: string;
  selectedSkill?: string | null;
  maxMemoryHits?: number;
}): Promise<string> {
  const repoRoot = process.cwd();
  const selectedSkill = args.selectedSkill ?? null;
  const input = args.input ?? "";
  const maxHits = args.maxMemoryHits ?? 6;

  const soulPath = path.join(repoRoot, "SOUL.md");
  const identityPath = path.join(repoRoot, "IDENTITY.md");

  const soul = (await readTextIfExists(soulPath)) ?? "";
  const identity = (await readTextIfExists(identityPath)) ?? "";

  let skillMd = "";
  if (selectedSkill) {
    const skillPath = path.join(repoRoot, "skills", selectedSkill, "skill.md");
    skillMd = (await readTextIfExists(skillPath)) ?? "";
  }

  const keywords = extractKeywords(input);
  const memoryHits = await searchMemory(repoRoot, keywords, maxHits);

  const memoryBlock =
    memoryHits.length === 0
      ? "(no relevant memory hits)"
      : memoryHits
          .map((h, i) => `(${i + 1}) ${h.path}\n${h.snippet}`)
          .join("\n\n---\n\n");

  const skillBlock = selectedSkill
    ? (skillMd ? skillMd : `(skill.md missing for skill "${selectedSkill}")`)
    : "(no skill context selected)";

  return [
    `You are Squidley, the assistant inside the ZenSquid program.`,
    ``,
    `## SOUL.md`,
    soul.trim() || "(SOUL.md empty)",
    ``,
    `## IDENTITY.md`,
    identity.trim() || "(IDENTITY.md empty)",
    ``,
    `## Selected skill context`,
    `selected_skill=${selectedSkill ?? "(none)"}`,
    skillBlock.trim(),
    ``,
    `## Relevant memory snippets`,
    memoryBlock,
    ``,
    `## Rules`,
    `- Be concise and practical.`,
    `- Stay on the current task unless the user explicitly asks to switch.`,
    `- If something is not in the memory snippets above, don’t claim it is “remembered”.`,
    ``,
    `Now respond to the user.`,
  ].join("\n");
}
