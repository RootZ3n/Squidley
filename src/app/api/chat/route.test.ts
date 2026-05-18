import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

/** Find the POST call to the model (not GET detection probes). */
function findModelCall(spy: { mock: { calls: unknown[][] } }): [string, RequestInit] | undefined {
  for (const call of spy.mock.calls) {
    const init = call[1] as RequestInit | undefined;
    if (init?.method === "POST") return [call[0] as string, init];
  }
  return undefined;
}

describe("/api/chat — reliability layer wiring", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("casual chat falls through to the local model handler", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({ message: { content: "hello back" } }),
        { status: 200 },
      ),
    );

    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "hello there" }),
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.reply).toBe("hello back");
    // Casual chat reaches the local model — there should be a POST.
    expect(findModelCall(fetchImpl)).toBeDefined();
    // Casual chat must NOT carry a reliability summary.
    expect(json.reliability).toBeUndefined();
    expect(json.cloudUsed).toBe(false);
  });

  it("reliability-intent message is handled without calling the model", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ message: { content: "" } }), { status: 200 }),
    );

    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "summarize this error: ECONNREFUSED 127.0.0.1:11434",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.reliability).toBeDefined();
    expect(json.reliability.intent).toBe("summarize_error");
    expect(json.reliability.cloudUsed).toBe(false);
    expect(json.reliability.localOnly).toBe(true);
    expect(json.model).toBe("reliability_layer");
    // No POST to the local model should have happened — reliability path
    // is deterministic and does not call upstream for summarize_error.
    expect(findModelCall(fetchImpl)).toBeUndefined();
  });

  it("teacher intercept still wins over reliability intercept", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch");

    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "What is local mode?" }),
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.reliability).toBeUndefined();
    expect(json.teacherSource).toBe("teacher_layer");
    expect(findModelCall(fetchImpl)).toBeUndefined();
  });

  it("reliability path never sets cloudUsed=true", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ message: { content: "" } }), { status: 200 }),
    );

    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "is ollama running" }),
      }),
    );

    const json = await response.json();
    expect(json.cloudUsed).toBe(false);
    expect(json.reliability.cloudUsed).toBe(false);
  });
});
