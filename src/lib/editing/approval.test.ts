import { describe, it, expect } from "vitest";
import {
  TINY_EDIT_APPROVAL_TTL_MS,
  buildEditApprovalToken,
  checkEditApproval,
} from "./approval";

const baseHashes = {
  requestedOriginalHash: "h1",
  requestedProposedHash: "h2",
  requestedFileHash: "h3",
};

describe("editing/approval — happy path", () => {
  it("accepts a fresh, fully-bound token", () => {
    const now = 1_700_000_000_000;
    const t = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: "h1",
      proposedHash: "h2",
      fileHash: "h3",
      now,
    });
    const r = checkEditApproval(t, {
      requestedPath: "src/a.ts",
      ...baseHashes,
      now,
    });
    expect(r.ok).toBe(true);
  });
});

describe("editing/approval — rejections", () => {
  it("rejects missing approval", () => {
    const r = checkEditApproval(undefined, {
      requestedPath: "x.ts",
      ...baseHashes,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-approval");
  });

  it("rejects wrong action", () => {
    const r = checkEditApproval(
      {
        action: "inspect_one_file_safely",
        path: "x.ts",
        originalHash: "h1",
        proposedHash: "h2",
        fileHash: "h3",
        approvedAt: Date.now(),
        approvalId: "id",
      },
      { requestedPath: "x.ts", ...baseHashes },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("wrong-action");
  });

  it("rejects path mismatch", () => {
    const t = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: "h1",
      proposedHash: "h2",
      fileHash: "h3",
    });
    const r = checkEditApproval(t, {
      requestedPath: "src/b.ts",
      ...baseHashes,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("path-mismatch");
  });

  it("rejects original-hash drift", () => {
    const t = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: "h1",
      proposedHash: "h2",
      fileHash: "h3",
    });
    const r = checkEditApproval(t, {
      requestedPath: "src/a.ts",
      requestedOriginalHash: "DIFFERENT",
      requestedProposedHash: "h2",
      requestedFileHash: "h3",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("original-hash-mismatch");
  });

  it("rejects proposed-hash drift", () => {
    const t = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: "h1",
      proposedHash: "h2",
      fileHash: "h3",
    });
    const r = checkEditApproval(t, {
      requestedPath: "src/a.ts",
      requestedOriginalHash: "h1",
      requestedProposedHash: "DIFFERENT",
      requestedFileHash: "h3",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("proposed-hash-mismatch");
  });

  it("rejects file-hash drift (replay blocked)", () => {
    const t = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: "h1",
      proposedHash: "h2",
      fileHash: "h3",
    });
    const r = checkEditApproval(t, {
      requestedPath: "src/a.ts",
      requestedOriginalHash: "h1",
      requestedProposedHash: "h2",
      requestedFileHash: "DIFFERENT",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("file-hash-mismatch");
  });

  it("rejects expired tokens", () => {
    const now = 1_700_000_000_000;
    const t = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: "h1",
      proposedHash: "h2",
      fileHash: "h3",
      now: now - TINY_EDIT_APPROVAL_TTL_MS - 1000,
    });
    const r = checkEditApproval(t, {
      requestedPath: "src/a.ts",
      ...baseHashes,
      now,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });
});
