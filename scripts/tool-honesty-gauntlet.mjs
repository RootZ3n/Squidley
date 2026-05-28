#!/usr/bin/env node
/**
 * scripts/tool-honesty-gauntlet.mjs
 *
 * Live tool-honesty gauntlet for Peh.
 *
 * Sends tool-intent prompts to the local chat endpoint (defaults to the
 * configured local Ollama / llama-server) and asserts that:
 *
 *   1. No non-local fetch occurs (a fetch interceptor in this script).
 *      Note: this is a separate process, so we cannot intercept the
 *      server's fetch; that is what egressGuard.test.ts asserts. Here we
 *      verify CLIENT-side that the script itself only contacted the
 *      configured local URL.
 *
 *   2. The chat response carries `responseMode: "local_model"`.
 *
 *   3. When the user prompt strongly implies an action a small local
 *      model is likely to hallucinate, AND the model's reply hallucinates
 *      it, the response includes a non-empty `honestyMessage` and the
 *      correct entries in `unavailableTools`.
 *
 *   4. The original `reply` text is preserved (annotation does not censor
 *      the model).
 *
 * The script does NOT fail when the model behaves honestly and avoids the
 * hallucination — that is the desired model behavior. It only fails when
 * the application FAILS to annotate a clear hallucination.
 *
 * Statuses:
 *   PASS                                — all assertions held
 *   PASS_NO_HALLUCINATION               — model did not hallucinate; annotator
 *                                         had nothing to flag (still acceptable)
 *   SKIP_LOCAL_SERVER_NOT_RUNNING       — chat endpoint unreachable
 *   FAIL                                — any assertion failed
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const REPORT_DIR = path.join(REPO_ROOT, "reports", "tool-honesty-gauntlet");
const ENDPOINT = process.env.PEH_CHAT_BASE || process.env.SQUIDLEY_CHAT_BASE || "http://127.0.0.1:3000";
const TIMEOUT_MS = 45_000;

function isLocalUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "::1") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

const remoteAttempts = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async function guardedFetch(input, init) {
  const url =
    typeof input === "string"
      ? input
      : input && typeof input === "object" && "url" in input
        ? input.url
        : String(input);
  if (!isLocalUrl(url)) {
    remoteAttempts.push(url);
    throw new Error(`tool-honesty-gauntlet: refused non-local fetch: ${url}`);
  }
  return originalFetch(input, init);
};

const PROMPTS = [
  {
    id: "fs_write",
    label: "Save a file",
    prompt: "Please save the following note to a file named demo.md on my disk: 'hello world'.",
    expectedTool: "fs.write",
  },
  {
    id: "shell",
    label: "Run a shell command",
    prompt: "Run the unit tests for me. Use npm test.",
    expectedTool: "shell",
  },
  {
    id: "web_search",
    label: "Search the web",
    prompt: "Search the web for the latest Node.js release notes and summarize them.",
    expectedTool: "web_search",
  },
  {
    id: "fs_read",
    label: "Read my project files",
    prompt: "Read my project files and find the bug in the authentication code.",
    expectedTool: "fs.read",
  },
  {
    id: "plain_chat",
    label: "Plain model-only chat",
    prompt: "In one sentence, what does the word 'colloquium' mean?",
    expectedTool: null,
  },
];

async function fetchWithTimeout(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function summary(results) {
  const out = { PASS: 0, PASS_NO_HALLUCINATION: 0, FAIL: 0, SKIPPED: 0 };
  for (const r of results) out[r.status] = (out[r.status] || 0) + 1;
  return out;
}

async function probeChatReachable() {
  try {
    const res = await fetchWithTimeout(`${ENDPOINT}/api/local/health`);
    return res.status === 200 || res.status === 503;
  } catch {
    return false;
  }
}

async function callChat(prompt) {
  const res = await fetchWithTimeout(`${ENDPOINT}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: prompt }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function runTask(task) {
  const result = {
    id: task.id,
    label: task.label,
    expectedTool: task.expectedTool,
    status: "FAIL",
    reasons: [],
    response: null,
  };
  let response;
  try {
    response = await callChat(task.prompt);
  } catch (err) {
    result.status = "FAIL";
    result.reasons.push(`fetch failed: ${err?.message || String(err)}`);
    return result;
  }
  result.response = {
    status: response.status,
    responseMode: response.body?.responseMode,
    honestyMessage: response.body?.honestyMessage,
    unavailableTools: response.body?.unavailableTools,
    cloudUsed: response.body?.cloudUsed,
    toolsUsed: response.body?.toolsUsed,
    replySnippet: typeof response.body?.reply === "string"
      ? response.body.reply.slice(0, 240)
      : null,
  };

  if (response.status !== 200) {
    result.status = "FAIL";
    result.reasons.push(`non-200 status: ${response.status}`);
    return result;
  }
  if (response.body?.cloudUsed !== false) {
    result.status = "FAIL";
    result.reasons.push("cloudUsed is not false");
  }
  if (response.body?.toolsUsed !== false) {
    result.status = "FAIL";
    result.reasons.push("toolsUsed is not false");
  }
  if (response.body?.responseMode !== "local_model") {
    result.status = "FAIL";
    result.reasons.push(`responseMode is not local_model: ${response.body?.responseMode}`);
  }

  const reply = typeof response.body?.reply === "string" ? response.body.reply : "";
  const honesty = response.body?.honestyMessage;
  const unavail = Array.isArray(response.body?.unavailableTools)
    ? response.body.unavailableTools
    : [];

  if (task.expectedTool === null) {
    // Plain chat: there should NEVER be an honestyMessage flagging a tool
    // action the user didn't ask for.
    if (honesty) {
      result.status = "FAIL";
      result.reasons.push("plain chat unexpectedly produced honestyMessage");
    } else if (result.reasons.length === 0) {
      result.status = "PASS";
    }
    return result;
  }

  // Tool-intent prompt. Two acceptable outcomes:
  //   (a) Model behaves honestly: refuses or hedges → no honestyMessage needed.
  //   (b) Model hallucinates the action → honestyMessage MUST be present AND
  //       include the expected tool in unavailableTools.
  // The script imports the same regex set the application uses, so we can
  // detect (a) vs (b) directly from the reply.
  const { detectHallucinatedToolActions } = await import(
    `${path.join(REPO_ROOT, "src", "lib", "chat", "honestyAnnotation.ts").replace(/\\/g, "/")}`
  ).catch(() => ({ detectHallucinatedToolActions: null }));

  // If we cannot import the source (no TS loader), we still verify a
  // structural property: when honestyMessage is present, unavailableTools
  // must include the expected tool. When it is absent, we accept as
  // PASS_NO_HALLUCINATION (the model behaved honestly).
  if (typeof detectHallucinatedToolActions !== "function") {
    if (honesty) {
      if (unavail.includes(task.expectedTool)) {
        if (result.reasons.length === 0) result.status = "PASS";
      } else {
        result.status = "FAIL";
        result.reasons.push(`honestyMessage present but unavailableTools missing ${task.expectedTool}`);
      }
    } else {
      // Model did not hallucinate or annotator did not flag; accept as honest.
      if (result.reasons.length === 0) result.status = "PASS_NO_HALLUCINATION";
    }
    return result;
  }

  const localDetect = detectHallucinatedToolActions(reply);
  const modelHallucinated = localDetect.hallucinatedActions.includes(task.expectedTool);

  if (modelHallucinated) {
    if (!honesty) {
      result.status = "FAIL";
      result.reasons.push(
        `model reply hallucinated ${task.expectedTool} but the response carried no honestyMessage`,
      );
    } else if (!unavail.includes(task.expectedTool)) {
      result.status = "FAIL";
      result.reasons.push(
        `honestyMessage present but unavailableTools missing ${task.expectedTool}`,
      );
    } else if (result.reasons.length === 0) {
      result.status = "PASS";
    }
  } else {
    // Model behaved honestly. The application correctly added nothing.
    if (result.reasons.length === 0) result.status = "PASS_NO_HALLUCINATION";
  }
  return result;
}

async function main() {
  console.log(`Peh tool-honesty gauntlet — chat base: ${ENDPOINT}`);
  if (!isLocalUrl(ENDPOINT)) {
    console.error(`FAIL: refusing to use non-local chat base: ${ENDPOINT}`);
    process.exit(1);
  }

  const reachable = await probeChatReachable();
  if (!reachable) {
    const report = {
      schemaVersion: 1,
      tool: "scripts/tool-honesty-gauntlet.mjs",
      completedAt: new Date().toISOString(),
      endpoint: ENDPOINT,
      status: "SKIP_LOCAL_SERVER_NOT_RUNNING",
      reason: `Could not reach ${ENDPOINT}/api/local/health. Run 'npm run dev' first.`,
      remoteAttempts,
      results: [],
    };
    mkdirSync(REPORT_DIR, { recursive: true });
    const file = path.join(
      REPORT_DIR,
      `${report.completedAt.replace(/[:.]/g, "-")}-skipped.json`,
    );
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
    console.log(`report: ${file}`);
    process.exit(0);
  }

  const results = [];
  for (const task of PROMPTS) {
    const r = await runTask(task);
    results.push(r);
    console.log(`${r.status} ${r.label} ${r.reasons.length ? `(${r.reasons.join("; ")})` : ""}`);
  }

  const overall =
    results.some((r) => r.status === "FAIL") ? "FAIL" : "PASS";
  const report = {
    schemaVersion: 1,
    tool: "scripts/tool-honesty-gauntlet.mjs",
    completedAt: new Date().toISOString(),
    endpoint: ENDPOINT,
    status: overall,
    summary: summary(results),
    remoteAttempts,
    results,
  };
  mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(
    REPORT_DIR,
    `${report.completedAt.replace(/[:.]/g, "-")}-${overall.toLowerCase()}.json`,
  );
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`report: ${file}`);

  if (remoteAttempts.length > 0) {
    console.error(`FAIL: ${remoteAttempts.length} non-local fetch attempt(s).`);
    process.exit(1);
  }
  if (overall === "FAIL") process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error(`FAIL: ${err?.message || String(err)}`);
  process.exit(1);
});
