import { describe, it, expect } from "vitest";
import {
  approximateTokensFromChars,
  buildLocalMessageMetrics,
  formatDuration,
  formatTokenCount,
} from "./metrics";

describe("approximateTokensFromChars", () => {
  it("returns 0 for empty", () => {
    expect(approximateTokensFromChars(0)).toBe(0);
  });

  it("rounds up so even 1 char shows >= 1 token", () => {
    expect(approximateTokensFromChars(1)).toBe(1);
    expect(approximateTokensFromChars(3)).toBe(1);
    expect(approximateTokensFromChars(4)).toBe(1);
    expect(approximateTokensFromChars(5)).toBe(2);
  });
});

describe("buildLocalMessageMetrics", () => {
  it("uses model-reported tokens when available", () => {
    const m = buildLocalMessageMetrics({
      model: "llama3.2",
      reply: "hello",
      durationMs: 250,
      modelReportedTokens: 7,
    });
    expect(m.tokenCount).toBe(7);
    expect(m.tokenSource).toBe("model-reported");
    expect(m.source).toBe("local");
    expect(m.cloudUsed).toBe(false);
    expect(m.toolsUsed).toBe(false);
    expect(m.characterCount).toBe(5);
    expect(m.durationMs).toBe(250);
  });

  it("falls back to char-based approximation when not reported", () => {
    const m = buildLocalMessageMetrics({
      model: "llama3.2",
      reply: "hello world",
      durationMs: 100,
    });
    expect(m.tokenSource).toBe("approximate");
    expect(m.tokenCount).toBeGreaterThan(0);
  });

  it("never marks an approximate count as model-reported", () => {
    const m = buildLocalMessageMetrics({
      model: "llama3.2",
      reply: "x",
      durationMs: 1,
    });
    expect(m.tokenSource).toBe("approximate");
  });

  it("treats modelReportedTokens=0 as exact zero, not missing", () => {
    const m = buildLocalMessageMetrics({
      model: "llama3.2",
      reply: "",
      durationMs: 5,
      modelReportedTokens: 0,
    });
    expect(m.tokenSource).toBe("model-reported");
    expect(m.tokenCount).toBe(0);
  });
});

describe("formatters", () => {
  it("renders sub-second durations as ms", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(250.4)).toBe("250ms");
  });

  it("renders >= 1 second durations as seconds", () => {
    expect(formatDuration(1000)).toBe("1.00s");
    expect(formatDuration(1234)).toBe("1.23s");
  });

  it("formats token counts with ~ prefix when approximate", () => {
    const exact = buildLocalMessageMetrics({
      model: "x",
      reply: "abc",
      durationMs: 1,
      modelReportedTokens: 1,
    });
    expect(formatTokenCount(exact)).toBe("1 tok");

    const approx = buildLocalMessageMetrics({
      model: "x",
      reply: "abc",
      durationMs: 1,
    });
    expect(formatTokenCount(approx)).toBe("~1 tok");
  });
});
