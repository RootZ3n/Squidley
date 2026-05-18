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

describe("/api/chat — answer-wrap (Phase 3)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first-try success on a wrap-intent leaves the response shape unchanged", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          message: {
            content:
              "This function reads a file line by line and returns the lines as an array.",
          },
        }),
        { status: 200 },
      ),
    );

    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Explain this code please" }),
      }),
    );

    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.reply).toMatch(/file line by line/);
    // No reliability summary on first-try success.
    expect(json.reliability).toBeUndefined();
    expect(json.cloudUsed).toBe(false);
  });

  it("empty first reply triggers exactly one retry, then returns the retry success", async () => {
    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if ((init as RequestInit | undefined)?.method !== "POST") {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }));
      }
      call++;
      if (call === 1) {
        return new Response(JSON.stringify({ message: { content: "" } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          message: {
            content:
              "Real explanation: this function iterates and returns the result line.",
          },
        }),
        { status: 200 },
      );
    });

    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Explain this function" }),
      }),
    );
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.reliability?.intent).toBe("wrap");
    expect(json.reliability?.kind).toBe("retried-ok");
    expect(json.reliability?.retries).toBe(1);
    expect(json.reply).toMatch(/iterates and returns/);
    expect(call).toBe(2);
  });

  it("empty reply twice falls back honestly with decomposition", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if ((init as RequestInit | undefined)?.method !== "POST") {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }));
      }
      return new Response(JSON.stringify({ message: { content: "" } }), { status: 200 });
    });

    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "why is my test failing" }),
      }),
    );
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.reliability?.kind).toBe("fallback");
    expect(json.reliability?.decomposition?.length).toBeGreaterThan(0);
    expect(json.reliability?.cloudUsed).toBe(false);
    expect(json.reply).toMatch(/honest|smaller next steps/i);
    expect(json.reliability?.receiptActions).toContain(
      "reliability.local-answer-fallback-returned",
    );
  });

  it("fake-success reply is flagged and replaced with honest fallback", async () => {
    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if ((init as RequestInit | undefined)?.method !== "POST") {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }));
      }
      call++;
      const content =
        call === 1
          ? "I have fixed the test for you."
          : "Done! I have edited the file.";
      return new Response(JSON.stringify({ message: { content } }), { status: 200 });
    });

    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Why is my test failing?" }),
      }),
    );
    const json = await response.json();
    expect(json.reliability?.kind).toBe("fallback");
    expect(json.reply).not.toMatch(/I have fixed/);
    expect(json.reply).toMatch(/cannot actually perform/);
  });

  it("retry is bounded — handler is called at most twice", async () => {
    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if ((init as RequestInit | undefined)?.method !== "POST") {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }));
      }
      call++;
      return new Response(JSON.stringify({ message: { content: "" } }), { status: 200 });
    });

    await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Explain this code" }),
      }),
    );
    expect(call).toBeLessThanOrEqual(2);
  });

  it("no silent cloud calls on the wrap path", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ message: { content: "" } }), { status: 200 });
    });

    await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "Explain this code" }),
      }),
    );
    // Every URL touched must be local (loopback / localhost).
    for (const url of calls) {
      expect(url).toMatch(/^(http:\/\/(localhost|127\.0\.0\.1|test-local))/);
    }
  });

  it("teacher intercept still wins over wrap intercept", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "What is local mode?" }),
      }),
    );
    const json = await response.json();
    expect(json.teacherSource).toBe("teacher_layer");
    expect(json.reliability).toBeUndefined();
    expect(
      fetchImpl.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toBeUndefined();
  });

  it("health_check intercept still wins over wrap intercept", async () => {
    vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "is ollama running" }),
      }),
    );
    const json = await response.json();
    expect(json.model).toBe("reliability_layer");
    expect(json.reliability?.intent).toBe("health_check");
  });
});

describe("/api/chat — file inspection (approval-gated)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("file-inspection intent without approval returns approvalRequired, no model call", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "what does src/app/page.tsx do?" }),
      }),
    );
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.model).toBe("file_inspection_layer");
    expect(json.approvalRequired).toBeDefined();
    expect(json.approvalRequired.action).toBe("inspect_one_file_safely");
    expect(json.approvalRequired.path).toBe("src/app/page.tsx");
    expect(json.cloudUsed).toBe(false);
    // No POST to local model.
    expect(
      fetchImpl.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toBeUndefined();
  });

  it("intent without an extracted path asks the user to name a file", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "summarize this markdown file" }),
      }),
    );
    const json = await response.json();
    expect(json.fileInspection?.status).toBe("needs-path");
    expect(json.reply).toMatch(/name the file/);
    expect(
      fetchImpl.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toBeUndefined();
  });

  it("traversal path is blocked, never reads anything", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "inspect ../etc/passwd.ts",
          inspectionApproval: {
            action: "inspect_one_file_safely",
            path: "../etc/passwd.ts",
            approvedAt: Date.now(),
            approvalId: "fake",
          },
        }),
      }),
    );
    const json = await response.json();
    // The intent extractor rejects ".." so we end up in needs-path or
    // blocked — either way, no file content is in the reply.
    expect(["needs-path", "blocked"]).toContain(json.fileInspection?.status);
    expect(json.reply).not.toMatch(/root:/);
    expect(
      fetchImpl.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toBeUndefined();
  });

  it("teacher intercept still wins over file inspection", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        // This is a teacher question; teacher answer should win.
        body: JSON.stringify({ message: "What is local mode?" }),
      }),
    );
    const json = await response.json();
    expect(json.teacherSource).toBe("teacher_layer");
    expect(json.approvalRequired).toBeUndefined();
    expect(json.fileInspection).toBeUndefined();
    expect(
      fetchImpl.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toBeUndefined();
  });

  it("approval response never sets cloudUsed=true", async () => {
    vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "inspect src/app/page.tsx" }),
      }),
    );
    const json = await response.json();
    expect(json.cloudUsed).toBe(false);
  });

  it("no write APIs are exposed via the inspection adapter", async () => {
    // Structural: the FileInspectionReader interface in the public
    // reliability index has no write methods. This guards against
    // future drift.
    const reliability = await import("@/lib/reliability");
    expect(typeof reliability.safeFileInspect).toBe("function");
    expect((reliability as Record<string, unknown>).writeFile).toBeUndefined();
    expect((reliability as Record<string, unknown>).editFile).toBeUndefined();
  });
});
