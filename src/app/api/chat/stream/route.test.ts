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
