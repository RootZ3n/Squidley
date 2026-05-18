import { describe, it, expect } from "vitest";
import {
  FILE_APPROVAL_TTL_MS,
  buildFileInspectionApproval,
  checkFileInspectionApproval,
} from "./fileApproval";

describe("fileApproval — happy path", () => {
  it("validates a fresh approval whose path matches", () => {
    const now = 1_700_000_000_000;
    const approval = buildFileInspectionApproval({ path: "src/app/page.tsx", now });
    const r = checkFileInspectionApproval(approval, {
      requestedPath: "src/app/page.tsx",
      now,
    });
    expect(r.ok).toBe(true);
  });
});

describe("fileApproval — rejections", () => {
  it("rejects when no approval supplied", () => {
    const r = checkFileInspectionApproval(undefined, { requestedPath: "x.ts" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-approval");
  });

  it("rejects when approval is not an object", () => {
    const r = checkFileInspectionApproval("not an object", { requestedPath: "x.ts" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("malformed");
  });

  it("rejects when action is wrong", () => {
    const r = checkFileInspectionApproval(
      {
        action: "make_small_text_change_and_verify",
        path: "x.ts",
        approvedAt: Date.now(),
        approvalId: "id",
      },
      { requestedPath: "x.ts" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("wrong-action");
  });

  it("rejects when path differs from requested path", () => {
    const approval = buildFileInspectionApproval({ path: "src/a.ts" });
    const r = checkFileInspectionApproval(approval, { requestedPath: "src/b.ts" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("path-mismatch");
  });

  it("rejects expired approvals", () => {
    const now = 1_700_000_000_000;
    const approval = buildFileInspectionApproval({
      path: "src/a.ts",
      now: now - FILE_APPROVAL_TTL_MS - 1000,
    });
    const r = checkFileInspectionApproval(approval, {
      requestedPath: "src/a.ts",
      now,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("rejects timestamps in the far future", () => {
    const now = 1_700_000_000_000;
    const approval = buildFileInspectionApproval({
      path: "src/a.ts",
      now: now + 10 * 60_000,
    });
    const r = checkFileInspectionApproval(approval, {
      requestedPath: "src/a.ts",
      now,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("rejects malformed approvals missing required fields", () => {
    const r1 = checkFileInspectionApproval(
      { action: "inspect_one_file_safely" },
      { requestedPath: "x.ts" },
    );
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe("malformed");

    const r2 = checkFileInspectionApproval(
      { action: "inspect_one_file_safely", path: "x.ts", approvedAt: "now", approvalId: "a" },
      { requestedPath: "x.ts" },
    );
    expect(r2.ok).toBe(false);
  });
});
