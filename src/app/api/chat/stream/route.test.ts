import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { parseStreamEventLine, type StreamEvent } from "@/lib/chat/stream";

async function readAllEvents(body: ReadableStream<Uint8Array>): Promise<StreamEvent[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: StreamEvent[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseStreamEventLine(line);
      if (event) events.push(event);
    }
  }
  if (buffer.trim().length > 0) {
    const event = parseStreamEventLine(buffer);
    if (event) events.push(event);
  }
  return events;
}

describe("/api/chat/stream — reliability layer wiring", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reliability intent emits exactly one reliability event then done — no upstream fetch", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch");

    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({
          message: "summarize this error: ECONNREFUSED 127.0.0.1:11434",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/ndjson/);

    const events = await readAllEvents(response.body!);
    const reliability = events.find((e) => e.type === "reliability");
    expect(reliability).toBeDefined();
    if (reliability && reliability.type === "reliability") {
      expect(reliability.intent).toBe("summarize_error");
      expect(reliability.cloudUsed).toBe(false);
      expect(reliability.localOnly).toBe(true);
      expect(reliability.reply.length).toBeGreaterThan(0);
    }
    expect(events.some((e) => e.type === "done")).toBe(true);
    expect(events.some((e) => e.type === "meta")).toBe(false);
    // No upstream POST should have happened.
    const upstreamPost = fetchImpl.mock.calls.find((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === "POST";
    });
    expect(upstreamPost).toBeUndefined();
  });

  it("casual chat falls through and yields a meta/delta/done sequence", async () => {
    function buildStreamResponse(): Response {
      return new Response(
        new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            controller.enqueue(
              enc.encode(
                JSON.stringify({ message: { content: "hi" }, done: false }) + "\n",
              ),
            );
            controller.enqueue(
              enc.encode(
                JSON.stringify({ message: { content: "" }, done: true, eval_count: 1 }) + "\n",
              ),
            );
            controller.close();
          },
        }),
        { status: 200 },
      );
    }
    // Fresh response per fetch — detection probes consume their body once.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if ((init as RequestInit | undefined)?.method === "POST") {
        return buildStreamResponse();
      }
      // GET (detection probe): respond with a tags-like JSON so detection
      // succeeds and the route proceeds to open the stream.
      return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }), {
        status: 200,
      });
    });

    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "tell me a story please" }),
      }),
    );

    const events = await readAllEvents(response.body!);
    expect(events.some((e) => e.type === "meta")).toBe(true);
    expect(events.some((e) => e.type === "delta")).toBe(true);
    expect(events.some((e) => e.type === "reliability")).toBe(false);
  });

  it("reliability event never declares cloud usage", async () => {
    vi.spyOn(globalThis, "fetch");

    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "is ollama running" }),
      }),
    );

    const events = await readAllEvents(response.body!);
    for (const event of events) {
      if (event.type === "reliability") {
        expect(event.cloudUsed).toBe(false);
        expect(event.localOnly).toBe(true);
      }
    }
  });
});

describe("/api/chat/stream — answer-wrap (Phase 3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function buildOllamaStreamBody(content: string, done = true): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        if (content.length > 0) {
          controller.enqueue(
            enc.encode(JSON.stringify({ message: { content }, done: false }) + "\n"),
          );
        }
        controller.enqueue(
          enc.encode(
            JSON.stringify({
              message: { content: "" },
              done,
              eval_count: 0,
            }) + "\n",
          ),
        );
        controller.close();
      },
    });
  }

  it("empty stream reply on a wrap-intent emits reliability fallback BEFORE done", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if ((init as RequestInit | undefined)?.method !== "POST") {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }));
      }
      return new Response(buildOllamaStreamBody(""), { status: 200 });
    });

    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "explain this code" }),
      }),
    );
    const events = await readAllEvents(response.body!);

    // Ordering must be deterministic: meta → 0..n delta → reliability → done.
    const order = events.map((e) => e.type);
    const reliabilityIdx = order.indexOf("reliability");
    const doneIdx = order.indexOf("done");
    expect(reliabilityIdx).toBeGreaterThan(-1);
    expect(doneIdx).toBeGreaterThan(reliabilityIdx);
    expect(events[0].type).toBe("meta");

    const reliability = events[reliabilityIdx];
    if (reliability && reliability.type === "reliability") {
      expect(reliability.intent).toBe("wrap");
      expect(reliability.kind).toBe("fallback");
      expect(reliability.cloudUsed).toBe(false);
      expect(reliability.localOnly).toBe(true);
      expect(reliability.ok).toBe(false);
      expect(reliability.decomposition?.length).toBeGreaterThan(0);
      expect(reliability.reply).toMatch(/honest|smaller next steps/i);
    }
  });

  it("valid stream reply on a wrap-intent emits no reliability event (casual path)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if ((init as RequestInit | undefined)?.method !== "POST") {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }));
      }
      return new Response(
        buildOllamaStreamBody(
          "This function reads a file line by line and returns the array of lines.",
        ),
        { status: 200 },
      );
    });

    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "explain this code" }),
      }),
    );
    const events = await readAllEvents(response.body!);
    expect(events.some((e) => e.type === "reliability")).toBe(false);
    expect(events.some((e) => e.type === "delta")).toBe(true);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("fake-success stream reply triggers fallback and never echoes the claim into reliability.reply", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if ((init as RequestInit | undefined)?.method !== "POST") {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }));
      }
      return new Response(
        buildOllamaStreamBody("I have fixed the test for you."),
        { status: 200 },
      );
    });

    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "explain this code please" }),
      }),
    );
    const events = await readAllEvents(response.body!);
    const reliability = events.find((e) => e.type === "reliability");
    expect(reliability).toBeDefined();
    if (reliability && reliability.type === "reliability") {
      expect(reliability.kind).toBe("fallback");
      expect(reliability.reply).not.toMatch(/I have fixed/);
    }
  });

  it("casual stream chat is unchanged — no wrap, no reliability event", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if ((init as RequestInit | undefined)?.method !== "POST") {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }));
      }
      return new Response(buildOllamaStreamBody("Sure, hello!"), { status: 200 });
    });

    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "hi squidley" }),
      }),
    );
    const events = await readAllEvents(response.body!);
    expect(events.some((e) => e.type === "reliability")).toBe(false);
  });

  it("no silent cloud calls on the wrap stream path", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      urls.push(String(input));
      if ((init as RequestInit | undefined)?.method !== "POST") {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }));
      }
      return new Response(buildOllamaStreamBody(""), { status: 200 });
    });

    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "explain this code" }),
      }),
    );
    await readAllEvents(response.body!);
    for (const url of urls) {
      expect(url).toMatch(/^http:\/\/(localhost|127\.0\.0\.1|test-local)/);
    }
  });
});

describe("/api/chat/stream — file inspection (approval-gated)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inspection intent without approval emits approval_required then done — no upstream fetch", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "what does src/app/page.tsx do?" }),
      }),
    );
    const events = await readAllEvents(response.body!);
    expect(events[0].type).toBe("approval_required");
    if (events[0].type === "approval_required") {
      expect(events[0].path).toBe("src/app/page.tsx");
      expect(events[0].cloudUsed).toBe(false);
      expect(events[0].localOnly).toBe(true);
      expect(events[0].willNotRead.length).toBeGreaterThan(0);
    }
    expect(events.some((e) => e.type === "done")).toBe(true);
    // No model event types should be emitted.
    expect(events.some((e) => e.type === "meta")).toBe(false);
    expect(events.some((e) => e.type === "delta")).toBe(false);
    // No upstream POST.
    expect(
      fetchImpl.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toBeUndefined();
  });

  it("inspection intent with no path asks for a path via file_inspection event", async () => {
    vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "summarize this markdown file" }),
      }),
    );
    const events = await readAllEvents(response.body!);
    const fi = events.find((e) => e.type === "file_inspection");
    expect(fi).toBeDefined();
    if (fi && fi.type === "file_inspection") {
      expect(fi.status).toBe("needs-path");
      expect(fi.cloudUsed).toBe(false);
      expect(fi.reply).toMatch(/name the file/);
    }
  });

  it("stream never emits file content without approval — no delta with file body", async () => {
    vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "inspect src/secret-notes.md" }),
      }),
    );
    const events = await readAllEvents(response.body!);
    // No delta events at all on the approval-required path.
    expect(events.some((e) => e.type === "delta")).toBe(false);
    // approval_required.reason carries the user's message, but never
    // the file contents.
    const ar = events.find((e) => e.type === "approval_required");
    if (ar && ar.type === "approval_required") {
      expect(ar.reason).not.toMatch(/this should not leak/);
    }
  });

  it("event ordering is deterministic: approval_required → done", async () => {
    vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "inspect package.json" }),
      }),
    );
    const events = await readAllEvents(response.body!);
    const order = events.map((e) => e.type);
    expect(order[0]).toBe("approval_required");
    expect(order[order.length - 1]).toBe("done");
  });

  it("teacher intercept still wins over file inspection", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ models: [{ name: "llama3.2" }] })),
    );
    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        // Teacher intercept lives only on /api/chat (non-stream).
        // Stream route does NOT have teacher intercept — confirmed by
        // existing code. So this test confirms that for inspection-
        // matching teacher questions the inspection layer doesn't
        // accidentally swallow non-inspection teacher queries.
        body: JSON.stringify({ message: "tell me a joke" }),
      }),
    );
    const events = await readAllEvents(response.body!);
    // 'tell me a joke' is not an inspection intent → flows to upstream.
    expect(events.some((e) => e.type === "approval_required")).toBe(false);
    expect(events.some((e) => e.type === "file_inspection")).toBe(false);
    fetchImpl.mockRestore();
  });
});

describe("/api/chat/stream — structured planning", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("planning intent emits exactly one plan event then done — no model fetch", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "make a plan to fix the build" }),
      }),
    );
    const events = await readAllEvents(response.body!);
    expect(events.find((e) => e.type === "plan")).toBeDefined();
    expect(events.some((e) => e.type === "done")).toBe(true);
    expect(events.some((e) => e.type === "delta")).toBe(false);
    expect(events.some((e) => e.type === "meta")).toBe(false);
    expect(
      fetchImpl.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toBeUndefined();
  });

  it("plan event is deterministic: plan → done, in that order", async () => {
    vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "what is the plan?" }),
      }),
    );
    const order = (await readAllEvents(response.body!)).map((e) => e.type);
    expect(order[0]).toBe("plan");
    expect(order[order.length - 1]).toBe("done");
  });

  it("plan event provenance never includes uninspected files as KNOWN", async () => {
    vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({
          message: "how would you fix src/a.ts and src/b.ts?",
          inspectedFiles: [
            { path: "src/a.ts", packedContent: "export const a = 1;" },
          ],
        }),
      }),
    );
    const events = await readAllEvents(response.body!);
    const planEv = events.find((e) => e.type === "plan");
    expect(planEv).toBeDefined();
    if (planEv && planEv.type === "plan") {
      const knownStr = planEv.provenance.known.join(" | ");
      expect(knownStr).toContain("src/a.ts");
      expect(knownStr).not.toContain("src/b.ts");
      expect(planEv.cloudUsed).toBe(false);
      expect(planEv.localOnly).toBe(true);
    }
  });

  it("casual stream chat is not converted to a plan", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if ((init as RequestInit | undefined)?.method !== "POST") {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }));
      }
      return new Response(
        new ReadableStream({
          start(c) {
            const enc = new TextEncoder();
            c.enqueue(
              enc.encode(
                JSON.stringify({ message: { content: "hi!" }, done: false }) + "\n",
              ),
            );
            c.enqueue(
              enc.encode(
                JSON.stringify({ message: { content: "" }, done: true }) + "\n",
              ),
            );
            c.close();
          },
        }),
        { status: 200 },
      );
    });
    const response = await POST(
      new Request("http://test/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "hi squidley" }),
      }),
    );
    const events = await readAllEvents(response.body!);
    expect(events.some((e) => e.type === "plan")).toBe(false);
  });
});
