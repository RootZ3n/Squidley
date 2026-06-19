/**
 * Per-message metrics shown under each chat bubble.
 *
 * We expose two kinds of numbers:
 *   - exact     when the upstream model reports them (e.g. Ollama's eval_count)
 *   - approximate  when we have to estimate from text length
 *
 * The UI must render the "approximate" tag honestly. The product principle
 * here is "do not pretend precision we do not have."
 */

export type TokenSource = "model-reported" | "approximate";

export interface MessageMetrics {
  /** "local" in this pass; carried along so the UI can label cloud later. */
  source: "local" | "cloud";
  model: string;
  /** Wall-clock duration, ms. */
  durationMs: number;
  /** Length of the rendered reply, in characters. */
  characterCount: number;
  /** Token count, either model-reported or approximated. */
  tokenCount: number;
  tokenSource: TokenSource;
  cloudUsed: boolean;
  toolsUsed: boolean;
}

/**
 * Approximate tokens from character count. ~4 chars per token is a common
 * rule-of-thumb across English-leaning models. Always round up so a
 * 1-character reply doesn't show "0 tokens".
 */
export function approximateTokensFromChars(chars: number): number {
  if (chars <= 0) return 0;
  return Math.max(1, Math.ceil(chars / 4));
}

export function buildLocalMessageMetrics(args: {
  model: string;
  reply: string;
  durationMs: number;
  /** When provided (e.g. Ollama's eval_count), used as an exact token count. */
  modelReportedTokens?: number;
}): MessageMetrics {
  const characterCount = args.reply.length;
  const hasExact = typeof args.modelReportedTokens === "number" && args.modelReportedTokens >= 0;
  return {
    source: "local",
    model: args.model,
    durationMs: args.durationMs,
    characterCount,
    tokenCount: hasExact
      ? (args.modelReportedTokens as number)
      : approximateTokensFromChars(characterCount),
    tokenSource: hasExact ? "model-reported" : "approximate",
    cloudUsed: false,
    toolsUsed: false,
  };
}

/** Format duration into a compact "Xms" / "X.YYs" string. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format token count, with a "~" prefix when approximate. */
export function formatTokenCount(m: MessageMetrics): string {
  const prefix = m.tokenSource === "approximate" ? "~" : "";
  return `${prefix}${m.tokenCount} tok`;
}
