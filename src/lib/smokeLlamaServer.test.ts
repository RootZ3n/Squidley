/**
 * Tests for scripts/smoke-llama-server.mjs contract.
 *
 * The script's parsers are unit-tested in llamacpp.test.ts and handler-llamacpp.test.ts.
 * Here we assert the *contract*: remote URLs are rejected before any request,
 * the script returns structured JSON with a `status` field, and the proof
 * marker file is the only thing that makes llama-server LOCAL_READY.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SCRIPT = path.join(REPO_ROOT, "scripts/smoke-llama-server.mjs");

describe("smoke-llama-server script contract", () => {
  it("script exists and contains the remote-URL guard", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toMatch(/FAIL_REMOTE_URL/);
    expect(source).toMatch(/isLocalUrl/);
    expect(source).toMatch(/SKIP_LOCAL_SERVER_NOT_RUNNING/);
    expect(source).toMatch(/PASS_NO_STREAMING/);
  });

  it("rejects an https cloud URL with FAIL_REMOTE_URL and non-zero exit", () => {
    const result = spawnSync("node", [SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, LLAMA_SERVER_URL: "https://api.openai.com" },
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/FAIL_REMOTE_URL/);
    expect(result.stdout).toMatch(/api\.openai\.com/);
  });

  it("rejects an http public-IP URL with FAIL_REMOTE_URL", () => {
    const result = spawnSync("node", [SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, LLAMA_SERVER_URL: "http://8.8.8.8:8080" },
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/FAIL_REMOTE_URL/);
  });

  it("on an unreachable local URL returns SKIP_LOCAL_SERVER_NOT_RUNNING and exit 0", () => {
    // Use an unused local port to deterministically reach the "server not
    // running" branch.
    const result = spawnSync("node", [SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, LLAMA_SERVER_URL: "http://127.0.0.1:65530" },
      encoding: "utf8",
      timeout: 25000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/SKIP_LOCAL_SERVER_NOT_RUNNING/);
  });

  it("PROOF.json is the marker the diagnostic looks for", () => {
    const diagnosticSource = readFileSync(
      path.join(REPO_ROOT, "scripts/public-squidley-diagnostic.mjs"),
      "utf8",
    );
    expect(diagnosticSource).toMatch(/llama-server-smoke\/PROOF\.json/);
  });
});
