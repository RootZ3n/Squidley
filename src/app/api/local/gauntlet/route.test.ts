import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempRoot: string;
let cwdSpy: { mockRestore(): void };

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "peh-gauntlet-api-"));
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempRoot);
  vi.resetModules();
});

afterEach(async () => {
  cwdSpy.mockRestore();
  await rm(tempRoot, { recursive: true, force: true });
});

describe("GET /api/local/gauntlet", () => {
  it("returns an empty local index when no reports exist", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.provider).toBe("local");
    expect(body.cloudUsed).toBe(false);
    expect(body.latestByModelBackend).toEqual([]);
    expect(body.acceptedReports).toBe(0);
    expect(body.rejectedReports).toEqual([]);
    expect(body.warning).toMatch(/not proof/i);
  });

  it("rejects unsafe reports through the report reader", async () => {
    await writeReport("cloud.json", reportFixture({ cloudUsed: true }));
    await writeReport("not-local.json", reportFixture({ localOnly: false }));
    await writeReport("safe.json", reportFixture({ model: "qwen3.5:0.8b" }));

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(body.acceptedReports).toBe(1);
    expect(body.latestByModelBackend).toHaveLength(1);
    expect(body.latestByModelBackend[0]).toMatchObject({
      model: "qwen3.5:0.8b",
      localOnly: true,
      cloudUsed: false,
    });
    expect(body.rejectedReports.map((item: { fileName: string }) => item.fileName).sort()).toEqual([
      "cloud.json",
      "not-local.json",
    ]);
  });

  it("does not expose prompts or reply snippets", async () => {
    await writeReport("safe.json", reportFixture({}));

    const { GET } = await import("./route");
    const response = await GET();
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("replySnippet");
    expect(serialized).not.toContain("hidden prompt");
    expect(serialized).not.toContain("raw model reply");
  });
});

async function writeReport(fileName: string, report: Record<string, unknown>): Promise<void> {
  const dir = join(tempRoot, "reports", "local-model-gauntlet");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), JSON.stringify(report, null, 2), "utf8");
}

function reportFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    tool: "scripts/gauntlet-local-model.mjs",
    startedAt: "2026-05-11T10:00:00.000Z",
    completedAt: "2026-05-11T10:00:05.000Z",
    backend: "ollama",
    endpoint: "http://127.0.0.1:11434",
    model: "llama3.2",
    localOnly: true,
    cloudUsed: false,
    overall: "TRY_VERIFY",
    statusSummary: { PASS: 1, TRY_VERIFY: 1, NEEDS_CLOUD: 0, BLOCKED: 0 },
    tasks: [{ id: "basic_chat", label: "Basic chat", prompt: "hidden prompt" }],
    results: [
      {
        id: "basic_chat",
        label: "Basic chat",
        status: "PASS",
        reason: "Narrow local check passed.",
        durationMs: 100,
        replySnippet: "raw model reply",
      },
    ],
    ...overrides,
  };
}
