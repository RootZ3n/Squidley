#!/usr/bin/env node
/**
 * scripts/smoke-llama-server.mjs
 *
 * Real llama-server smoke. Public Squidley's llama-cpp text path is only
 * LOCAL_READY when this smoke has been run against a real llama-server
 * binary at a local URL.
 *
 * Env:
 *   LLAMA_SERVER_URL  default http://127.0.0.1:8080
 *   LLAMA_SERVER_MODEL  optional explicit model id
 *
 * Statuses (the script's overall status field):
 *   PASS                            — endpoint local AND /health AND
 *                                     /v1/models AND non-streaming AND
 *                                     streaming all OK
 *   PASS_NO_STREAMING               — non-streaming OK, streaming endpoint
 *                                     present but produced no usable SSE
 *   SKIP_LOCAL_SERVER_NOT_RUNNING   — endpoint local, but the local server
 *                                     is unreachable. Honest skip — does
 *                                     NOT count as a passing proof.
 *   FAIL_INCOMPATIBLE               — server reachable but response shape
 *                                     does not match OpenAI-compatible API
 *   FAIL_REMOTE_URL                 — non-local URL passed in; rejected
 *                                     before any request was made
 *   FAIL                            — anything else
 *
 * Exit codes:
 *   0  PASS, PASS_NO_STREAMING, or SKIP_LOCAL_SERVER_NOT_RUNNING
 *   1  any FAIL_* status
 *
 * A separate marker file is written on PASS so the release diagnostic can
 * see when the smoke was last validated:
 *
 *   reports/llama-server-smoke/PROOF.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const REPORT_DIR = path.join(REPO_ROOT, "reports", "llama-server-smoke");
const PROOF_FILE = path.join(REPORT_DIR, "PROOF.json");

const DEFAULT_ENDPOINT = "http://127.0.0.1:8080";
const REQUEST_TIMEOUT_MS = 20_000;

const rawEndpoint =
  process.env.LLAMA_SERVER_URL ||
  process.env.LLAMA_CPP_ENDPOINT ||
  DEFAULT_ENDPOINT;
const endpoint = String(rawEndpoint || DEFAULT_ENDPOINT).trim().replace(/\/+$/, "");
const modelOverride =
  (process.env.LLAMA_SERVER_MODEL ||
    process.env.LLAMA_CPP_MODEL ||
    "").trim();

function isLocalUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "::1" || host === "[::1]") return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (host.endsWith(".local")) return true;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  return false;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function parseSse(text) {
  let sawDone = false;
  let sawDelta = false;
  let assistant = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      sawDone = true;
      continue;
    }
    if (!data) continue;
    try {
      const chunk = JSON.parse(data);
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        sawDelta = true;
        assistant += delta;
      }
    } catch {
      // ignore — keepalive or comment
    }
  }
  return { sawDone, sawDelta, assistant: assistant.trim() };
}

function recordResult(status, summary, details) {
  const report = {
    schemaVersion: 1,
    tool: "scripts/smoke-llama-server.mjs",
    completedAt: new Date().toISOString(),
    endpoint,
    model: details?.model || modelOverride || null,
    status,
    summary,
    details: details ?? {},
    cloudUsed: false,
    localOnly: true,
  };
  mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${report.completedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (status === "PASS" || status === "PASS_NO_STREAMING") {
    writeFileSync(PROOF_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(report, null, 2));
  console.log(`report: ${file}`);
  return report;
}

async function main() {
  console.log(`Squidley llama-server smoke — endpoint: ${endpoint}`);
  console.log(`Model: ${modelOverride || "(discover from /v1/models)"}`);
  console.log("Network scope: configured local endpoint only.");
  console.log("");

  if (!isLocalUrl(endpoint)) {
    recordResult(
      "FAIL_REMOTE_URL",
      `Refusing to contact non-local endpoint: ${endpoint}.`,
      { rejectedUrl: endpoint },
    );
    process.exit(1);
  }

  // 1. /health
  let health = null;
  try {
    const res = await fetchWithTimeout(`${endpoint}/health`);
    let body = null;
    try {
      body = await readJson(res);
    } catch {
      body = null;
    }
    health = { ok: res.ok, status: res.status, body };
    if (!res.ok && res.status === 503) {
      // llama-server returns 503 while a model is loading. Treat as
      // unreachable-for-now and SKIP.
      recordResult(
        "SKIP_LOCAL_SERVER_NOT_RUNNING",
        "llama-server returned 503; model still loading or server not ready.",
        { health },
      );
      process.exit(0);
    }
  } catch (err) {
    recordResult(
      "SKIP_LOCAL_SERVER_NOT_RUNNING",
      `Could not reach ${endpoint}/health: ${err?.message || "unknown error"}. Start llama-server first: llama-server -m model.gguf --port 8080.`,
      { error: err?.message || String(err) },
    );
    process.exit(0);
  }

  // 2. /v1/models
  let discoveredModel = "";
  try {
    const res = await fetchWithTimeout(`${endpoint}/v1/models`);
    if (!res.ok) {
      recordResult(
        "FAIL_INCOMPATIBLE",
        `GET /v1/models returned HTTP ${res.status}. llama-server must expose the OpenAI-compatible endpoint.`,
        { health, modelsStatus: res.status },
      );
      process.exit(1);
    }
    const body = await readJson(res);
    const data = Array.isArray(body?.data) ? body.data : null;
    if (!data) {
      recordResult(
        "FAIL_INCOMPATIBLE",
        "GET /v1/models response did not have a `data` array.",
        { health, modelsBody: body },
      );
      process.exit(1);
    }
    const first = data.find(
      (item) => typeof item?.id === "string" && item.id.trim().length > 0,
    );
    discoveredModel = first?.id?.trim() || "";
  } catch (err) {
    recordResult(
      "FAIL_INCOMPATIBLE",
      `Could not read /v1/models: ${err?.message || "unknown error"}.`,
      { health, error: err?.message || String(err) },
    );
    process.exit(1);
  }

  const model = modelOverride || discoveredModel;
  if (!model) {
    recordResult(
      "FAIL_INCOMPATIBLE",
      "No model id found in /v1/models response. Start llama-server with a model file.",
      { health },
    );
    process.exit(1);
  }

  // 3. non-streaming /v1/chat/completions
  let nonStreaming = null;
  try {
    const res = await fetchWithTimeout(`${endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Say hello in one word." }],
        stream: false,
      }),
    });
    if (!res.ok) {
      recordResult(
        "FAIL_INCOMPATIBLE",
        `Non-streaming chat returned HTTP ${res.status}.`,
        { health, model, nonStreamingStatus: res.status },
      );
      process.exit(1);
    }
    const body = await readJson(res);
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim().length === 0) {
      recordResult(
        "FAIL_INCOMPATIBLE",
        "Non-streaming chat reply had empty content.",
        { health, model, body },
      );
      process.exit(1);
    }
    nonStreaming = { ok: true, sample: text.trim().slice(0, 80) };
  } catch (err) {
    recordResult(
      "FAIL",
      `Non-streaming chat request failed: ${err?.message || "unknown error"}.`,
      { health, model, error: err?.message || String(err) },
    );
    process.exit(1);
  }

  // 4. streaming /v1/chat/completions
  let streaming = null;
  try {
    const res = await fetchWithTimeout(`${endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Say hello in one word." }],
        stream: true,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      recordResult(
        "FAIL_INCOMPATIBLE",
        `Streaming chat returned HTTP ${res.status}.`,
        { health, model, streamingStatus: res.status, nonStreaming },
      );
      process.exit(1);
    }
    const parsed = parseSse(text);
    streaming = parsed;
    if (!parsed.sawDelta && !parsed.sawDone) {
      recordResult(
        "PASS_NO_STREAMING",
        "Non-streaming chat OK; streaming endpoint produced no usable SSE data lines (build may not support streaming).",
        { health, model, nonStreaming, streaming: parsed },
      );
      process.exit(0);
    }
  } catch (err) {
    recordResult(
      "FAIL",
      `Streaming request failed: ${err?.message || "unknown error"}.`,
      { health, model, error: err?.message || String(err), nonStreaming },
    );
    process.exit(1);
  }

  recordResult(
    "PASS",
    "Real llama-server smoke passed: /health + /v1/models + non-streaming + streaming.",
    { health, model, nonStreaming, streaming },
  );
  console.log("\nPROOF written to reports/llama-server-smoke/PROOF.json.");
  process.exit(0);
}

main().catch((err) => {
  recordResult("FAIL", `unexpected error: ${err?.message || String(err)}`, {
    error: err?.message || String(err),
  });
  process.exit(1);
});
