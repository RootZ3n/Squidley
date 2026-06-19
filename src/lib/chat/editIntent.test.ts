import { describe, it, expect } from "vitest";
import { detectEditIntent } from "./editIntent";

describe("detectEditIntent — matches", () => {
  it("matches 'make a tiny edit' verb", () => {
    const r = detectEditIntent(
      "make a tiny edit to src/a.ts: replace `'hello'` with `'hi'`",
    );
    expect(r?.intent).toBe("edit");
    expect(r?.parsed?.path).toBe("src/a.ts");
    expect(r?.parsed?.originalSnippet).toBe("'hello'");
    expect(r?.parsed?.proposedSnippet).toBe("'hi'");
  });

  it("matches 'propose a tiny edit'", () => {
    const r = detectEditIntent(
      "propose a tiny edit in src/utils.ts: replace `oldText` with `newText`",
    );
    expect(r?.parsed?.path).toBe("src/utils.ts");
  });

  it("returns parsed=null when verb matches but no structured args", () => {
    const r = detectEditIntent("make a tiny edit please");
    expect(r?.intent).toBe("edit");
    expect(r?.parsed).toBeNull();
  });
});

describe("detectEditIntent — refuses unsafe / casual", () => {
  it("returns null on casual chat", () => {
    expect(detectEditIntent("hello there")).toBeNull();
    expect(detectEditIntent("tell me a joke")).toBeNull();
  });

  it("does not return parsed paths containing '..'", () => {
    const r = detectEditIntent(
      "make a tiny edit to ../etc/passwd.ts: replace `x` with `y`",
    );
    expect(r?.parsed).toBeNull();
  });

  it("ignores over-long messages", () => {
    expect(detectEditIntent("make a tiny edit " + "x".repeat(5000))).toBeNull();
  });
});
