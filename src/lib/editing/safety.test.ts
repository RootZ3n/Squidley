import { describe, it, expect } from "vitest";
import {
  MAX_DIFF_BYTES,
  MAX_SNIPPET_BYTES,
  MIN_SNIPPET_BYTES,
  checkEditSafety,
} from "./safety";

const ROOT = "/repo";

function defaults(over: Partial<Parameters<typeof checkEditSafety>[0]> = {}) {
  return {
    projectRoot: ROOT,
    path: "src/a.ts",
    currentFileContent: "export const greeting = 'hello world';\n",
    originalSnippet: "'hello world'",
    proposedSnippet: "'hi peh'",
    inspectedPaths: ["src/a.ts"],
    ...over,
  };
}

describe("checkEditSafety — happy path", () => {
  it("accepts a safe, anchored, single-occurrence tiny edit", () => {
    const r = checkEditSafety(defaults());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pathSafety.relativePath).toBe("src/a.ts");
      expect(r.anchorIndex).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("checkEditSafety — path rules (reused from inspection)", () => {
  it("rejects traversal", () => {
    const r = checkEditSafety(defaults({ path: "../etc/passwd" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("path-unsafe");
  });

  it("rejects .env even with prior inspection (path rules win)", () => {
    const r = checkEditSafety(defaults({ path: ".env", inspectedPaths: [".env"] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("path-unsafe");
  });

  it("rejects disallowed extensions", () => {
    const r = checkEditSafety(defaults({ path: "data/binary.bin" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("path-unsafe");
  });
});

describe("checkEditSafety — must be inspected first", () => {
  it("rejects when path not in inspectedPaths", () => {
    const r = checkEditSafety(defaults({ inspectedPaths: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-prior-inspection");
  });
});

describe("checkEditSafety — snippet rules", () => {
  it("rejects snippets shorter than the minimum", () => {
    const r = checkEditSafety(
      defaults({
        currentFileContent: "abc",
        originalSnippet: "ab",
        proposedSnippet: "cd",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("snippet-too-short");
  });

  it("rejects snippets above MAX_SNIPPET_BYTES", () => {
    const big = "x".repeat(MAX_SNIPPET_BYTES + 1);
    const r = checkEditSafety(
      defaults({
        currentFileContent: big,
        originalSnippet: big,
        proposedSnippet: "yy",
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects no-op edits", () => {
    const r = checkEditSafety(
      defaults({
        currentFileContent: "abcdef",
        originalSnippet: "abcd",
        proposedSnippet: "abcd",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("noop-edit");
  });

  it("rejects snippets with NUL bytes", () => {
    const r = checkEditSafety(
      defaults({
        currentFileContent: "hello world content",
        originalSnippet: "hello",
        proposedSnippet: "hi\x00there",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("snippet-binary");
  });

  it("rejects binary-looking file content", () => {
    const r = checkEditSafety(
      defaults({
        currentFileContent: "hello\x00world",
        originalSnippet: "hello",
        proposedSnippet: "howdy",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("file-binary");
  });

  it("rejects when MIN_SNIPPET_BYTES would be violated even though anchor is shorter than 4", () => {
    expect(MIN_SNIPPET_BYTES).toBeGreaterThanOrEqual(4);
  });
});

describe("checkEditSafety — anchor must be unique and present", () => {
  it("rejects zero matches (stale proposal)", () => {
    const r = checkEditSafety(
      defaults({
        currentFileContent: "export const greeting = 'changed already';\n",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-match-in-current-file");
  });

  it("rejects multiple matches (ambiguous anchor)", () => {
    const r = checkEditSafety(
      defaults({
        currentFileContent:
          "const a = 'hello world'\nconst b = 'hello world'\n",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("multiple-matches-in-current-file");
  });
});

describe("checkEditSafety — diff size cap", () => {
  it("rejects proposed snippets that would explode the file", () => {
    const huge = "y".repeat(MAX_DIFF_BYTES + 100);
    const r = checkEditSafety(
      defaults({
        currentFileContent: "hello world",
        originalSnippet: "hello",
        proposedSnippet: huge,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("snippet-too-large");
  });

  it("rejects edits that would leave the file empty", () => {
    const r = checkEditSafety(
      defaults({
        currentFileContent: "abcd",
        originalSnippet: "abcd",
        proposedSnippet: "",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty-proposed-with-empty-file");
  });
});
