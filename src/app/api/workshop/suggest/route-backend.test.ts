/**
 * Tests for Workshop backend selection and honesty guarantees.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

/** Find the POST call to the model (not the GET detection probes). */
function findModelCall(spy: { mock: { calls: unknown[][] } }): [string, RequestInit] | undefined {
  for (const call of spy.mock.calls) {
    const init = call[1] as RequestInit | undefined;
    if (init?.method === "POST") return [call[0] as string, init];
  }
  return undefined;
}

function fabricaRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request("http://test/api/workshop/suggest", {
    method: "POST",
    body: JSON.stringify({
      language: "typescript",
      originalContent: "const x = 1;",
      requestedChange: "Add a type annotation.",
      ...overrides,
    }),
  });
}

describe("/api/workshop/suggest backend routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends think:false to Ollama backend", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ message: { content: "const x: number = 1;" } }), { status: 200 }),
    );

    const response = await POST(fabricaRequest());
    expect(response.status).toBe(200);

    const modelCall = findModelCall(fetchImpl);
    expect(modelCall).toBeDefined();
    const sentBody = JSON.parse(modelCall![1].body as string);
    expect(sentBody.think).toBe(false);
    expect(sentBody.stream).toBe(false);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.provider).toBe("local");
    expect(body.cloudUsed).toBe(false);
    expect(body.toolsUsed).toBe(false);
    expect(body.fileSystemWrites).toBe(false);
    expect(body.suggestion).toBe("const x: number = 1;");
  });

  it("returns provider:local and cloudUsed:false on success", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ message: { content: "result" } }), { status: 200 }),
    );

    const response = await POST(fabricaRequest());
    const body = await response.json();
    expect(body.provider).toBe("local");
    expect(body.cloudUsed).toBe(false);
    expect(body.localOnly).toBe(true);
  });

  it("returns beginner-readable error when backend is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new TypeError("fetch failed");
    });

    const response = await POST(fabricaRequest());
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("local_provider_unreachable");
    expect(body.error.message).toMatch(/local model server/i);
    expect(body.cloudUsed).toBe(false);
  });

  it("returns error when model returns empty suggestion", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ message: { content: "" } }), { status: 200 }),
    );

    const response = await POST(fabricaRequest());
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("local_provider_error");
    expect(body.cloudUsed).toBe(false);
  });
});
