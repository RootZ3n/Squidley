import { describe, it, expect } from "vitest";
import { detectChatAnswerIntent } from "./answerIntent";

describe("detectChatAnswerIntent", () => {
  it("matches code-explanation phrasing", () => {
    expect(detectChatAnswerIntent("Explain this code")?.intent).toBe("wrap");
    expect(detectChatAnswerIntent("what does this function do?")?.intent).toBe("wrap");
    expect(detectChatAnswerIntent("walk me through this snippet")?.intent).toBe("wrap");
    expect(detectChatAnswerIntent("how does this class work")?.intent).toBe("wrap");
  });

  it("matches debugging phrasing", () => {
    expect(detectChatAnswerIntent("help me debug this")?.intent).toBe("wrap");
    expect(detectChatAnswerIntent("why is my test failing?")?.intent).toBe("wrap");
    expect(detectChatAnswerIntent("why did this break")?.intent).toBe("wrap");
    expect(detectChatAnswerIntent("what does this error mean")?.intent).toBe("wrap");
  });

  it("matches local-model-quality troubleshooting", () => {
    expect(detectChatAnswerIntent("why is the model always empty")?.intent).toBe("wrap");
    expect(detectChatAnswerIntent("why do you keep saying I don't know")?.intent).toBe("wrap");
  });

  it("ignores casual chat", () => {
    expect(detectChatAnswerIntent("hi there!")).toBeNull();
    expect(detectChatAnswerIntent("tell me a joke")).toBeNull();
    expect(detectChatAnswerIntent("what's the capital of France?")).toBeNull();
    expect(detectChatAnswerIntent("write a poem about squids")).toBeNull();
  });

  it("ignores narrow troubleshooting that other intercepts handle", () => {
    // 'summarize this error' is reliabilityIntent territory and ALSO matches
    // 'why did this fail' — that's fine; reliabilityIntent runs first in the
    // route. answerIntent should still not match a pure 'is ollama running'.
    expect(detectChatAnswerIntent("is ollama running")).toBeNull();
  });

  it("ignores empty and over-long messages", () => {
    expect(detectChatAnswerIntent("")).toBeNull();
    expect(detectChatAnswerIntent("   ")).toBeNull();
    const huge = "explain this code " + "x".repeat(5000);
    expect(detectChatAnswerIntent(huge)).toBeNull();
  });
});
