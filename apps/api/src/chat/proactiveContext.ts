// apps/api/src/chat/proactiveContext.ts
//
// Reads recent memory files and generates proactive observations
// to inject into the system prompt on new sessions.
// Goal: Squidley notices things and brings them up naturally.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

function memRoot(): string {
  return path.resolve(process.env.ZENSQUID_ROOT ?? process.cwd(), "memory");
}

async function latestFile(dir: string): Promise<string | null> {
  try {
    const files = await readdir(dir);
    const sorted = files.filter(f => f.endsWith(".md")).sort().reverse();
    if (!sorted.length) return null;
    return path.join(dir, sorted[0]);
  } catch { return null; }
}

async function readTruncated(filepath: string, maxChars = 1500): Promise<string> {
  try {
    const content = await readFile(filepath, "utf8");
    return content.trim().slice(0, maxChars);
  } catch { return ""; }
}

export type ProactiveContext = {
  text: string;
  sources: string[];
};

export async function buildProactiveContext(): Promise<ProactiveContext> {
  const root = memRoot();
  const sources: string[] = [];
  const sections: string[] = [];

  // Latest morning briefing
  const briefingFile = await latestFile(path.join(root, "briefings"));
  if (briefingFile) {
    const content = await readTruncated(briefingFile, 1200);
    if (content) {
      sections.push("## Latest morning briefing\n" + content);
      sources.push(path.basename(briefingFile));
    }
  }

  // Latest news briefing
  const newsFiles = (await readdir(path.join(root, "intel")).catch(() => [])) as string[];
  const latestNews = newsFiles
    .filter(f => f.startsWith("news-briefing"))
    .sort().reverse()[0];
  if (latestNews) {
    const content = await readTruncated(path.join(root, "intel", latestNews), 1500);
    if (content) {
      sections.push("## Latest news briefing\n" + content);
      sources.push(latestNews);
    }
  }

  // Projects index
  const projectsFile = path.join(root, "projects", "index.md");
  const projects = await readTruncated(projectsFile, 800);
  if (projects) {
    sections.push("## Active projects\n" + projects);
    sources.push("projects/index.md");
  }

  // Recent ideas
  const ideasFiles = (await readdir(path.join(root, "ideas")).catch(() => [])) as string[];
  const latestIdea = ideasFiles.filter(f => f.endsWith(".md")).sort().reverse()[0];
  if (latestIdea) {
    const content = await readTruncated(path.join(root, "ideas", latestIdea), 500);
    if (content) {
      sections.push("## Recent idea\n" + content);
      sources.push(latestIdea);
    }
  }

  if (!sections.length) return { text: "", sources: [] };

  const text = [
    "# PROACTIVE CONTEXT (what I know about Jeff's world right now)",
    "Use this to bring up relevant things naturally in conversation.",
    "Don't dump all of this — pick 1-2 things worth mentioning and weave them in.",
    "If Jeff asks about something covered here, answer from this context first.",
    "",
    ...sections
  ].join("\n");

  return { text, sources };
}
