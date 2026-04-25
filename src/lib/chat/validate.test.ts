import { describe, it, expect } from "vitest";
import { LIMITS, validateChatRequest } from "./validate";

describe("validateChatRequest", () => {
  it("accepts a minimal valid body", () => {
    const r = validateChatRequest({ message: "hello" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.message).toBe("hello");
  });

  it("trims the message", () => {
    const r = validateChatRequest({ message: "   hi   " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.message).toBe("hi");
  });

  it("rejects non-object bodies", () => {
    expect(validateChatRequest(null).ok).toBe(false);
    expect(validateChatRequest("hi").ok).toBe(false);
    expect(validateChatRequest(["hi"]).ok).toBe(false);
  });

  it("rejects missing or non-string message", () => {
    expect(validateChatRequest({}).ok).toBe(false);
    expect(validateChatRequest({ message: 42 }).ok).toBe(false);
    expect(validateChatRequest({ message: "" }).ok).toBe(false);
    expect(validateChatRequest({ message: "   " }).ok).toBe(false);
  });

  it("rejects messages over the size limit", () => {
    const tooLong = "x".repeat(LIMITS.maxMessageChars + 1);
    expect(validateChatRequest({ message: tooLong }).ok).toBe(false);
  });

  it("accepts a valid optional model", () => {
    const r = validateChatRequest({ message: "hi", model: "llama3.2" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.model).toBe("llama3.2");
  });

  it("rejects a non-string model", () => {
    const r = validateChatRequest({ message: "hi", model: 1 });
    expect(r.ok).toBe(false);
  });

  it("treats an empty/whitespace model as unset", () => {
    const r = validateChatRequest({ message: "hi", model: "   " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.model).toBeUndefined();
  });

  it("accepts a valid history", () => {
    const r = validateChatRequest({
      message: "next",
      history: [
        { role: "user", content: "first" },
        { role: "assistant", content: "second" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.history?.length).toBe(2);
  });

  it("rejects unsupported roles in history", () => {
    const r = validateChatRequest({
      message: "next",
      history: [{ role: "tool", content: "x" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects non-array history", () => {
    expect(
      validateChatRequest({ message: "x", history: "not array" }).ok,
    ).toBe(false);
  });

  it("rejects history items missing content", () => {
    const r = validateChatRequest({
      message: "x",
      history: [{ role: "user" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects history beyond the configured length", () => {
    const long = Array.from({ length: LIMITS.maxHistoryMessages + 1 }, () => ({
      role: "user" as const,
      content: "a",
    }));
    const r = validateChatRequest({ message: "x", history: long });
    expect(r.ok).toBe(false);
  });
});
