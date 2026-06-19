import { describe, expect, it } from "vitest";
import {
  detectHallucinatedToolActions,
  type HallucinatedAction,
} from "./honestyAnnotation";

function hasAction(actions: readonly HallucinatedAction[], target: HallucinatedAction) {
  return actions.includes(target);
}

describe("honesty annotation — hallucinated tool actions", () => {
  it("returns empty for an honest model-only reply", () => {
    const result = detectHallucinatedToolActions(
      "Sure, here is a draft of the file content you can copy into your editor.",
    );
    expect(result.hallucinatedActions).toEqual([]);
    expect(result.unavailableTools).toEqual([]);
    expect(result.userVisibleHonestyMessage).toBeUndefined();
  });

  it("returns empty for empty input", () => {
    expect(detectHallucinatedToolActions("").hallucinatedActions).toEqual([]);
    // @ts-expect-error invalid input — defensive check
    expect(detectHallucinatedToolActions(null).hallucinatedActions).toEqual([]);
  });

  it("flags 'I wrote the file' as fs.write hallucination", () => {
    const result = detectHallucinatedToolActions(
      "I wrote the file `notes.md` for you.",
    );
    expect(hasAction(result.hallucinatedActions, "fs.write")).toBe(true);
    expect(result.unavailableTools).toContain("fs.write");
    expect(result.userVisibleHonestyMessage).toMatch(/no file-write tool|did not save/i);
  });

  it("flags 'I've saved the file' as fs.write hallucination", () => {
    const result = detectHallucinatedToolActions("I've saved the file to disk.");
    expect(hasAction(result.hallucinatedActions, "fs.write")).toBe(true);
  });

  it("does NOT flag hedged 'I can write the file'", () => {
    const result = detectHallucinatedToolActions(
      "I can write the file contents for you to copy.",
    );
    expect(result.hallucinatedActions).toEqual([]);
  });

  it("does NOT flag an explicit disclaimer near the verb", () => {
    const result = detectHallucinatedToolActions(
      "I can't write the file directly, but here is the content.",
    );
    expect(result.hallucinatedActions).toEqual([]);
  });

  it("does NOT flag the model explaining what it cannot do", () => {
    const result = detectHallucinatedToolActions(
      "Peh does not have a file-write tool, so I will not save the file to disk.",
    );
    expect(result.hallucinatedActions).toEqual([]);
  });

  it("flags 'I ran the tests' as shell hallucination", () => {
    const result = detectHallucinatedToolActions("I ran the tests and they all passed.");
    expect(hasAction(result.hallucinatedActions, "shell")).toBe(true);
    expect(result.userVisibleHonestyMessage).toMatch(/run shell commands|Nothing was run/i);
  });

  it("flags 'I executed the code' as code_execute hallucination", () => {
    const result = detectHallucinatedToolActions("I executed the code on your behalf.");
    expect(hasAction(result.hallucinatedActions, "code_execute")).toBe(true);
  });

  it("flags 'I searched the web' as web_search hallucination", () => {
    const result = detectHallucinatedToolActions(
      "I searched the web and found this article.",
    );
    expect(hasAction(result.hallucinatedActions, "web_search")).toBe(true);
    expect(result.userVisibleHonestyMessage).toMatch(/web\/search/i);
  });

  it("flags 'I looked it up online'", () => {
    const result = detectHallucinatedToolActions("I looked it up online.");
    expect(hasAction(result.hallucinatedActions, "web_search")).toBe(true);
  });

  it("flags 'I browsed to the URL'", () => {
    const result = detectHallucinatedToolActions(
      "I browsed to the URL and read the page.",
    );
    expect(hasAction(result.hallucinatedActions, "browse")).toBe(true);
  });

  it("flags 'I installed the package'", () => {
    const result = detectHallucinatedToolActions("I installed the npm package for you.");
    expect(hasAction(result.hallucinatedActions, "package_install")).toBe(true);
  });

  it("flags 'I committed the changes'", () => {
    const result = detectHallucinatedToolActions(
      "I committed the changes to your branch.",
    );
    expect(hasAction(result.hallucinatedActions, "git_commit")).toBe(true);
  });

  it("flags 'I've remembered that for later'", () => {
    const result = detectHallucinatedToolActions(
      "I've remembered that for later — next time we chat I'll bring it up.",
    );
    expect(hasAction(result.hallucinatedActions, "memory_write")).toBe(true);
  });

  it("flags 'I deleted the file'", () => {
    const result = detectHallucinatedToolActions("I deleted the file you mentioned.");
    expect(hasAction(result.hallucinatedActions, "fs.delete")).toBe(true);
  });

  it("flags 'I read your project files'", () => {
    const result = detectHallucinatedToolActions(
      "I read your project files and found the bug.",
    );
    expect(hasAction(result.hallucinatedActions, "fs.read")).toBe(true);
  });

  it("flags multiple distinct hallucinations in one reply", () => {
    const result = detectHallucinatedToolActions(
      "I read your project, I ran the tests, and I committed the fix.",
    );
    expect(hasAction(result.hallucinatedActions, "fs.read")).toBe(true);
    expect(hasAction(result.hallucinatedActions, "shell")).toBe(true);
    expect(hasAction(result.hallucinatedActions, "git_commit")).toBe(true);
  });

  it("honors executedTools — does not flag actions that actually ran", () => {
    const result = detectHallucinatedToolActions(
      "I wrote the file `notes.md` for you.",
      { executedTools: ["fs.write"] },
    );
    expect(result.hallucinatedActions).toEqual([]);
  });

  it("honesty message is a non-empty string when something was flagged", () => {
    const result = detectHallucinatedToolActions("I saved the file.");
    expect(typeof result.userVisibleHonestyMessage).toBe("string");
    expect((result.userVisibleHonestyMessage ?? "").length).toBeGreaterThan(20);
  });

  it("never returns the original reply text in the honesty message (no echo)", () => {
    const reply = "I saved the file SECRET-VALUE-XYZ to disk.";
    const result = detectHallucinatedToolActions(reply);
    expect(result.userVisibleHonestyMessage ?? "").not.toContain("SECRET-VALUE-XYZ");
  });
});
