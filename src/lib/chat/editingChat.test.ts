import { describe, it, expect } from "vitest";
import { handleEditingChatRequest } from "./editingChat";
import { buildEditApprovalToken } from "@/lib/editing";
import type { FileEditor, ContentHasher } from "@/lib/editing";

const ROOT = "/repo";

function makeEditor(files: Record<string, string>) {
  const contents = { ...files };
  const writes: string[] = [];
  const editor: FileEditor = {
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
  return { editor, contents, writes };
}

const fakeHash: ContentHasher = async (c) =>
  `sha256(${c.length}:${c.slice(0, 8)})`;

describe("handleEditingChatRequest — propose then apply", () => {
  it("Phase A returns approval-required without writing", async () => {
    const { editor, writes } = makeEditor({
      "/repo/src/a.ts": "export const greeting = 'hello world';\n",
    });
    const r = await handleEditingChatRequest({
      message: "tiny edit to greet differently",
      editProposal: {
        path: "src/a.ts",
        originalSnippet: "'hello world'",
        proposedSnippet: "'hi peh'",
      },
      inspectedPaths: ["src/a.ts"],
      projectRoot: ROOT,
      editor,
      hashContent: fakeHash,
    });
    expect(r.status).toBe("approval-required");
    expect(r.applied).toBe(false);
    expect(r.approvalRequest?.action).toBe("tiny_edit");
    expect(r.diffPreview?.bytesRemoved).toBeGreaterThan(0);
    expect(r.reply).toMatch(/Diff preview/);
    expect(writes.length).toBe(0);
  });

  it("Phase B applies + verifies when approval matches", async () => {
    const content = "export const greeting = 'hello world';\n";
    const { editor, contents } = makeEditor({ "/repo/src/a.ts": content });
    const approval = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: await fakeHash("'hello world'"),
      proposedHash: await fakeHash("'hi peh'"),
      fileHash: await fakeHash(content),
    });
    const r = await handleEditingChatRequest({
      message: "apply",
      editProposal: {
        path: "src/a.ts",
        originalSnippet: "'hello world'",
        proposedSnippet: "'hi peh'",
      },
      approval,
      inspectedPaths: ["src/a.ts"],
      projectRoot: ROOT,
      editor,
      hashContent: fakeHash,
    });
    expect(r.status).toBe("applied-verified");
    expect(r.applied).toBe(true);
    expect(r.rolledBack).toBe(false);
    expect(contents["/repo/src/a.ts"]).toMatch(/hi peh/);
  });

  it("Phase B denies wrong approval and does not write", async () => {
    const content = "hello there world";
    const { editor, writes } = makeEditor({ "/repo/src/a.ts": content });
    const approval = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: "WRONG",
      proposedHash: await fakeHash("howdy"),
      fileHash: await fakeHash(content),
    });
    const r = await handleEditingChatRequest({
      message: "apply",
      editProposal: {
        path: "src/a.ts",
        originalSnippet: "hello",
        proposedSnippet: "howdy",
      },
      approval,
      inspectedPaths: ["src/a.ts"],
      projectRoot: ROOT,
      editor,
      hashContent: fakeHash,
    });
    expect(r.status).toBe("denied");
    expect(writes.length).toBe(0);
  });

  it("Phase B rolls back when verification fails", async () => {
    const content = "export const x = 'ok';";
    const { editor, contents } = makeEditor({ "/repo/src/a.ts": content });
    const approval = buildEditApprovalToken({
      path: "src/a.ts",
      originalHash: await fakeHash("'ok'"),
      proposedHash: await fakeHash("'broken"),
      fileHash: await fakeHash(content),
    });
    const r = await handleEditingChatRequest({
      message: "apply",
      editProposal: {
        path: "src/a.ts",
        originalSnippet: "'ok'",
        proposedSnippet: "'broken",
      },
      approval,
      inspectedPaths: ["src/a.ts"],
      projectRoot: ROOT,
      editor,
      hashContent: fakeHash,
    });
    expect(r.status).toBe("applied-rolled-back");
    expect(r.applied).toBe(true);
    expect(r.rolledBack).toBe(true);
    // Original content restored.
    expect(contents["/repo/src/a.ts"]).toBe(content);
  });
});

describe("handleEditingChatRequest — refuses without prior inspection", () => {
  it("blocks when inspectedPaths does not include the target", async () => {
    const { editor, writes } = makeEditor({ "/repo/src/a.ts": "abcd hello" });
    const r = await handleEditingChatRequest({
      message: "tiny",
      editProposal: {
        path: "src/a.ts",
        originalSnippet: "hello",
        proposedSnippet: "howdy",
      },
      inspectedPaths: [],
      projectRoot: ROOT,
      editor,
      hashContent: fakeHash,
    });
    expect(r.status).toBe("blocked");
    expect(writes.length).toBe(0);
  });
});
