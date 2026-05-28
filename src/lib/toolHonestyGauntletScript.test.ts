/**
 * Contract tests for scripts/tool-honesty-gauntlet.mjs.
 *
 * The live gauntlet is a developer-run check against `npm run dev`. Here we
 * verify the script's basic contract: it rejects non-local chat bases, and
 * it emits a SKIP status when the chat endpoint is unreachable (rather
 * than claiming PASS).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SCRIPT = path.join(REPO_ROOT, "scripts/tool-honesty-gauntlet.mjs");

describe("tool-honesty-gauntlet script contract", () => {
  it("script exists and references the honesty annotator", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toMatch(/honestyAnnotation/);
    expect(src).toMatch(/responseMode/);
    expect(src).toMatch(/unavailableTools/);
    expect(src).toMatch(/SKIP_LOCAL_SERVER_NOT_RUNNING/);
  });

  it("refuses a non-local chat base before any request", () => {
    const result = spawnSync("node", [SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, SQUIDLEY_CHAT_BASE: "https://api.openai.com" },
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.status).toBe(1);
    expect((result.stdout + result.stderr)).toMatch(/refusing to use non-local chat base/);
  });

  it("emits SKIP_LOCAL_SERVER_NOT_RUNNING when chat endpoint is unreachable", () => {
    const result = spawnSync("node", [SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, SQUIDLEY_CHAT_BASE: "http://127.0.0.1:65529" },
      encoding: "utf8",
      timeout: 60000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/SKIP_LOCAL_SERVER_NOT_RUNNING/);
  });
});
