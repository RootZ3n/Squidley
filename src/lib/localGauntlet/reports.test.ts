import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLocalGauntletReportIndex } from "./reports";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "peh-gauntlet-reports-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("local gauntlet report index", () => {
  it("returns an empty index when no reports exist", async () => {
    const index = await readLocalGauntletReportIndex(tempRoot);

    expect(index.latestByModelBackend).toEqual([]);
    expect(index.acceptedReports).toBe(0);
    expect(index.rejectedReports).toEqual([]);
    expect(index.warning).toMatch(/not proof/i);
  });

  it("summarizes one report with safe UI-ready fields only", async () => {
    await writeReport("one.json", reportFixture({
      model: "qwen3.5:0.8b",
      backend: "ollama",
      completedAt: "2026-05-11T10:00:00.000Z",
    }));

    const index = await readLocalGauntletReportIndex(tempRoot);

    expect(index.acceptedReports).toBe(1);
    expect(index.latestByModelBackend).toHaveLength(1);
    expect(index.latestByModelBackend[0]).toMatchObject({
      backend: "ollama",
      model: "qwen3.5:0.8b",
      modelKey: "ollama::qwen3.5:0.8b",
      localOnly: true,
      cloudUsed: false,
      overall: "TRY_VERIFY",
      statusSummary: { PASS: 1, TRY_VERIFY: 1, NEEDS_CLOUD: 0, BLOCKED: 0 },
      durationMs: 5000,
      warning: "Narrow local smoke only, not a benchmark or proof of full safety.",
    });
    expect(index.latestByModelBackend[0].taskResults).toEqual([
      {
        id: "basic_chat",
        label: "Basic chat",
        status: "PASS",
        reason: "Followed exact basic reply.",
        durationMs: 120,
      },
      {
        id: "short_summarization",
        label: "Short summarization",
        status: "TRY_VERIFY",
        reason: "Needs human verification.",
        durationMs: 240,
      },
    ]);
    expect(JSON.stringify(index)).not.toContain("replySnippet");
    expect(JSON.stringify(index)).not.toContain("prompt");
  });

  it("selects the latest report for the same model and backend", async () => {
    await writeReport("old.json", reportFixture({
      model: "qwen3.5:0.8b",
      backend: "ollama",
      overall: "NEEDS_CLOUD",
      completedAt: "2026-05-11T09:00:00.000Z",
    }));
    await writeReport("new.json", reportFixture({
      model: "qwen3.5:0.8b",
      backend: "ollama",
      overall: "PASS",
      completedAt: "2026-05-11T12:00:00.000Z",
    }));

    const index = await readLocalGauntletReportIndex(tempRoot);

    expect(index.acceptedReports).toBe(2);
    expect(index.latestByModelBackend).toHaveLength(1);
    expect(index.latestByModelBackend[0].fileName).toBe("new.json");
    expect(index.latestByModelBackend[0].overall).toBe("PASS");
  });

  it("keeps separate latest reports for the same model on different backends", async () => {
    await writeReport("ollama.json", reportFixture({
      model: "qwen3.5:0.8b",
      backend: "ollama",
      completedAt: "2026-05-11T10:00:00.000Z",
    }));
    await writeReport("compat.json", reportFixture({
      model: "qwen3.5:0.8b",
      backend: "openai-compatible",
      completedAt: "2026-05-11T11:00:00.000Z",
    }));

    const index = await readLocalGauntletReportIndex(tempRoot);

    expect(index.latestByModelBackend.map((report) => report.modelKey).sort()).toEqual([
      "ollama::qwen3.5:0.8b",
      "openai-compatible::qwen3.5:0.8b",
    ]);
  });

  it("ignores malformed report files safely", async () => {
    await writeRawReport("bad.json", "{not json");
    await writeReport("good.json", reportFixture({ model: "llama3.2" }));

    const index = await readLocalGauntletReportIndex(tempRoot);

    expect(index.acceptedReports).toBe(1);
    expect(index.rejectedReports).toEqual([
      { fileName: "bad.json", reason: "Malformed JSON report ignored." },
    ]);
  });

  it("rejects cloudUsed:true reports", async () => {
    await writeReport("cloud.json", reportFixture({ cloudUsed: true }));

    const index = await readLocalGauntletReportIndex(tempRoot);

    expect(index.acceptedReports).toBe(0);
    expect(index.latestByModelBackend).toEqual([]);
    expect(index.rejectedReports).toEqual([
      { fileName: "cloud.json", reason: "Rejected report because cloudUsed is not false." },
    ]);
  });

  it("rejects localOnly:false reports", async () => {
    await writeReport("not-local.json", reportFixture({ localOnly: false }));

    const index = await readLocalGauntletReportIndex(tempRoot);

    expect(index.acceptedReports).toBe(0);
    expect(index.latestByModelBackend).toEqual([]);
    expect(index.rejectedReports).toEqual([
      { fileName: "not-local.json", reason: "Rejected report because localOnly is not true." },
    ]);
  });
});

async function writeReport(fileName: string, report: Record<string, unknown>): Promise<void> {
  await writeRawReport(fileName, JSON.stringify(report, null, 2));
}

async function writeRawReport(fileName: string, content: string): Promise<void> {
  const dir = join(tempRoot, "reports", "local-model-gauntlet");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), content, "utf8");
}

function reportFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    tool: "scripts/gauntlet-local-model.mjs",
    startedAt: "2026-05-11T09:59:55.000Z",
    completedAt: "2026-05-11T10:00:00.000Z",
    backend: "ollama",
    endpoint: "http://127.0.0.1:11434",
    model: "qwen3.5:0.8b",
    modelSource: "override",
    localOnly: true,
    cloudUsed: false,
    statusSummary: { PASS: 1, TRY_VERIFY: 1, NEEDS_CLOUD: 0, BLOCKED: 0 },
    overall: "TRY_VERIFY",
    limitations: ["Narrow local smoke only."],
    tasks: [{ id: "basic_chat", label: "Basic chat", prompt: "hidden from summary" }],
    results: [
      {
        id: "basic_chat",
        label: "Basic chat",
        status: "PASS",
        reason: "Followed exact basic reply.",
        durationMs: 120,
        replySnippet: "local ready",
      },
      {
        id: "short_summarization",
        label: "Short summarization",
        status: "TRY_VERIFY",
        reason: "Needs human verification.",
        durationMs: 240,
        replySnippet: "summary",
      },
    ],
    ...overrides,
  };
}
