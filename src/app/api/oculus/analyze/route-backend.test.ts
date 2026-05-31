/**
 * Tests for Oculus backend honesty — llama-cpp vision is not supported.
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

function oculusRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request("http://test/api/oculus/analyze", {
    method: "POST",
    body: JSON.stringify({
      model: "qwen3-vl:4b",
      imageBase64: "iVBORw0KGgo=",
      ...overrides,
    }),
  });
}

describe("/api/oculus/analyze backend honesty", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends think:false in Ollama vision request", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ message: { content: "A test image." } }), { status: 200 }),
    );

    const response = await POST(oculusRequest());
    expect(response.status).toBe(200);

    const modelCall = findModelCall(fetchImpl);
    expect(modelCall).toBeDefined();
    const sentBody = JSON.parse(modelCall![1].body as string);
    expect(sentBody.think).toBe(false);
    expect(sentBody.stream).toBe(false);
  });

  it("blocks non-vision models with clear message", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const response = await POST(oculusRequest({ model: "llama3.2:3b" }));
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("vision_model_required");
    expect(body.cloudUsed).toBe(false);
  });

  it("blocks llama-cpp vision before contacting a model", async () => {
    const previousBackend = process.env.PEH_LOCAL_BACKEND;
    process.env.PEH_LOCAL_BACKEND = "llama-cpp";
    const fetchImpl = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ message: { content: "should not be called" } }), { status: 200 }),
    );

    try {
      const response = await POST(oculusRequest());
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("vision_not_supported");
      expect(body.error.message).toMatch(/not yet supported with llama-server/i);
      expect(body.cloudUsed).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      if (previousBackend === undefined) {
        delete process.env.PEH_LOCAL_BACKEND;
      } else {
        process.env.PEH_LOCAL_BACKEND = previousBackend;
      }
    }
  });

  it("returns provider:local and cloudUsed:false on Ollama vision success", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ message: { content: "Visible text in image." } }), { status: 200 }),
    );

    const response = await POST(oculusRequest());
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.provider).toBe("local");
    expect(body.cloudUsed).toBe(false);
    expect(body.localOnly).toBe(true);
  });
});
