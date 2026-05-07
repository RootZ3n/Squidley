import { describe, expect, it } from "vitest";
import { VELUM_RECEIPT_ACTION } from "./constants";
import {
  buildVelumHandoffFromColloquiumReceipt,
  buildVelumRedactionCreatedReceipt,
  buildVelumReviewReceipt,
} from "./receipts";
import type { VelumReviewResult } from "./review";

describe("Velum receipt builders", () => {
  it("summarizes review without raw reviewed text", () => {
    const review: VelumReviewResult = {
      overallRisk: "high",
      localOnly: true,
      cloudUsed: false,
      modelUsed: false,
      findings: [{
        id: "f1",
        category: "secret",
        severity: "high",
        label: "Possible secret",
        explanation: "Potential token.",
        matchedPreview: "[REDACTED_SECRET]",
      }],
    };
    const receipt = buildVelumReviewReceipt(review);
    expect(receipt).toMatchObject({
      module: "velum",
      action: VELUM_RECEIPT_ACTION.textReviewed,
      modelUsed: false,
    });
    expect(receipt.summary).toContain("findings: 1");
    expect(JSON.stringify(receipt)).not.toContain("sk-");
  });

  it("builds handoff and redaction receipts with no original text", () => {
    expect(buildVelumHandoffFromColloquiumReceipt()).toMatchObject({
      action: VELUM_RECEIPT_ACTION.handoffFromColloquium,
      modelUsed: false,
    });
    expect(buildVelumRedactionCreatedReceipt().summary).toMatch(/original text is not stored/i);
  });
});
