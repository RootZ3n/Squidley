import { describe, it, expect } from "vitest";
import {
  applyTinyEdit,
  buildEditApprovalToken,
  defaultNodeEditor,
  defaultNodeHasher,
  proposeTinyEdit,
  type FileEditor,
} from "./apply";

const ROOT = "/repo";

// Tiny in-memory editor for tests
function makeEditor(files: Record<string, string>): FileEditor & {
  contents: Record<string, string>;
  writes: string[];
} {
  const contents = { ...files };
  const writes: string[] = [];
  return {
    contents,
    writes,
    async stat(absolutePath) {
      if (!(absolutePath in contents)) return { ok: false, reason: "no such file" };
      return { ok: true, size: contents[absolutePath].length };
    },
    async readFile(absolutePath) {
      if (!(absolutePath in contents)) throw new Error("no such file");
      return contents[absolutePath];
    },
    async writeFile(absolutePath, c) {
      writes.push(absolutePath);
      contents[absolutePath] = c;
    },
  };
}

const fakeHash =
  (suffix = "") =>
  async (content: string) => `sha256(${content.length}:${content.slice(0, 8)}${suffix})`;

describe("proposeTinyEdit — Phase A", () => {
  it("builds an approval-required proposal without writing", async () => {
    const editor = makeEditor({ "/repo/src/a.ts": "export const greeting = 'hello';\n" });
    const result = await proposeTinyEdit({
      path: "src/a.ts",
      originalSnippet: "'hello'",
      proposedSnippet: "'hi'",
      reason: "rename greeting",
      projectRoot: ROOT,
      inspectedPaths: ["src/a.ts"],
      editor,
      hashContent: fakeHash(),
    });
    expect(result.status).toBe("approval-required");
    expect(result.applied).toBe(false);
    expect(result.proposal?.approvalRequest.action).toBe("tiny_edit");
    expect(result.diffPreview?.bytesRemoved).toBeGreaterThan(0);
    expect(result.receipts.some((r) => r.action === "editing.proposed")).toBe(true);
    expect(result.receipts.some((r) => r.action === "editing.approval-requested")).toBe(true);
    expect(editor.writes.length).toBe(0);
  });

  it("blocks when path was not inspected", async () => {
    const editor = makeEditor({ "/repo/src/a.ts": "abc" });
    const result = await proposeTinyEdit({
      path: "src/a.ts",
      originalSnippet: "abcd",
      proposedSnippet: "wxyz",
      reason: "",
      projectRoot: ROOT,
      inspectedPaths: [],
      editor,
      hashContent: fakeHash(),
    });
    expect(result.status).toBe("blocked");
    expect(result.summary).toMatch(/inspection/i);
    expect(editor.writes.length).toBe(0);
  });

  it("blocks blocked paths even with inspection", async () => {
    const editor = makeEditor({});
    const result = await proposeTinyEdit({
      path: ".env",
      originalSnippet: "abcd",
      proposedSnippet: "wxyz",
      reason: "",
      projectRoot: ROOT,
      inspectedPaths: [".env"],
      editor,
      hashContent: fakeHash(),
    });
    expect(result.status).toBe("blocked");
  });
});

describe("applyTinyEdit — Phase B", () => {
  it("denies without approval", async () => {
    const editor = makeEditor({ "/repo/src/a.ts": "hello there world" });
    const result = await applyTinyEdit({
      path: "src/a.ts",
      originalSnippet: "hello",
      proposedSnippet: "howdy",
      approval: undefined,
      projectRoot: ROOT,
      inspectedPaths: ["src/a.ts"],
      editor,
      hashContent: fakeHash(),
    });
    expect(result.status).toBe("denied");
    expect(editor.writes.length).toBe(0);
  });

  it("denies on hash mismatch (original snippet differs)", async () => {
    const editor = makeEditor({ "/repo/src/a.ts": "hello there world" });
    const approval = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: "WRONG",
      proposedHash: await fakeHash()("howdy"),
      fileHash: await fakeHash()("hello there world"),
    });
    const result = await applyTinyEdit({
      path: "src/a.ts",
      originalSnippet: "hello",
      proposedSnippet: "howdy",
      approval,
      projectRoot: ROOT,
      inspectedPaths: ["src/a.ts"],
      editor,
      hashContent: fakeHash(),
    });
    expect(result.status).toBe("denied");
    expect(result.failureReason).toMatch(/original/i);
    expect(editor.writes.length).toBe(0);
  });

  it("denies on file-hash mismatch (file changed since approval)", async () => {
    const editor = makeEditor({ "/repo/src/a.ts": "hello there world" });
    const approval = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: await fakeHash()("hello"),
      proposedHash: await fakeHash()("howdy"),
      fileHash: "STALE", // file content has changed since proposal
    });
    const result = await applyTinyEdit({
      path: "src/a.ts",
      originalSnippet: "hello",
      proposedSnippet: "howdy",
      approval,
      projectRoot: ROOT,
      inspectedPaths: ["src/a.ts"],
      editor,
      hashContent: fakeHash(),
    });
    expect(result.status).toBe("denied");
    expect(result.failureReason).toMatch(/file changed/i);
  });

  it("applies and verifies on the happy path", async () => {
    const content = "export const greeting = 'hello world';\n";
    const editor = makeEditor({ "/repo/src/a.ts": content });
    const hash = fakeHash();
    const approval = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: await hash("'hello world'"),
      proposedHash: await hash("'hi squidley'"),
      fileHash: await hash(content),
    });
    const result = await applyTinyEdit({
      path: "src/a.ts",
      originalSnippet: "'hello world'",
      proposedSnippet: "'hi squidley'",
      approval,
      projectRoot: ROOT,
      inspectedPaths: ["src/a.ts"],
      editor,
      hashContent: hash,
    });
    expect(result.status).toBe("applied-verified");
    expect(result.applied).toBe(true);
    expect(result.rolledBack).toBe(false);
    expect(editor.contents["/repo/src/a.ts"]).toBe(
      "export const greeting = 'hi squidley';\n",
    );
    expect(result.receipts.map((r) => r.action)).toEqual(
      expect.arrayContaining(["editing.approved", "editing.applied", "editing.verified"]),
    );
  });

  it("rolls back when verification fails (unterminated string)", async () => {
    const content = "export const x = 'ok';";
    const editor = makeEditor({ "/repo/src/a.ts": content });
    const hash = fakeHash();
    const approval = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: await hash("'ok'"),
      proposedHash: await hash("'broken"),
      fileHash: await hash(content),
    });
    const result = await applyTinyEdit({
      path: "src/a.ts",
      originalSnippet: "'ok'",
      proposedSnippet: "'broken",
      approval,
      projectRoot: ROOT,
      inspectedPaths: ["src/a.ts"],
      editor,
      hashContent: hash,
    });
    expect(result.status).toBe("applied-rolled-back");
    expect(result.applied).toBe(true);
    expect(result.rolledBack).toBe(true);
    // File contents must be restored.
    expect(editor.contents["/repo/src/a.ts"]).toBe(content);
    expect(result.receipts.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        "editing.applied",
        "editing.rollback-started",
        "editing.rollback-completed",
      ]),
    );
  });

  it("blocks when no occurrence is left (stale anchor)", async () => {
    const editor = makeEditor({ "/repo/src/a.ts": "changed already" });
    const hash = fakeHash();
    const approval = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: await hash("hello world"),
      proposedHash: await hash("hi squidley"),
      fileHash: await hash("changed already"),
    });
    const result = await applyTinyEdit({
      path: "src/a.ts",
      originalSnippet: "hello world",
      proposedSnippet: "hi squidley",
      approval,
      projectRoot: ROOT,
      inspectedPaths: ["src/a.ts"],
      editor,
      hashContent: hash,
    });
    expect(result.status).toBe("blocked");
    expect(editor.writes.length).toBe(0);
  });

  it("blocks when anchor is ambiguous (multiple occurrences)", async () => {
    const editor = makeEditor({
      "/repo/src/a.ts": "hello world\nhello world\n",
    });
    const hash = fakeHash();
    const approval = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: await hash("hello world"),
      proposedHash: await hash("hi squidley"),
      fileHash: await hash("hello world\nhello world\n"),
    });
    const result = await applyTinyEdit({
      path: "src/a.ts",
      originalSnippet: "hello world",
      proposedSnippet: "hi squidley",
      approval,
      projectRoot: ROOT,
      inspectedPaths: ["src/a.ts"],
      editor,
      hashContent: hash,
    });
    expect(result.status).toBe("blocked");
    expect(editor.writes.length).toBe(0);
  });
});

describe("apply — invariants", () => {
  it("every receipt asserts cloudUsed=false + tiny_edit=true", async () => {
    const editor = makeEditor({ "/repo/src/a.ts": "abcd hello there world" });
    const result = await proposeTinyEdit({
      path: "src/a.ts",
      originalSnippet: "hello",
      proposedSnippet: "howdy",
      reason: "",
      projectRoot: ROOT,
      inspectedPaths: ["src/a.ts"],
      editor,
      hashContent: fakeHash(),
    });
    for (const r of result.receipts) {
      expect(r.cloudUsed).toBe(false);
      expect(r.metadata?.cloud_used).toBe(false);
      expect(r.metadata?.tiny_edit).toBe(true);
    }
  });

  it("FileEditor public type does not expose shell/delete/rename", () => {
    const e: FileEditor = defaultNodeEditor;
    const keys = Object.keys(e);
    expect(keys).toContain("stat");
    expect(keys).toContain("readFile");
    expect(keys).toContain("writeFile");
    expect(keys).not.toContain("unlink");
    expect(keys).not.toContain("rename");
    expect(keys).not.toContain("mkdir");
    expect(keys).not.toContain("exec");
    expect(keys).not.toContain("spawn");
  });

  it("default node hasher produces a stable hex sha256", async () => {
    const a = await defaultNodeHasher("hello");
    const b = await defaultNodeHasher("hello");
    const c = await defaultNodeHasher("hellox");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
