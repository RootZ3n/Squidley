/**
 * Token / context budgeter for the Small Model Reliability Layer.
 *
 * Small local models choke on long contexts. This packer:
 *
 *   - takes a list of candidate items (snippets, file metadata, summaries,
 *     recent errors)
 *   - sorts them by priority (snippet > symbol > summary > error > other)
 *   - admits items until the character budget is filled
 *   - truncates a long admitted snippet with a *visible* truncation note —
 *     never silently dropping the middle of important code
 *   - records every omitted item so the caller can disclose the redaction
 *
 * Sizes are measured in characters as a deterministic proxy for tokens.
 * That is honest: we are not pretending to count tokens for an arbitrary
 * tokenizer. Roughly 1 token ≈ 4 chars for English; tests use char counts
 * directly so behavior is reproducible across machines.
 */

export type ContextItemKind = "snippet" | "symbol" | "summary" | "error" | "other";

export interface ContextItem {
  readonly id: string;
  readonly kind: ContextItemKind;
  /** Higher = more important. Defaults applied if undefined. */
  readonly priority?: number;
  readonly label: string;
  readonly body: string;
  /** Files larger than this raw size will never be inlined whole. */
  readonly rawSize?: number;
}

export interface PackedContextItem {
  readonly id: string;
  readonly kind: ContextItemKind;
  readonly label: string;
  readonly body: string;
  readonly truncated: boolean;
  readonly originalSize: number;
  readonly includedSize: number;
}

export interface PackedContext {
  readonly includedItems: readonly PackedContextItem[];
  readonly omittedItems: readonly {
    readonly id: string;
    readonly kind: ContextItemKind;
    readonly label: string;
    readonly originalSize: number;
    readonly reason: "budget-exhausted" | "too-large-to-truncate" | "empty";
  }[];
  readonly truncationNotes: readonly string[];
  readonly estimatedSize: number;
  readonly safeForLocalModel: boolean;
}

export interface PackContextOptions {
  /** Character budget for the packed context. */
  readonly maxChars: number;
  /** Per-item ceiling; longer items are truncated with a note. */
  readonly maxItemChars?: number;
  /** Items larger than this are never inlined at all (just referenced). */
  readonly rejectIfLargerThan?: number;
}

const DEFAULT_MAX_ITEM_CHARS = 1200;
const DEFAULT_REJECT_THRESHOLD = 64 * 1024; // 64 KB
const TRUNCATION_TAIL_RATIO = 0.25;
const SAFE_FOR_LOCAL_HARD_LIMIT = 8000;

const KIND_PRIORITY: Record<ContextItemKind, number> = {
  snippet: 100,
  symbol: 80,
  summary: 60,
  error: 50,
  other: 10,
};

function effectivePriority(item: ContextItem): number {
  if (typeof item.priority === "number") return item.priority;
  return KIND_PRIORITY[item.kind] ?? 0;
}

function truncateWithNote(label: string, body: string, limit: number): string {
  if (body.length <= limit) return body;
  // Keep a head + a smaller tail so the user can see start and end. We never
  // silently remove the middle: the note explicitly says what was dropped.
  const tailLen = Math.max(80, Math.floor(limit * TRUNCATION_TAIL_RATIO));
  const headLen = Math.max(80, limit - tailLen - 80); // reserve ~80 for note
  const dropped = body.length - headLen - tailLen;
  const head = body.slice(0, headLen);
  const tail = body.slice(body.length - tailLen);
  const note = `\n\n[... ${dropped} chars omitted from "${label}" — middle truncated by reliability layer ...]\n\n`;
  return `${head}${note}${tail}`;
}

/**
 * Pack candidate context items into a budget. Pure: no I/O, deterministic
 * for a given input order + options.
 */
export function packContext(
  items: readonly ContextItem[],
  options: PackContextOptions,
): PackedContext {
  const maxChars = Math.max(256, options.maxChars);
  const maxItemChars = Math.max(80, options.maxItemChars ?? DEFAULT_MAX_ITEM_CHARS);
  const rejectThreshold = options.rejectIfLargerThan ?? DEFAULT_REJECT_THRESHOLD;

  const ordered = [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const pa = effectivePriority(a.item);
      const pb = effectivePriority(b.item);
      if (pa !== pb) return pb - pa;
      return a.index - b.index; // stable
    })
    .map((entry) => entry.item);

  const included: PackedContextItem[] = [];
  const omitted: PackedContext["omittedItems"][number][] = [];
  const truncationNotes: string[] = [];
  let used = 0;

  for (const item of ordered) {
    const originalSize = item.rawSize ?? item.body.length;

    if (!item.body || item.body.trim().length === 0) {
      omitted.push({
        id: item.id,
        kind: item.kind,
        label: item.label,
        originalSize: 0,
        reason: "empty",
      });
      continue;
    }

    if (originalSize > rejectThreshold) {
      omitted.push({
        id: item.id,
        kind: item.kind,
        label: item.label,
        originalSize,
        reason: "too-large-to-truncate",
      });
      truncationNotes.push(
        `"${item.label}" (${originalSize} chars) is too large to inline. Only its path/label is included.`,
      );
      continue;
    }

    const remaining = maxChars - used;
    if (remaining <= 100) {
      omitted.push({
        id: item.id,
        kind: item.kind,
        label: item.label,
        originalSize,
        reason: "budget-exhausted",
      });
      continue;
    }

    const perItemLimit = Math.min(maxItemChars, remaining);
    const truncated = item.body.length > perItemLimit;
    const body = truncated
      ? truncateWithNote(item.label, item.body, perItemLimit)
      : item.body;

    if (truncated) {
      truncationNotes.push(
        `"${item.label}" was truncated from ${item.body.length} to ~${body.length} chars.`,
      );
    }

    included.push({
      id: item.id,
      kind: item.kind,
      label: item.label,
      body,
      truncated,
      originalSize,
      includedSize: body.length,
    });
    used += body.length;
  }

  return {
    includedItems: included,
    omittedItems: omitted,
    truncationNotes,
    estimatedSize: used,
    safeForLocalModel: used <= SAFE_FOR_LOCAL_HARD_LIMIT,
  };
}

/**
 * Render the packed context as a single beginner-friendly string.
 * Always includes an explicit list of what was omitted.
 */
export function renderPackedContext(packed: PackedContext): string {
  const blocks: string[] = [];
  for (const item of packed.includedItems) {
    blocks.push(`### ${item.label} (${item.kind})\n${item.body}`);
  }
  if (packed.truncationNotes.length > 0) {
    blocks.push(`### Truncation notes\n- ${packed.truncationNotes.join("\n- ")}`);
  }
  if (packed.omittedItems.length > 0) {
    const lines = packed.omittedItems.map(
      (item) => `- ${item.label} (${item.kind}, ${item.originalSize} chars): ${item.reason}`,
    );
    blocks.push(`### Omitted for honesty\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}
