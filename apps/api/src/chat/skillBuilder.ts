// apps/api/src/chat/skillBuilder.ts
//
// Generates skill markdown from analysis text and writes to skills/<name>/skill.md
// Called after Squidley proposes and user approves a skill write.
// Uses fs.write under the hood — admin token required.

import fs from "node:fs/promises";
import path from "node:path";

function zensquidRoot(): string {
  return process.env.ZENSQUID_ROOT ?? process.cwd();
}

function skillsDir(): string {
  return path.resolve(zensquidRoot(), "skills");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export type SkillWriteResult = {
  ok: boolean;
  skill_id: string;
  path: string;
  error?: string;
};

/**
 * Generate skill markdown from a name, purpose, and analysis content.
 */
export function generateSkillMarkdown(args: {
  name: string;
  purpose: string;
  content: string;
  sourceToolId?: string;
}): string {
  const { name, purpose, content, sourceToolId } = args;
  const now = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push(`# Skill: ${name}`);
  lines.push("");
  lines.push("## Purpose");
  lines.push(purpose.trim());
  lines.push("");
  lines.push("## Content");
  lines.push(content.trim());
  lines.push("");
  lines.push("## Metadata");
  lines.push(`- created: ${now}`);
  if (sourceToolId) lines.push(`- source: ${sourceToolId} analysis`);
  lines.push("- author: Squidley (auto-generated)");
  lines.push("");

  return lines.join("\n");
}

/**
 * Write a skill file to skills/<skill_id>/skill.md
 * Creates the directory if it doesn't exist.
 */
export async function writeSkill(args: {
  skill_id: string;
  markdown: string;
}): Promise<SkillWriteResult> {
  const { skill_id, markdown } = args;

  const safeId = slugify(skill_id);
  if (!safeId) {
    return { ok: false, skill_id, path: "", error: "invalid skill id" };
  }

  const dir = path.resolve(skillsDir(), safeId);
  const fp = path.resolve(dir, "skill.md");

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fp, markdown, "utf8");
    return { ok: true, skill_id: safeId, path: fp };
  } catch (e: any) {
    return { ok: false, skill_id: safeId, path: fp, error: String(e?.message ?? e) };
  }
}

/**
 * List existing skills.
 */
export async function listSkills(): Promise<Array<{ id: string; path: string }>> {
  const dir = skillsDir();
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const skills: Array<{ id: string; path: string }> = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const fp = path.resolve(dir, e.name, "skill.md");
      try {
        await fs.access(fp);
        skills.push({ id: e.name, path: fp });
      } catch {
        // no skill.md
      }
    }
    return skills;
  } catch {
    return [];
  }
}

/**
 * Parse a skill proposal from Squidley's response.
 * Looks for patterns like:
 *   "I can write a skill for X"
 *   "I can save this as a skill called X"
 *   "Want me to save this as a skill?"
 */
export type SkillProposal = {
  skill_id: string;
  name: string;
  purpose: string;
};

export function extractSkillProposal(
  modelResponse: string,
  context: string
): SkillProposal | null {
  // Match "skill for X" or "skill called X" or "skill named X"
  const nameMatch = modelResponse.match(
    /skill\s+(?:for|called|named)\s+["""']?([a-zA-Z0-9\s\-_]{2,40})["""']?/i
  );

  if (!nameMatch?.[1]) return null;

  const name = nameMatch[1].trim();
  const skill_id = slugify(name);
  if (!skill_id) return null;

  // Purpose: first sentence of context or model response
  const purposeSource = context || modelResponse;
  const firstSentence = purposeSource.split(/[.!?]/)[0]?.trim() ?? name;
  const purpose = firstSentence.slice(0, 200);

  return { skill_id, name, purpose };
}
