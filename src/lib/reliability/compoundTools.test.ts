import { describe, it, expect } from "vitest";
import {
  COMPOUND_TOOL_REGISTRY,
  explainProjectStructure,
  inspectOneFileSafely,
  makeSmallTextChangeAndVerify,
  runLocalHealthCheck,
  summarizeErrorAndNextStep,
  type DirEntry,
  type LocalHealthReport,
  type ToolEnvironment,
} from "@/lib/reliability/compoundTools";

function fakeEnv(args: {
  dir?: Record<string, readonly DirEntry[]>;
  files?: Record<string, string>;
  health?: LocalHealthReport;
  healthThrows?: boolean;
  allowWrite?: boolean;
  writeSink?: Map<string, string>;
}): ToolEnvironment {
  return {
    rootPath: "/repo",
    allowWriteOperations: args.allowWrite ?? false,
    async readDir(path) {
      const entries = args.dir?.[path];
      if (!entries) throw new Error(`no dir: ${path}`);
      return entries;
    },
    async readFile(path) {
      const file = args.files?.[path];
      if (file === undefined) throw new Error(`no file: ${path}`);
      return file;
    },
    async probeLocalHealth() {
      if (args.healthThrows) throw new Error("probe blew up");
      return (
        args.health ?? {
          ok: false,
          backend: "unknown",
          endpoint: "http://localhost:11434",
          error: "not configured",
        }
      );
    },
    async writeFile(path, contents) {
      args.writeSink?.set(path, contents);
    },
  };
}

describe("compoundTools/explainProjectStructure", () => {
  it("lists visible top-level entries and skips ignored dirs", async () => {
    const env = fakeEnv({
      dir: {
        "/repo": [
          { name: "src", isDirectory: true },
          { name: "package.json", isDirectory: false },
          { name: "node_modules", isDirectory: true },
          { name: ".git", isDirectory: true },
        ],
      },
    });
    const result = await explainProjectStructure(env);
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/src/);
    expect(result.summary).toMatch(/package\.json/);
    expect(result.summary).not.toMatch(/node_modules/);
    expect(result.summary).not.toMatch(/\.git/);
  });

  it("fails honestly when root cannot be read", async () => {
    const env = fakeEnv({});
    const result = await explainProjectStructure(env);
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/could not read/);
  });
});

describe("compoundTools/inspectOneFileSafely", () => {
  it("rejects path traversal", async () => {
    const env = fakeEnv({ files: { "../etc/passwd": "secret" } });
    const result = await inspectOneFileSafely(env, { path: "../etc/passwd" });
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/unsafe/);
  });

  it("summarizes exports without dumping the whole file", async () => {
    const body = `export function foo() {}\nexport const bar = 1;\nfunction internal() {}`;
    const env = fakeEnv({ files: { "src/a.ts": body } });
    const result = await inspectOneFileSafely(env, { path: "src/a.ts" });
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/foo/);
    expect(result.summary).toMatch(/bar/);
  });

  it("does not invent contents when file is missing", async () => {
    const env = fakeEnv({});
    const result = await inspectOneFileSafely(env, { path: "missing.ts" });
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/could not read/);
  });

  it("refuses to inline an oversized file", async () => {
    const giant = "x".repeat(200_000);
    const env = fakeEnv({ files: { "big.ts": giant } });
    const result = await inspectOneFileSafely(env, { path: "big.ts", maxChars: 1000 });
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/too large/);
  });
});

describe("compoundTools/summarizeErrorAndNextStep", () => {
  it("classifies ECONNREFUSED as server unreachable", () => {
    const result = summarizeErrorAndNextStep({
      errorText: "fetch failed: ECONNREFUSED 127.0.0.1:11434",
    });
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/unreachable/);
    expect(result.nextStep).toMatch(/health check/);
  });

  it("classifies ENOENT as missing file", () => {
    const result = summarizeErrorAndNextStep({ errorText: "ENOENT: no such file" });
    expect(result.summary).toMatch(/does not exist/);
  });

  it("classifies empty-content errors with the thinking hint", () => {
    const result = summarizeErrorAndNextStep({
      errorText: "model returned empty content",
    });
    expect(result.nextStep).toMatch(/think: false/);
  });

  it("returns a not-ok result for empty input rather than fabricating", () => {
    const result = summarizeErrorAndNextStep({ errorText: "" });
    expect(result.ok).toBe(false);
  });
});

describe("compoundTools/runLocalHealthCheck", () => {
  it("reports ready honestly when probe says ok", async () => {
    const env = fakeEnv({
      health: { ok: true, backend: "ollama", endpoint: "http://localhost:11434", modelCount: 2 },
    });
    const result = await runLocalHealthCheck(env);
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/ready/);
  });

  it("reports not-ready when probe fails — does not pretend it is up", async () => {
    const env = fakeEnv({
      health: { ok: false, backend: "ollama", endpoint: "http://localhost:11434", error: "no models" },
    });
    const result = await runLocalHealthCheck(env);
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/not ready/);
  });

  it("handles probe exceptions without crashing", async () => {
    const env = fakeEnv({ healthThrows: true });
    const result = await runLocalHealthCheck(env);
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/could not run/);
  });
});

describe("compoundTools/makeSmallTextChangeAndVerify", () => {
  it("is disabled by default and never writes", async () => {
    const sink = new Map<string, string>();
    const env = fakeEnv({ allowWrite: false, writeSink: sink });
    const result = await makeSmallTextChangeAndVerify(env, {
      path: "src/x.ts",
      find: "a",
      replace: "b",
    });
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/does not change files/);
    expect(sink.size).toBe(0);
  });

  it("applies a change when explicitly allowed and verifier passes", async () => {
    const sink = new Map<string, string>();
    const env = fakeEnv({
      allowWrite: true,
      files: { "src/x.ts": "hello world" },
      writeSink: sink,
    });
    const result = await makeSmallTextChangeAndVerify(env, {
      path: "src/x.ts",
      find: "world",
      replace: "squidley",
      verify: async () => ({ ok: true }),
    });
    expect(result.ok).toBe(true);
    expect(sink.get("src/x.ts")).toBe("hello squidley");
  });

  it("rolls forward as failed if verifier returns false", async () => {
    const sink = new Map<string, string>();
    const env = fakeEnv({
      allowWrite: true,
      files: { "src/x.ts": "hello world" },
      writeSink: sink,
    });
    const result = await makeSmallTextChangeAndVerify(env, {
      path: "src/x.ts",
      find: "world",
      replace: "squidley",
      verify: async () => ({ ok: false, detail: "tests fail" }),
    });
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/verification failed/);
  });
});

describe("compoundTools/registry", () => {
  it("declares the edit tool disabled by default", () => {
    const edit = COMPOUND_TOOL_REGISTRY.find((t) => t.id === "make_small_text_change_and_verify");
    expect(edit?.enabledByDefault).toBe(false);
    expect(edit?.writesFiles).toBe(true);
  });

  it("registry entries never claim cloud usage", () => {
    for (const tool of COMPOUND_TOOL_REGISTRY) {
      expect(tool.needsCloud).toBe(false);
    }
  });
});
