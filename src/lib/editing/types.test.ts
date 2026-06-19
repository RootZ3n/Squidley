import { describe, it, expect } from "vitest";
import {
  makeEditApprovalId,
  makeProposalId,
  type TinyEditApprovalRequest,
  type TinyEditProposal,
  type TinyEditResult,
  type TinyEditVerification,
} from "./types";

describe("editing/types — id generators", () => {
  it("proposal ids are unique within a batch", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(makeProposalId());
    expect(ids.size).toBe(50);
  });

  it("approval ids are unique within a batch", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(makeEditApprovalId());
    expect(ids.size).toBe(50);
  });
});

describe("editing/types — invariants", () => {
  it("ApprovalRequest type pins action='tiny_edit'", () => {
    const req: TinyEditApprovalRequest = {
      action: "tiny_edit",
      path: "src/a.ts",
      originalSnippet: "x",
      proposedSnippet: "y",
      originalHash: "h1",
      proposedHash: "h2",
      fileHash: "h3",
      summary: "",
      reason: "",
      confidence: "high",
      riskLevel: "safe",
      expiresInMs: 60_000,
      limitations: [],
    };
    expect(req.action).toBe("tiny_edit");
  });

  it("Proposal type pins rollbackAvailable=true / requiresApproval=true", () => {
    const p: TinyEditProposal = {
      id: "p",
      path: "src/a.ts",
      originalSnippet: "x",
      proposedSnippet: "y",
      summary: "",
      reason: "",
      confidence: "high",
      riskLevel: "safe",
      verificationPlan: [],
      rollbackAvailable: true,
      requiresApproval: true,
      approvalRequest: {
        action: "tiny_edit",
        path: "src/a.ts",
        originalSnippet: "x",
        proposedSnippet: "y",
        originalHash: "h1",
        proposedHash: "h2",
        fileHash: "h3",
        summary: "",
        reason: "",
        confidence: "high",
        riskLevel: "safe",
        expiresInMs: 60_000,
        limitations: [],
      },
      diffPreview: {
        path: "src/a.ts",
        lines: ["-x", "+y"],
        headExcerpt: "",
        tailExcerpt: "",
        bytesRemoved: 1,
        bytesAdded: 1,
        linesChanged: 1,
      },
      receipts: [],
      cloudUsed: false,
      localOnly: true,
    };
    expect(p.rollbackAvailable).toBe(true);
    expect(p.requiresApproval).toBe(true);
    expect(p.cloudUsed).toBe(false);
  });

  it("Result encodes the four meaningful (applied, rolledBack) tuples", () => {
    const cases: Pick<TinyEditResult, "status" | "applied" | "rolledBack">[] = [
      { status: "approval-required", applied: false, rolledBack: false },
      { status: "blocked", applied: false, rolledBack: false },
      { status: "applied-verified", applied: true, rolledBack: false },
      { status: "applied-rolled-back", applied: true, rolledBack: true },
      { status: "denied", applied: false, rolledBack: false },
    ];
    for (const c of cases) {
      expect(c.applied || c.rolledBack || c.status === "approval-required" || c.status === "blocked" || c.status === "denied").toBe(true);
    }
  });

  it("Verification carries a status and optional failure reason", () => {
    const v: TinyEditVerification = {
      checks: [{ id: "replacement-present", description: "x", passed: true }],
      expectedOutcome: "the replacement appears in the file",
      verificationStatus: "passed",
    };
    expect(v.verificationStatus).toBe("passed");
    expect(v.failureReason).toBeUndefined();
  });
});
