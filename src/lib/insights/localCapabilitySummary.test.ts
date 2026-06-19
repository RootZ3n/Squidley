import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  summarizeLocalCapabilities,
  type LocalCapabilitySummary,
} from "./localCapabilitySummary";
import type { LocalModelSnapshot } from "@/lib/capabilities/localReadiness";

const CHAT: LocalModelSnapshot = { name: "llama3.2:latest" };
const CHAT_7B: LocalModelSnapshot = { name: "llama3.1:7b" };
const CODE: LocalModelSnapshot = { name: "deepseek-coder:6.7b" };
const VISION: LocalModelSnapshot = { name: "llava:13b" };
const EMBED: LocalModelSnapshot = { name: "all-minilm:latest" };
const LONG_CTX: LocalModelSnapshot = { name: "llama3.1:8b", contextLength: 131_072 };

describe("summarizeLocalCapabilities", () => {
  it("counts chat models correctly", () => {
    const summary = summarizeLocalCapabilities([CHAT, CHAT_7B]);
    expect(summary.hasChat).toBe(true);
    expect(summary.chatModelCount).toBe(2);
  });

  it("counts code models correctly", () => {
    const summary = summarizeLocalCapabilities([CHAT, CODE]);
    expect(summary.hasCode).toBe(true);
    expect(summary.codeModelCount).toBe(1);
    // Code models also count as chat
    expect(summary.chatModelCount).toBe(2);
  });

  it("counts vision models correctly", () => {
    const summary = summarizeLocalCapabilities([CHAT, VISION]);
    expect(summary.hasVision).toBe(true);
    expect(summary.visionModelCount).toBe(1);
  });

  it("counts embedding models correctly", () => {
    const summary = summarizeLocalCapabilities([CHAT, EMBED]);
    expect(summary.hasEmbeddings).toBe(true);
    expect(summary.embeddingModelCount).toBe(1);
  });

  it("embedding models do not count as chat", () => {
    const summary = summarizeLocalCapabilities([EMBED]);
    expect(summary.hasChat).toBe(false);
    expect(summary.chatModelCount).toBe(0);
    expect(summary.hasEmbeddings).toBe(true);
    expect(summary.embeddingModelCount).toBe(1);
  });

  it("counts long-context models correctly", () => {
    const summary = summarizeLocalCapabilities([LONG_CTX]);
    expect(summary.hasLongContext).toBe(true);
    expect(summary.longContextModelCount).toBe(1);
  });

  it("tool-use remains false/not assumed", () => {
    const summary = summarizeLocalCapabilities([CHAT, CODE, VISION]);
    expect(summary.hasToolUse).toBe(false);
  });

  it("reports total model count", () => {
    const summary = summarizeLocalCapabilities([CHAT, CODE, EMBED]);
    expect(summary.modelCount).toBe(3);
  });

  it("produces beginner-friendly not-detected state for empty model list", () => {
    const summary = summarizeLocalCapabilities([]);
    expect(summary.hasChat).toBe(false);
    expect(summary.hasCode).toBe(false);
    expect(summary.hasVision).toBe(false);
    expect(summary.hasEmbeddings).toBe(false);
    expect(summary.hasLongContext).toBe(false);
    expect(summary.hasToolUse).toBe(false);
    expect(summary.modelCount).toBe(0);
    expect(summary.beginnerSummaryLines.length).toBeGreaterThan(0);
    expect(summary.beginnerSummaryLines[0].toLowerCase()).toContain("no local models");
  });

  it("generates beginner summary lines for a mixed model set", () => {
    const summary = summarizeLocalCapabilities([CHAT, CODE, VISION, EMBED]);
    expect(summary.beginnerSummaryLines.length).toBe(6);
    expect(summary.beginnerSummaryLines[0]).toContain("Chat");
    expect(summary.beginnerSummaryLines[0]).toContain("Available locally");
    expect(summary.beginnerSummaryLines[1]).toContain("Code help");
    expect(summary.beginnerSummaryLines[1]).toContain("Likely available");
    expect(summary.beginnerSummaryLines[2]).toContain("Vision");
    expect(summary.beginnerSummaryLines[3]).toContain("Embeddings");
    expect(summary.beginnerSummaryLines[5]).toContain("Not assumed");
  });

  it("says 'Not detected' for missing capabilities", () => {
    const summary = summarizeLocalCapabilities([CHAT]);
    const lines = summary.beginnerSummaryLines;
    expect(lines.find((l) => l.includes("Code help"))).toContain("Not detected");
    expect(lines.find((l) => l.includes("Vision"))).toContain("Not detected");
    expect(lines.find((l) => l.includes("Embeddings"))).toContain("Not detected");
  });
});

describe("localCapabilitySummary — purity", () => {
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn<unknown[], unknown>>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn<unknown[], unknown>(() => {
      throw new Error("summary helper attempted a network call");
    });
    (globalThis as unknown as { fetch: typeof globalThis.fetch }).fetch =
      fetchSpy as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      (globalThis as unknown as { fetch: typeof globalThis.fetch }).fetch =
        originalFetch;
    }
  });

  it("does not call fetch", () => {
    summarizeLocalCapabilities([CHAT, CODE, VISION, EMBED, LONG_CTX]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not write to localStorage", () => {
    const source = summarizeLocalCapabilities.toString();
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });
});
