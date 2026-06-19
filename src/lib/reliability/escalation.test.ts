import { describe, it, expect } from "vitest";
import {
  buildCloudPacketPreviewedReceipt,
  buildConsentDecisionReceipt,
  buildEscalationOffer,
  buildEscalationOfferedReceipt,
  buildEscalationTimelineNoConsent,
  buildLocalFailedReceipt,
} from "@/lib/reliability/escalation";
import { createSmallModelTask } from "@/lib/reliability/types";

const task = createSmallModelTask({ userPrompt: "fix the build please" });

describe("reliability/escalation", () => {
  it("escalation offer is always non-sent and cloudUsed=false", () => {
    const offer = buildEscalationOffer({
      task,
      localFailureSummary: "model returned empty content",
      proposedPromptForCloud: "Please continue: fix the build",
      cloudConfigured: false,
    });
    expect(offer).not.toBeNull();
    expect(offer!.cloudUsed).toBe(false);
    expect(offer!.consentState).toBe("pending");
  });

  it("offer redacts emails and secrets in the proposed prompt", () => {
    const offer = buildEscalationOffer({
      task,
      localFailureSummary: "x",
      proposedPromptForCloud:
        "Email me at alice@example.com using token=ghp_abcdefghijklmnop1234",
      cloudConfigured: true,
    });
    expect(offer).not.toBeNull();
    const preview = offer!.redactedPreview.redactedText;
    expect(preview).not.toMatch(/alice@example\.com/);
    expect(preview).not.toMatch(/ghp_abcdefghijklmnop/);
  });

  it("returns null offer when nothing to send", () => {
    const offer = buildEscalationOffer({
      task,
      localFailureSummary: "x",
      proposedPromptForCloud: "   ",
      cloudConfigured: true,
    });
    expect(offer).toBeNull();
  });

  it("every receipt event records cloud_used=false", () => {
    const failed = buildLocalFailedReceipt({ task, summary: "failed" });
    expect(failed.receipt.cloudUsed).toBe(false);
    expect(failed.receipt.metadata?.cloud_used).toBe(false);

    const offer = buildEscalationOffer({
      task,
      localFailureSummary: "failed",
      proposedPromptForCloud: "please help",
      cloudConfigured: false,
    })!;

    for (const event of [
      buildEscalationOfferedReceipt({ offer }),
      buildCloudPacketPreviewedReceipt({ offer }),
      buildConsentDecisionReceipt({ offer, decision: "denied" }),
      buildConsentDecisionReceipt({ offer, decision: "granted" }),
      buildConsentDecisionReceipt({ offer, decision: "skipped" }),
    ]) {
      expect(event.receipt.cloudUsed).toBe(false);
      expect(event.receipt.metadata?.cloud_used).toBe(false);
    }
  });

  it("buildEscalationTimelineNoConsent yields a complete event sequence with no cloud call", () => {
    const { offer, events } = buildEscalationTimelineNoConsent({
      task,
      localFailureSummary: "model returned empty content",
      proposedPromptForCloud: "Please continue: build error",
      cloudConfigured: true,
      decision: "skipped",
    });
    expect(offer).not.toBeNull();
    const kinds = events.map((e) => e.kind);
    expect(kinds).toEqual([
      "local_failed",
      "escalation_offered",
      "cloud_packet_previewed",
      "skipped",
    ]);
    for (const e of events) expect(e.receipt.cloudUsed).toBe(false);
  });

  it("granted consent does NOT silently call cloud — summary is honest", () => {
    const offer = buildEscalationOffer({
      task,
      localFailureSummary: "x",
      proposedPromptForCloud: "do the thing",
      cloudConfigured: true,
    })!;
    const event = buildConsentDecisionReceipt({ offer, decision: "granted" });
    expect(event.receipt.cloudUsed).toBe(false);
    expect(event.receipt.summary).toMatch(/does not yet wire a cloud call/);
  });
});
