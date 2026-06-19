import { describe, it, expect } from "vitest";
import { detectInspectionIntent } from "./inspectionIntent";

describe("detectInspectionIntent — matches with path", () => {
  it("'what does X do' extracts the path", () => {
    expect(detectInspectionIntent("what does src/app/page.tsx do?")).toMatchObject({
      intent: "inspect",
      path: "src/app/page.tsx",
    });
  });

  it("'inspect <path>' extracts the path", () => {
    expect(detectInspectionIntent("Inspect package.json")?.path).toBe("package.json");
  });

  it("'summarize this markdown file' matches without a path", () => {
    const m = detectInspectionIntent("summarize this markdown file");
    expect(m?.intent).toBe("inspect");
    expect(m?.path).toBeNull();
  });

  it("'look at src/lib/chat/handler.ts' extracts deep path", () => {
    expect(detectInspectionIntent("look at src/lib/chat/handler.ts")?.path).toBe(
      "src/lib/chat/handler.ts",
    );
  });

  it("'summarize docs/readme.md' extracts path", () => {
    expect(detectInspectionIntent("summarize docs/readme.md")?.path).toBe(
      "docs/readme.md",
    );
  });
});

describe("detectInspectionIntent — does NOT match", () => {
  it("casual chat", () => {
    expect(detectInspectionIntent("tell me a joke")).toBeNull();
    expect(detectInspectionIntent("hello there")).toBeNull();
  });

  it("explain-this-code without a file reference is not inspection", () => {
    // This is a wrap-intent territory, not inspection.
    expect(detectInspectionIntent("explain this code please")).toBeNull();
  });

  it("very long messages do not match", () => {
    const long = "inspect this file " + "x".repeat(1000);
    expect(detectInspectionIntent(long)).toBeNull();
  });
});

describe("detectInspectionIntent — path safety pre-filter", () => {
  it("never returns a traversal path", () => {
    const r = detectInspectionIntent("inspect ../etc/passwd");
    expect(r?.intent).toBe("inspect");
    expect(r?.path).toBeNull();
  });

  it("never returns paths without an allowed extension", () => {
    const r = detectInspectionIntent("look at some-binary");
    // 'some-binary' won't match PATH_EXTRACT_RE (no allowed extension).
    expect(r === null || r.path === null).toBe(true);
  });
});
