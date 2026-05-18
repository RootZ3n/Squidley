/**
 * Beginner-readable diff preview for a single tiny edit.
 *
 * Pure: no IO. Tests run without a filesystem.
 *
 * This is NOT a full unified diff. It is the minimal "this line(s) is
 * being removed, this line(s) is being added" view that fits inside an
 * approval card.
 *
 * Behaviour:
 *   - Lines from `originalSnippet` are prefixed with "- ".
 *   - Lines from `proposedSnippet` are prefixed with "+ ".
 *   - The 2 lines of file context immediately before and after the
 *     anchor are included with a "  " prefix when they exist.
 *   - The whole preview is capped at `MAX_PREVIEW_LINES` lines and
 *     `MAX_PREVIEW_CHARS` characters to keep the approval card small.
 */

import type { TinyEditDiffPreview } from "./types";

const CONTEXT_LINES = 2;
const MAX_PREVIEW_LINES = 60;
const MAX_PREVIEW_CHARS = 4000;

function splitLines(s: string): string[] {
  if (s.length === 0) return [];
  const normalized = s.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");
  // Drop the trailing empty produced by a terminating newline so
  // context windows align with visible lines rather than the gap.
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function trimLeadingEmpty(lines: string[]): string[] {
  return lines[0] === "" ? lines.slice(1) : lines;
}

function clampLines(lines: readonly string[], maxLines: number, maxChars: number): string[] {
  const out: string[] = [];
  let charCount = 0;
  for (const line of lines) {
    if (out.length >= maxLines) {
      out.push(`… (${lines.length - out.length} more line(s) hidden)`);
      break;
    }
    if (charCount + line.length > maxChars) {
      out.push(`… (clipped at ${maxChars} chars)`);
      break;
    }
    out.push(line);
    charCount += line.length + 1;
  }
  return out;
}

export interface BuildDiffPreviewArgs {
  readonly path: string;
  readonly fileContent: string;
  readonly originalSnippet: string;
  readonly proposedSnippet: string;
  readonly anchorIndex: number;
}

export function buildDiffPreview(args: BuildDiffPreviewArgs): TinyEditDiffPreview {
  const { path, fileContent, originalSnippet, proposedSnippet, anchorIndex } = args;

  // Compute the bytes-of-context window around the anchor.
  const beforeText = fileContent.slice(0, anchorIndex);
  const afterText = fileContent.slice(anchorIndex + originalSnippet.length);

  const beforeLines = splitLines(beforeText);
  const afterLines = trimLeadingEmpty(splitLines(afterText));
  const removedLines = splitLines(originalSnippet);
  const addedLines = splitLines(proposedSnippet);

  const headContext = beforeLines.slice(-CONTEXT_LINES).map((l) => `  ${l}`);
  const tailContext = afterLines.slice(0, CONTEXT_LINES).map((l) => `  ${l}`);
  const minus = removedLines.map((l) => `- ${l}`);
  const plus = addedLines.map((l) => `+ ${l}`);

  const lines = clampLines(
    [...headContext, ...minus, ...plus, ...tailContext],
    MAX_PREVIEW_LINES,
    MAX_PREVIEW_CHARS,
  );

  return {
    path,
    lines,
    headExcerpt: headContext.join("\n"),
    tailExcerpt: tailContext.join("\n"),
    bytesRemoved: originalSnippet.length,
    bytesAdded: proposedSnippet.length,
    linesChanged: Math.max(removedLines.length, addedLines.length),
  };
}
