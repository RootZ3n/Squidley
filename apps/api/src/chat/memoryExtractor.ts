// apps/api/src/chat/memoryExtractor.ts
//
// After each chat turn, lightly scans the conversation for facts worth remembering.
// Appends to memory/general/jeff-notes.md if something new is found.
// Uses local model to keep cost zero.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

function memRoot(): string {
  return path.resolve(process.env.ZENSQUID_ROOT ?? process.cwd(), "memory");
}

const NOTES_FILE = "general/jeff-notes.md";

async function loadExistingNotes(): Promise<string> {
  try {
    return await readFile(path.join(memRoot(), NOTES_FILE), "utf8");
  } catch { return ""; }
}

async function appendNote(note: string): Promise<void> {
  const dir = path.join(memRoot(), "general");
  await mkdir(dir, { recursive: true });
  const filepath = path.join(memRoot(), NOTES_FILE);
  const existing = await loadExistingNotes();
  const timestamp = new Date().toISOString().slice(0, 10);
  const entry = `\n## ${timestamp}\n${note.trim()}\n`;
  await writeFile(filepath, existing + entry, "utf8");
}

// Patterns that indicate something worth remembering
const MEMORY_TRIGGERS = [
  { pattern: /i got an? (interview|offer|job|call|callback)/i, category: "career" },
  { pattern: /i('m| am) (working on|building|making|creating)/i, category: "project" },
  { pattern: /i prefer|i like|i want|i need|i hate|i love/i, category: "preference" },
  { pattern: /my (wife|husband|partner|kid|son|daughter|dog|cat|family)/i, category: "personal" },
  { pattern: /i('ve| have) (decided|figured out|realized|learned)/i, category: "insight" },
  { pattern: /remind me|don't forget|remember that/i, category: "reminder" },
  { pattern: /interview (at|with|for)/i, category: "career" },
  { pattern: /applied (to|for|at)/i, category: "career" },
];

export async function maybeExtractMemory(
  userInput: string,
  assistantResponse: string,
  ollamaBaseUrl?: string
): Promise<boolean> {
  // Quick check — does this conversation contain anything worth remembering?
  const combined = userInput + " " + assistantResponse;
  const triggered = MEMORY_TRIGGERS.some(t => t.pattern.test(combined));
  if (!triggered) return false;

  // Don't use LLM for extraction — just save the relevant user input directly
  // if it matches a trigger pattern. Keep it simple and zero-cost.
  const matchedTriggers = MEMORY_TRIGGERS.filter(t => t.pattern.test(userInput));
  if (!matchedTriggers.length) return false;

  const existing = await loadExistingNotes();
  
  // Avoid duplicates — check if very similar content already exists
  const inputSnippet = userInput.slice(0, 100).toLowerCase();
  if (existing.toLowerCase().includes(inputSnippet.slice(0, 40))) return false;

  const category = matchedTriggers[0].category;
  const note = `[${category}] Jeff said: "${userInput.trim().slice(0, 200)}"`;
  await appendNote(note);
  return true;
}
