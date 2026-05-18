import { describe, it, expect } from "vitest";
import type { LocalProviderConfig } from "@/lib/providers/local";
import {
  MAX_LOCAL_RETRIES,
  buildStreamFallback,
  wrapLocalAnswer,
} from "./answerReliability";
import type { HandlerResult } from "./handler";
import type { ChatResponseBody } from "./types";

const config: LocalProviderConfig = {
  providerId: "local",
  endpoint: "http://test-local:11434",
  model: "llama3.2",
  backendType: "ollama",
  cloudUsed: false,
  toolsUsed: false,
};

function successPayload(reply: string): ChatResponseBody {
  return {
    ok: true,
    provider: "local",
    cloudUsed: false,
    toolsUsed: false,
    model: "llama3.2",
    reply,
    startedAt: 0,
    completedAt: 1,
    durationMs: 1,
    responseMode: "local_model",
  };
}

function fakeHandler(replies: readonly string[]) {
  let i = 0;
  const calls: { body: unknown }[] = [];
  const handler = async (input: { body: unknown }): Promise<HandlerResult> => {
    calls.push({ body: input.body });
    const reply = replies[Math.min(i, replies.length - 1)];
    i++;
    return { status: 200, payload: successPayload(reply) };
  };
  return { handler, calls };
}

describe("wrapLocalAnswer — first-try success", () => {
  it("returns the handler payload UNCHANGED and emits no summary", async () => {
    const { handler, calls } = fakeHandler([
      "This function reads a file line by line and returns the lines.",
    ]);
    const out = await wrapLocalAnswer({
      body: { message: "explain this code" },
      config,
      callHandler: handler,
    });
    expect(out.summary).toBeNull();
    expect(out.status).toBe(200);
    expect(out.payload.ok).toBe(true);
    if (out.payload.ok) {
      expect(out.payload.reliability).toBeUndefined();
      expect(out.payload.reply).toMatch(/file line by line/);
    }
    expect(calls.length).toBe(1);
  });
});

describe("wrapLocalAnswer — retry success", () => {
  it("retries once when first reply is empty and succeeds on retry", async () => {
    const { handler, calls } = fakeHandler([
      "",
      "Here is the explanation: the function walks the array.",
    ]);
    const out = await wrapLocalAnswer({
      body: { message: "explain this code" },
      config,
      callHandler: handler,
    });
    expect(out.summary?.kind).toBe("retried-ok");
    expect(out.summary?.retries).toBe(1);
    expect(out.summary?.ok).toBe(true);
    expect(calls.length).toBe(2);
    if (out.payload.ok) {
      expect(out.payload.reply).toMatch(/walks the array/);
      expect(out.payload.reliability?.kind).toBe("retried-ok");
      expect(out.payload.reliability?.receiptActions).toContain(
        "reliability.local-answer-retry-started",
      );
      expect(out.payload.reliability?.receiptActions).toContain(
        "reliability.local-answer-validated",
      );
    }
  });

  it("retry prompt includes a failure-reason-aware nudge", async () => {
    const { handler, calls } = fakeHandler(["", "real answer here that is long enough"]);
    await wrapLocalAnswer({
      body: { message: "explain this code please" },
      config,
      callHandler: handler,
    });
    const retryBody = calls[1].body as { message: string; history?: unknown[] };
    expect(retryBody.message.toLowerCase()).toMatch(/previous reply was empty/);
    // The retry preserves the original user turn in history
    expect(Array.isArray(retryBody.history)).toBe(true);
  });

  it("uses different nudges for different failure reasons", async () => {
    // Fake-success
    {
      const { handler, calls } = fakeHandler([
        "I have fixed the file for you.",
        "Real explanation goes here, line by line and clearly written.",
      ]);
      await wrapLocalAnswer({
        body: { message: "explain this code" },
        config,
        callHandler: handler,
      });
      const retryBody = calls[1].body as { message: string };
      expect(retryBody.message.toLowerCase()).toMatch(/cannot actually perform|no tool execution|write tools/);
    }
    // Refusal
    {
      const { handler, calls } = fakeHandler([
        "I cannot help with that.",
        "Real explanation goes here, in plain words and concrete steps.",
      ]);
      await wrapLocalAnswer({
        body: { message: "explain this code" },
        config,
        callHandler: handler,
      });
      const retryBody = calls[1].body as { message: string };
      expect(retryBody.message.toLowerCase()).toMatch(/refusal|answer directly/);
    }
  });
});

describe("wrapLocalAnswer — fallback when retry also fails", () => {
  it("returns honest fallback with decomposition when both attempts are empty", async () => {
    const { handler, calls } = fakeHandler(["", ""]);
    const out = await wrapLocalAnswer({
      body: { message: "explain this code" },
      config,
      callHandler: handler,
    });
    expect(out.summary?.kind).toBe("fallback");
    expect(out.summary?.ok).toBe(false);
    expect(out.summary?.decomposition?.length).toBeGreaterThan(0);
    expect(calls.length).toBe(1 + MAX_LOCAL_RETRIES);
    if (out.payload.ok) {
      expect(out.payload.reply).toMatch(/honest|smaller next steps/i);
      expect(out.payload.reliability?.kind).toBe("fallback");
      expect(out.payload.reliability?.receiptActions).toContain(
        "reliability.local-answer-fallback-returned",
      );
    }
  });

  it("flags fake-success and falls back rather than echoing the claim", async () => {
    const { handler } = fakeHandler([
      "I have fixed the build for you.",
      "The test has been fixed.",
    ]);
    const out = await wrapLocalAnswer({
      body: { message: "why is my test failing" },
      config,
      callHandler: handler,
    });
    expect(out.summary?.kind).toBe("fallback");
    expect(out.summary?.failureReason).toBe("fake-success");
    if (out.payload.ok) {
      // Fallback reply does NOT carry the fake success text
      expect(out.payload.reply).not.toMatch(/I have fixed/);
      expect(out.payload.reply).toMatch(/cannot actually perform/);
    }
  });

  it("records same-signature on repeated identical failures", async () => {
    const { handler } = fakeHandler(["", ""]);
    const out = await wrapLocalAnswer({
      body: { message: "explain this code" },
      config,
      callHandler: handler,
    });
    const retryFailed = out.summary!.receipts.find(
      (r) => r.action === "reliability.local-answer-retry-failed",
    );
    expect(retryFailed?.metadata?.same_signature).toBe(true);
  });

  it("never sets cloudUsed=true on any receipt or summary", async () => {
    const { handler } = fakeHandler(["", ""]);
    const out = await wrapLocalAnswer({
      body: { message: "explain this code" },
      config,
      callHandler: handler,
    });
    for (const receipt of out.summary!.receipts) {
      expect(receipt.cloudUsed).toBe(false);
      expect(receipt.metadata?.cloud_used).toBe(false);
    }
    if (out.payload.ok) {
      expect(out.payload.cloudUsed).toBe(false);
      expect(out.payload.reliability?.cloudUsed).toBe(false);
    }
  });
});

describe("wrapLocalAnswer — upstream errors pass through unchanged", () => {
  it("returns a handler error payload as-is without retrying", async () => {
    let calls = 0;
    const handler = async (): Promise<HandlerResult> => {
      calls++;
      return {
        status: 503,
        payload: {
          ok: false,
          provider: "local",
          cloudUsed: false,
          toolsUsed: false,
          error: {
            code: "local_provider_unreachable",
            message: "Squidley couldn't reach the local server.",
          },
        },
      };
    };
    const out = await wrapLocalAnswer({
      body: { message: "explain this code" },
      config,
      callHandler: handler,
    });
    expect(out.status).toBe(503);
    expect(out.payload.ok).toBe(false);
    expect(out.summary).toBeNull();
    expect(calls).toBe(1); // never retries transport errors
  });
});

describe("wrapLocalAnswer — bounded steps", () => {
  it("does not call the handler more than 1 + MAX_LOCAL_RETRIES times", async () => {
    const { handler, calls } = fakeHandler(["", "", ""]);
    await wrapLocalAnswer({
      body: { message: "explain this code" },
      config,
      callHandler: handler,
    });
    expect(calls.length).toBeLessThanOrEqual(1 + MAX_LOCAL_RETRIES);
  });
});

describe("buildStreamFallback", () => {
  it("emits a wrap-intent reliability payload with decomposition", () => {
    const out = buildStreamFallback({ reason: "empty" });
    expect(out.reliabilityPayload.type).toBe("reliability");
    expect(out.reliabilityPayload.intent).toBe("wrap");
    expect(out.reliabilityPayload.kind).toBe("fallback");
    expect(out.reliabilityPayload.cloudUsed).toBe(false);
    expect(out.reliabilityPayload.localOnly).toBe(true);
    expect(out.reliabilityPayload.ok).toBe(false);
    expect(out.reliabilityPayload.decomposition.length).toBeGreaterThan(0);
    expect(out.reliabilityPayload.receiptActions).toContain(
      "reliability.local-answer-fallback-returned",
    );
  });

  it("every stream-fallback receipt asserts cloudUsed=false", () => {
    const out = buildStreamFallback({ reason: "empty" });
    for (const receipt of out.receipts) {
      expect(receipt.cloudUsed).toBe(false);
      expect(receipt.metadata?.cloud_used).toBe(false);
    }
  });
});
