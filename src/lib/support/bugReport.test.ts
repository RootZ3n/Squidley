import { describe, expect, it } from "vitest";
import {
  buildBugReportBody,
  buildBugReportMailto,
  buildReceiptBugReportMailto,
  getConfiguredBugReportEmail,
} from "./bugReport";
import { createActivityReceipt } from "@/lib/activity-log/receipts";

describe("bug report helpers", () => {
  it("returns null when the bug report email is not configured", () => {
    expect(getConfiguredBugReportEmail("")).toBeNull();
    expect(getConfiguredBugReportEmail("not-an-email")).toBeNull();
    expect(buildBugReportMailto({ to: "", issueSummary: "Broken button" })).toBeNull();
  });

  it("builds an encoded mailto URL with subject and body", () => {
    const url = buildBugReportMailto({
      to: "bugs@example.com",
      issueSummary: "Chat button failed",
      pageModule: "Chat",
      localCloudMode: "local-only",
      model: "llama3.2",
      provider: "local",
      browserUserAgent: "Test Browser",
      currentUrl: "http://localhost:3000/chat",
    });

    expect(url).toContain("mailto:bugs%40example.com");
    expect(decodeURIComponent(url ?? "")).toContain("[Peh Public Bug] Chat button failed");
    expect(decodeURIComponent(url ?? "")).toContain("Product: Peh Public");
    expect(decodeURIComponent(url ?? "")).toContain("Page/module: Chat");
    expect(decodeURIComponent(url ?? "")).toContain("Model/provider: llama3.2 / local");
  });

  it("includes empty user-editable sections without collecting raw data automatically", () => {
    const body = buildBugReportBody({
      pageModule: "Settings",
      browserUserAgent: "Test Browser",
    });

    expect(body).toContain("What happened:\n");
    expect(body).toContain("What I expected:\n");
    expect(body).toContain("Steps to reproduce:");
    expect(body).toContain("Privacy note:");
    expect(body).not.toContain("raw prompt:");
    expect(body).not.toContain("localStorage");
  });

  it("builds receipt-aware reports from safe receipt fields only", () => {
    const receipt = createActivityReceipt({
      id: "receipt-123",
      module: "velum",
      action: "velum.review",
      status: "succeeded",
      title: "Velum review completed",
      summary: "Reviewed pasted text and found 2 possible risk signals.",
      modelUsed: false,
      metadata: {
        risk: "high",
        categories: "possible-secret,prompt-injection",
        findingCount: 2,
      },
    });
    const url = buildReceiptBugReportMailto({
      to: "bugs@example.com",
      receipt,
      browserUserAgent: "Test Browser",
      currentUrl: "http://localhost:3000/tabularium?receipt=receipt-123",
    });
    const decoded = decodeURIComponent(url ?? "");

    expect(decoded).toContain("ActivityLog receipt id: receipt-123");
    expect(decoded).toContain("- Module: velum");
    expect(decoded).toContain("- Action: velum.review");
    expect(decoded).toContain("- Safe summary: Reviewed pasted text");
    expect(decoded).toContain("risk: high");
    expect(decoded).toContain("findingCount: 2");
    expect(decoded).not.toContain("sk-test-secret");
    expect(decoded).not.toContain("data:image");
    expect(decoded).not.toContain("full prompt");
  });

  it("keeps receipt report URL free of raw content fields", () => {
    const receipt = createActivityReceipt({
      id: "receipt-raw-check",
      module: "workshop",
      action: "workshop.single-file-suggestion.succeeded",
      title: "Workshop suggestion completed",
      summary: "Created a single-file suggestion.",
      model: "local-model",
      provider: "local",
      metadata: {
        sourceChars: 120,
        outputChars: 240,
      },
    });
    const decoded = decodeURIComponent(buildReceiptBugReportMailto({ to: "bugs@example.com", receipt }) ?? "");

    expect(decoded).toContain("sourceChars: 120");
    expect(decoded).toContain("outputChars: 240");
    expect(decoded).not.toContain("function secret");
    expect(decoded).not.toContain("BEGIN PRIVATE KEY");
  });
});
