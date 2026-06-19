import { describe, it, expect } from "vitest";
import { validateLocalAnswer } from "./answerValidator";

describe("validateLocalAnswer — empty / placeholder", () => {
  it("rejects empty / whitespace", () => {
    expect(validateLocalAnswer("").ok).toBe(false);
    expect(validateLocalAnswer("   \n  ").ok).toBe(false);
    expect(validateLocalAnswer("").reason).toBe("empty");
  });

  it("rejects placeholder text", () => {
    expect(validateLocalAnswer("(no content)").ok).toBe(false);
    expect(validateLocalAnswer("...").ok).toBe(false);
    expect(validateLocalAnswer("(no content)").reason).toBe("empty");
  });

  it("rejects null / wrong type", () => {
    expect(validateLocalAnswer(null).ok).toBe(false);
    expect(validateLocalAnswer(undefined).ok).toBe(false);
  });
});

describe("validateLocalAnswer — refusal", () => {
  it("flags short canned refusal", () => {
    const r = validateLocalAnswer("I cannot help with that.");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("refusal");
  });

  it("flags 'as an AI language model' opener", () => {
    expect(
      validateLocalAnswer("As an AI language model, I cannot help with that.").reason,
    ).toBe("refusal");
  });

  it("accepts a long answer that opens with a hedge but proceeds to answer", () => {
    const reply =
      "I can't promise this fixes everything, but here is what's happening: " +
      "the timeout occurs because the connection pool is exhausted before the " +
      "retry kicks in. ".repeat(5);
    expect(validateLocalAnswer(reply).ok).toBe(true);
  });
});

describe("validateLocalAnswer — tool noise", () => {
  it("flags reply that only narrates a tool call", () => {
    const r = validateLocalAnswer("I'll use the search tool to find the answer.");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("tool-noise");
  });

  it("flags raw tool-call JSON / XML", () => {
    expect(validateLocalAnswer('<tool_call name="grep">').reason).toBe("tool-noise");
    expect(validateLocalAnswer('{ "tool": "shell", "args": {} }').reason).toBe("tool-noise");
  });

  it("accepts a long reply that mentions a tool but also answers", () => {
    const reply =
      "I'll use the search function metaphorically here. The function works by " +
      "walking the tree and ".repeat(15);
    expect(validateLocalAnswer(reply).ok).toBe(true);
  });
});

describe("validateLocalAnswer — fake success", () => {
  it("flags 'I've fixed the file' style claims", () => {
    expect(validateLocalAnswer("I've fixed the bug for you.").reason).toBe("fake-success");
    expect(validateLocalAnswer("Done! I have edited the file.").reason).toBe("fake-success");
    expect(validateLocalAnswer("The test has been fixed.").reason).toBe("fake-success");
  });

  it("does NOT flag honest descriptive prose about a fix", () => {
    expect(
      validateLocalAnswer(
        "To fix this, change line 42 from `x` to `y`. Then re-run the test.",
      ).ok,
    ).toBe(true);
  });
});

describe("validateLocalAnswer — happy path", () => {
  it("accepts a real explanatory answer", () => {
    const reply =
      "This function reads a file line by line. It opens the path, splits on " +
      "newlines, and returns the array of lines.";
    expect(validateLocalAnswer(reply).ok).toBe(true);
  });
});
