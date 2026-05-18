import { describe, it, expect } from "vitest";
import { buildVerification } from "./verifier";

describe("buildVerification — generic checks", () => {
  it("passes when replacement is present and original is gone", () => {
    const before = "alpha BAR gamma";
    const after = "alpha BAZ gamma";
    const v = buildVerification({
      path: "src/a.ts",
      originalBefore: "BAR",
      proposedSnippet: "BAZ",
      contentBefore: before,
      contentAfter: after,
      extension: ".ts",
    });
    expect(v.verificationStatus).toBe("passed");
  });

  it("fails when the original snippet is still present", () => {
    const v = buildVerification({
      path: "src/a.ts",
      originalBefore: "BAR",
      proposedSnippet: "BAZ",
      contentBefore: "alpha BAR gamma",
      contentAfter: "alpha BAR gamma", // write was a no-op
      extension: ".ts",
    });
    expect(v.verificationStatus).toBe("failed");
  });

  it("fails when the file becomes empty", () => {
    const v = buildVerification({
      path: "src/a.ts",
      originalBefore: "xxxxxx",
      proposedSnippet: "",
      contentBefore: "xxxxxx",
      contentAfter: "",
      extension: ".ts",
    });
    expect(v.verificationStatus).toBe("failed");
  });

  it("fails when file length balloons by 100x", () => {
    const v = buildVerification({
      path: "src/a.ts",
      originalBefore: "tiny",
      proposedSnippet: "tiny",
      contentBefore: "abc tiny abc",
      contentAfter: "x".repeat(10000),
      extension: ".ts",
    });
    expect(v.verificationStatus).toBe("failed");
  });
});

describe("buildVerification — json-parses", () => {
  it("passes when JSON parses", () => {
    const v = buildVerification({
      path: "p.json",
      originalBefore: '"a": 1',
      proposedSnippet: '"a": 2',
      contentBefore: '{ "a": 1 }',
      contentAfter: '{ "a": 2 }',
      extension: ".json",
    });
    expect(v.verificationStatus).toBe("passed");
  });

  it("fails when JSON no longer parses", () => {
    const v = buildVerification({
      path: "p.json",
      originalBefore: '"a": 1',
      proposedSnippet: '"a": ?',
      contentBefore: '{ "a": 1 }',
      contentAfter: '{ "a": ? }',
      extension: ".json",
    });
    expect(v.verificationStatus).toBe("failed");
  });
});

describe("buildVerification — TS lightweight", () => {
  it("passes balanced + terminated TS", () => {
    const v = buildVerification({
      path: "a.ts",
      originalBefore: "1",
      proposedSnippet: "2",
      contentBefore: "export const x = 1;",
      contentAfter: "export const x = 2;",
      extension: ".ts",
    });
    expect(v.verificationStatus).toBe("passed");
  });

  it("fails unbalanced braces", () => {
    const v = buildVerification({
      path: "a.ts",
      originalBefore: "{ ok }",
      proposedSnippet: "{ broken",
      contentBefore: "export const x = { ok };",
      contentAfter: "export const x = { broken;",
      extension: ".ts",
    });
    expect(v.verificationStatus).toBe("failed");
  });

  it("fails unterminated string", () => {
    const v = buildVerification({
      path: "a.ts",
      originalBefore: "'ok'",
      proposedSnippet: "'broken",
      contentBefore: "export const x = 'ok';",
      contentAfter: "export const x = 'broken;",
      extension: ".ts",
    });
    expect(v.verificationStatus).toBe("failed");
  });
});
