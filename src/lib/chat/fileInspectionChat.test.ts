import { describe, it, expect } from "vitest";
import { handleFileInspectionRequest } from "./fileInspectionChat";
import { buildFileInspectionApproval } from "@/lib/reliability/fileApproval";
import type { FileInspectionReader } from "@/lib/reliability/safeFileInspection";

const ROOT = "/repo";

function makeReader(
  files: Record<string, { size?: number; content?: string }>,
): FileInspectionReader {
  return {
    async stat(absolutePath) {
      const f = files[absolutePath];
      if (!f) return { ok: false, reason: "no such file" };
      return { ok: true, size: f.size ?? (f.content?.length ?? 0) };
    },
    async readFile(absolutePath) {
      const f = files[absolutePath];
      if (!f) throw new Error("no such file");
      return f.content ?? "";
    },
  };
}

describe("handleFileInspectionRequest — needs path", () => {
  it("returns needs-path when no path was extracted", async () => {
    const r = await handleFileInspectionRequest({
      message: "summarize this file",
      path: null,
      projectRoot: ROOT,
      reader: makeReader({}),
    });
    expect(r.status).toBe("needs-path");
    expect(r.reply).toMatch(/Please name the file/);
    expect(r.cloudUsed).toBe(false);
  });
});

describe("handleFileInspectionRequest — approval flow", () => {
  it("returns approval-required when no approval supplied", async () => {
    const r = await handleFileInspectionRequest({
      message: "explain src/app/page.tsx",
      path: "src/app/page.tsx",
      projectRoot: ROOT,
      reader: makeReader({ "/repo/src/app/page.tsx": { content: "ok" } }),
    });
    expect(r.status).toBe("approval-required");
    expect(r.approvalRequest?.path).toBe("src/app/page.tsx");
    expect(r.approvalRequest?.willNotRead.length).toBeGreaterThan(0);
  });

  it("inspects after approval and returns the packed summary in the reply", async () => {
    const body =
      "export function add(a, b) { return a + b; }\nexport const PI = 3.14;";
    const r = await handleFileInspectionRequest({
      message: "what does src/math.ts do?",
      path: "src/math.ts",
      projectRoot: ROOT,
      reader: makeReader({ "/repo/src/math.ts": { content: body } }),
      approval: buildFileInspectionApproval({ path: "src/math.ts" }),
    });
    expect(r.status).toBe("completed");
    expect(r.ok).toBe(true);
    expect(r.reply).toMatch(/read-only inspection/);
    expect(r.reply).toMatch(/export function add/);
    expect(r.cloudUsed).toBe(false);
  });

  it("denies a mismatched approval and never reads", async () => {
    let readCount = 0;
    const reader: FileInspectionReader = {
      async stat() { return { ok: true, size: 0 }; },
      async readFile() { readCount++; return ""; },
    };
    const r = await handleFileInspectionRequest({
      message: "inspect src/a.ts",
      path: "src/a.ts",
      projectRoot: ROOT,
      reader,
      approval: buildFileInspectionApproval({ path: "src/other.ts" }),
    });
    expect(r.status).toBe("denied");
    expect(readCount).toBe(0);
  });
});

describe("handleFileInspectionRequest — blocking", () => {
  it("blocks .env even with approval", async () => {
    const r = await handleFileInspectionRequest({
      message: "inspect .env",
      path: ".env",
      projectRoot: ROOT,
      reader: makeReader({}),
      approval: buildFileInspectionApproval({ path: ".env" }),
    });
    expect(r.status).toBe("blocked");
    expect(r.reply).toMatch(/refused/i);
  });

  it("blocks traversal in path", async () => {
    const r = await handleFileInspectionRequest({
      message: "inspect ../etc/passwd",
      path: "../etc/passwd",
      projectRoot: ROOT,
      reader: makeReader({}),
      approval: buildFileInspectionApproval({ path: "../etc/passwd" }),
    });
    expect(r.status).toBe("blocked");
  });

  it("never streams or echoes file content without approval", async () => {
    const r = await handleFileInspectionRequest({
      message: "explain src/secret-thoughts.ts",
      path: "src/secret-thoughts.ts",
      projectRoot: ROOT,
      reader: makeReader({
        "/repo/src/secret-thoughts.ts": { content: "this should not leak" },
      }),
    });
    expect(r.status).toBe("approval-required");
    expect(r.reply).not.toMatch(/this should not leak/);
  });
});

describe("handleFileInspectionRequest — invariants", () => {
  it("every receipt asserts cloudUsed=false and read_only=true on the wrap path", async () => {
    const r = await handleFileInspectionRequest({
      message: "explain src/app/page.tsx",
      path: "src/app/page.tsx",
      projectRoot: ROOT,
      reader: makeReader({ "/repo/src/app/page.tsx": { content: "ok" } }),
      approval: buildFileInspectionApproval({ path: "src/app/page.tsx" }),
    });
    for (const receipt of r.receipts) {
      expect(receipt.cloudUsed).toBe(false);
      expect(receipt.metadata?.cloud_used).toBe(false);
      expect(receipt.metadata?.read_only).toBe(true);
    }
  });
});
