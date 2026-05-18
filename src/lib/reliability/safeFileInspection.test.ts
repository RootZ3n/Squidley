import { describe, it, expect } from "vitest";
import {
  type FileInspectionReader,
  safeFileInspect,
} from "./safeFileInspection";
import { buildFileInspectionApproval } from "./fileApproval";
import { MAX_INSPECT_FILE_BYTES } from "./fileSafety";

const ROOT = "/repo";

function makeReader(
  files: Record<string, { size?: number; content?: string; statFails?: boolean }>,
): FileInspectionReader {
  return {
    async stat(absolutePath) {
      const f = files[absolutePath];
      if (!f) return { ok: false, reason: "no such file" };
      if (f.statFails) return { ok: false, reason: "stat failed" };
      return { ok: true, size: f.size ?? (f.content?.length ?? 0) };
    },
    async readFile(absolutePath) {
      const f = files[absolutePath];
      if (!f) throw new Error("no such file");
      return f.content ?? "";
    },
  };
}

describe("safeFileInspect — approval flow", () => {
  it("returns approval-required when no approval supplied", async () => {
    const reader = makeReader({
      "/repo/src/app/page.tsx": { content: "export default function Page() {}" },
    });
    const r = await safeFileInspect({
      path: "src/app/page.tsx",
      reason: "user asked to explain it",
      projectRoot: ROOT,
      reader,
    });
    expect(r.status).toBe("approval-required");
    expect(r.approvalRequest?.path).toBe("src/app/page.tsx");
    expect(r.approvalRequest?.action).toBe("inspect_one_file_safely");
    expect(r.approvalRequest?.willNotRead.length).toBeGreaterThan(0);
    expect(r.cloudUsed).toBe(false);
    expect(r.receipts.some((x) => x.action === "reliability.file-inspection-requested")).toBe(true);
  });

  it("inspects successfully when approval is valid", async () => {
    const reader = makeReader({
      "/repo/src/app/page.tsx": {
        content: "export default function Page() { return null; }",
      },
    });
    const approval = buildFileInspectionApproval({ path: "src/app/page.tsx" });
    const r = await safeFileInspect({
      path: "src/app/page.tsx",
      reason: "explain",
      projectRoot: ROOT,
      reader,
      approval,
    });
    expect(r.status).toBe("completed");
    expect(r.ok).toBe(true);
    expect(r.packedContext?.includedItems[0].label).toBe("src/app/page.tsx");
    expect(r.receipts.map((x) => x.action)).toEqual(
      expect.arrayContaining([
        "reliability.file-inspection-approved",
        "reliability.file-inspection-redacted",
        "reliability.file-inspection-packed",
        "reliability.file-inspection-completed",
      ]),
    );
    expect(r.receipts.every((x) => x.cloudUsed === false)).toBe(true);
  });

  it("denies a stale/mismatched approval", async () => {
    const reader = makeReader({
      "/repo/src/a.ts": { content: "x" },
    });
    const approval = buildFileInspectionApproval({ path: "src/other.ts" });
    const r = await safeFileInspect({
      path: "src/a.ts",
      reason: "explain",
      projectRoot: ROOT,
      reader,
      approval,
    });
    expect(r.status).toBe("denied");
    expect(r.receipts.some((x) => x.action === "reliability.file-inspection-denied")).toBe(true);
  });
});

describe("safeFileInspect — path safety blocks (no read ever happens)", () => {
  it("blocks traversal", async () => {
    let readCount = 0;
    const reader: FileInspectionReader = {
      async stat() { readCount++; return { ok: false }; },
      async readFile() { readCount++; return ""; },
    };
    const r = await safeFileInspect({
      path: "../etc/passwd",
      reason: "?",
      projectRoot: ROOT,
      reader,
      approval: buildFileInspectionApproval({ path: "../etc/passwd" }),
    });
    expect(r.status).toBe("blocked");
    expect(readCount).toBe(0);
    expect(r.receipts[0].action).toBe("reliability.file-inspection-blocked");
  });

  it("blocks absolute paths outside the root", async () => {
    const reader = makeReader({});
    const r = await safeFileInspect({
      path: "/etc/passwd",
      reason: "?",
      projectRoot: ROOT,
      reader,
      approval: buildFileInspectionApproval({ path: "/etc/passwd" }),
    });
    expect(r.status).toBe("blocked");
  });

  it("blocks .env even with approval", async () => {
    const reader = makeReader({});
    const r = await safeFileInspect({
      path: ".env",
      reason: "?",
      projectRoot: ROOT,
      reader,
      approval: buildFileInspectionApproval({ path: ".env" }),
    });
    expect(r.status).toBe("blocked");
  });

  it("blocks node_modules/.git/.next/dist/build/coverage", async () => {
    const reader = makeReader({});
    for (const seg of ["node_modules", ".git", ".next", "dist", "build", "coverage"]) {
      const path = `${seg}/some.ts`;
      const r = await safeFileInspect({
        path,
        reason: "?",
        projectRoot: ROOT,
        reader,
        approval: buildFileInspectionApproval({ path }),
      });
      expect(r.status).toBe("blocked");
    }
  });

  it("blocks disallowed extensions even when path is otherwise fine", async () => {
    const reader = makeReader({});
    const r = await safeFileInspect({
      path: "data/secret.bin",
      reason: "?",
      projectRoot: ROOT,
      reader,
      approval: buildFileInspectionApproval({ path: "data/secret.bin" }),
    });
    expect(r.status).toBe("blocked");
  });

  it("blocks files above MAX_INSPECT_FILE_BYTES at stat time", async () => {
    const reader = makeReader({
      "/repo/big.ts": { size: MAX_INSPECT_FILE_BYTES + 1024, content: "x" },
    });
    const r = await safeFileInspect({
      path: "big.ts",
      reason: "?",
      projectRoot: ROOT,
      reader,
      approval: buildFileInspectionApproval({ path: "big.ts" }),
    });
    expect(r.status).toBe("blocked");
  });
});

describe("safeFileInspect — redaction", () => {
  it("redacts obvious secrets in file content", async () => {
    const body =
      "// some comment\nconst t = 'sk-aaaaaaaaaaaaaaaaaaaaaaaa';\n" +
      "export function f() {}";
    const reader = makeReader({
      "/repo/src/a.ts": { content: body },
    });
    const r = await safeFileInspect({
      path: "src/a.ts",
      reason: "?",
      projectRoot: ROOT,
      reader,
      approval: buildFileInspectionApproval({ path: "src/a.ts" }),
    });
    expect(r.status).toBe("completed");
    expect(r.redactionsApplied.length).toBeGreaterThan(0);
    expect(r.packedContext?.includedItems[0].body).not.toMatch(
      /sk-aaaaaaaaaaaaaaaaaaaaaaaa/,
    );
    const redactedReceipt = r.receipts.find(
      (x) => x.action === "reliability.file-inspection-redacted",
    );
    expect(redactedReceipt?.metadata?.total_redactions).toBeGreaterThanOrEqual(1);
  });

  it("never stores raw secret values in receipts", async () => {
    const body = "GITHUB_TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaa";
    const reader = makeReader({
      "/repo/src/a.ts": { content: body },
    });
    const r = await safeFileInspect({
      path: "src/a.ts",
      reason: "?",
      projectRoot: ROOT,
      reader,
      approval: buildFileInspectionApproval({ path: "src/a.ts" }),
    });
    for (const receipt of r.receipts) {
      const blob = JSON.stringify(receipt);
      expect(blob).not.toMatch(/ghp_aaaaaaaaaaaaaaaaaaaaaaaa/);
    }
  });
});

describe("safeFileInspect — invariants", () => {
  it("every receipt asserts cloudUsed=false and read_only=true", async () => {
    const reader = makeReader({ "/repo/src/a.ts": { content: "ok" } });
    const r = await safeFileInspect({
      path: "src/a.ts",
      reason: "?",
      projectRoot: ROOT,
      reader,
      approval: buildFileInspectionApproval({ path: "src/a.ts" }),
    });
    for (const receipt of r.receipts) {
      expect(receipt.cloudUsed).toBe(false);
      expect(receipt.metadata?.cloud_used).toBe(false);
      expect(receipt.metadata?.read_only).toBe(true);
    }
  });

  it("reader interface has no write method (compile-time + structural)", () => {
    const reader: FileInspectionReader = {
      async stat() { return { ok: true, size: 1 }; },
      async readFile() { return ""; },
    };
    // Structural check: confirm no writeFile / appendFile / unlink etc.
    const keys = Object.keys(reader);
    expect(keys).toContain("stat");
    expect(keys).toContain("readFile");
    expect(keys).not.toContain("writeFile");
    expect(keys).not.toContain("appendFile");
    expect(keys).not.toContain("unlink");
  });
});
