import { describe, it, expect } from "vitest";
import {
  RELIABILITY_HEADLINES,
  buildReliabilityIntroCard,
  summarizeReliabilityResultForBeginner,
} from "@/lib/reliability/copy";
import type { ReliabilityResult } from "@/lib/reliability/types";

const baseResult = (
  overrides: Partial<ReliabilityResult> = {},
): ReliabilityResult => ({
  ok: false,
  finalAnswer: "",
  steps: [],
  localOnly: true,
  cloudSuggested: false,
  cloudUsed: false,
  receipts: [],
  ...overrides,
});

describe("reliability/copy", () => {
  it("headlines are beginner-friendly questions", () => {
    expect(RELIABILITY_HEADLINES.whyDecompose).toMatch(/why/i);
    expect(RELIABILITY_HEADLINES.whyAskBeforeCloud).toMatch(/cloud/i);
  });

  it("intro card lists guardrails without overselling", () => {
    const card = buildReliabilityIntroCard();
    expect(card.bullets.length).toBeGreaterThanOrEqual(4);
    expect(card.footnote).toMatch(/local-first/i);
    // Honest about limits — never claims always-works.
    expect(card.body).not.toMatch(/always|guaranteed|never fails/i);
  });

  it("success summary mentions local + check", () => {
    const s = summarizeReliabilityResultForBeginner(baseResult({ ok: true }));
    expect(s).toMatch(/local/i);
  });

  it("escalation-offered summary mentions cloud and nothing-sent", () => {
    const s = summarizeReliabilityResultForBeginner(
      baseResult({ cloudSuggested: true }),
    );
    expect(s).toMatch(/cloud/i);
    expect(s).toMatch(/nothing/i);
  });

  it("decomposed summary mentions smaller steps", () => {
    const s = summarizeReliabilityResultForBeginner(
      baseResult({
        steps: [
          {
            kind: "decompose",
            status: "pass",
            summary: "decomposed",
            at: 0,
          },
        ],
      }),
    );
    expect(s).toMatch(/smaller/i);
  });
});
