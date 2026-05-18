import { describe, it, expect } from "vitest";
import { buildDiffPreview } from "./diff";

describe("buildDiffPreview", () => {
  it("includes - lines for the removed snippet and + lines for the proposed snippet", () => {
    const file = "line A\nold text here\nline C\n";
    const original = "old text here";
    const proposed = "new text here";
    const anchorIndex = file.indexOf(original);
    const d = buildDiffPreview({
      path: "src/a.ts",
      fileContent: file,
      originalSnippet: original,
      proposedSnippet: proposed,
      anchorIndex,
    });
    expect(d.lines.some((l) => l === "- old text here")).toBe(true);
    expect(d.lines.some((l) => l === "+ new text here")).toBe(true);
  });

  it("captures up to 2 lines of context on each side", () => {
    const file = ["a", "b", "anchor", "c", "d"].join("\n");
    const d = buildDiffPreview({
      path: "x.ts",
      fileContent: file,
      originalSnippet: "anchor",
      proposedSnippet: "ANCHOR",
      anchorIndex: file.indexOf("anchor"),
    });
    expect(d.lines.filter((l) => l.startsWith("  ")).length).toBeGreaterThanOrEqual(2);
    expect(d.headExcerpt).toMatch(/a/);
    expect(d.tailExcerpt).toMatch(/d/);
  });

  it("clamps overly large diffs with a 'hidden' marker", () => {
    const giant = "z".repeat(5000) + "\n".repeat(100);
    const d = buildDiffPreview({
      path: "x.ts",
      fileContent: `before\n${giant}\nafter`,
      originalSnippet: giant,
      proposedSnippet: "tiny",
      anchorIndex: `before\n`.length,
    });
    expect(d.lines.some((l) => l.includes("clipped") || l.includes("hidden"))).toBe(true);
  });

  it("records byte deltas accurately", () => {
    const d = buildDiffPreview({
      path: "x.ts",
      fileContent: "abXXXcd",
      originalSnippet: "XXX",
      proposedSnippet: "Y",
      anchorIndex: 2,
    });
    expect(d.bytesRemoved).toBe(3);
    expect(d.bytesAdded).toBe(1);
  });
});
