import { describe, expect, it } from "vitest";
import { getLocalStatusNoteCopy } from "./localStatusNote";

describe("local status note copy", () => {
  it("returns beginner-facing local-only copy", () => {
    expect(getLocalStatusNoteCopy("localOnly").text).toContain("No cloud fallback");
  });

  it("keeps cloud providers clearly locked", () => {
    expect(getLocalStatusNoteCopy("cloudLocked").text.toLowerCase()).toContain("locked");
  });

  it("explains no-model modules", () => {
    expect(getLocalStatusNoteCopy("noModelNeeded").text).toContain("does not need a model");
  });
});
