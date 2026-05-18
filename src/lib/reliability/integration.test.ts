import { describe, it, expect } from "vitest";
import {
  buildReliabilityIntroCard,
  packContext,
  runReliability,
  summarizeReliabilityResultForBeginner,
  type ContextItem,
} from "@/lib/reliability";
import { createSmallModelTask } from "@/lib/reliability/types";

describe("reliability/integration", () => {
  it("runner never sets cloudUsed=true on any receipt across any path", async () => {
    const task = createSmallModelTask({ userPrompt: "x", policy: { maxRetries: 2 } });
    // Force a repeated failure to exercise the escalation path.
    const result = await runReliability({
      task,
      action: async () => ({
        ok: false,
        content: "",
        error: "ECONNREFUSED 127.0.0.1:11434",
      }),
      cloudConfigured: true,
    });
    expect(result.cloudUsed).toBe(false);
    for (const receipt of result.receipts) {
      expect(receipt.cloudUsed).toBe(false);
      expect(receipt.localOnly).toBe(true);
      // metadata may or may not contain cloud_used; when present, it must be false.
      if (receipt.metadata && "cloud_used" in receipt.metadata) {
        expect(receipt.metadata.cloud_used).toBe(false);
      }
    }
  });

  it("rendered summary for a successful run reads as honest local-only", async () => {
    const task = createSmallModelTask({ userPrompt: "?" });
    const result = await runReliability({
      task,
      action: async () => ({ ok: true, content: "the answer" }),
    });
    const sentence = summarizeReliabilityResultForBeginner(result);
    expect(sentence).toMatch(/local/i);
    expect(sentence).not.toMatch(/cloud/i);
  });

  it("packs context AND surfaces what was omitted before any model call", () => {
    const items: ContextItem[] = [
      { id: "big", kind: "snippet", label: "huge.ts", body: "x".repeat(200_000) },
      { id: "small", kind: "snippet", label: "ok.ts", body: "export const a = 1;" },
    ];
    const packed = packContext(items, { maxChars: 1000 });
    // Always disclose what was dropped.
    expect(packed.omittedItems.length + packed.truncationNotes.length).toBeGreaterThan(0);
  });

  it("intro card never claims always-works or guaranteed behavior", () => {
    const card = buildReliabilityIntroCard();
    const combined = `${card.body} ${card.footnote} ${card.bullets.join(" ")}`;
    expect(combined).not.toMatch(/always works|guaranteed|never fails|infallible/i);
  });

  it("a beginner-friendly final answer is produced even on the worst-case path", async () => {
    const task = createSmallModelTask({ userPrompt: "fix everything" });
    const result = await runReliability({
      task,
      action: async () => ({ ok: false, content: "", error: "model returned empty content" }),
      cloudConfigured: true,
    });
    expect(result.ok).toBe(false);
    expect(result.finalAnswer.length).toBeGreaterThan(0);
    expect(result.finalAnswer).toMatch(/smaller|safe|next/i);
  });
});
