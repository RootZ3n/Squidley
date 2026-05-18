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
