#!/usr/bin/env node

const DEFAULT_ENDPOINT = "http://127.0.0.1:8080";
const DEFAULT_PROMPT = "Say hello in one word.";
const REQUEST_TIMEOUT_MS = 20_000;

const endpoint = normalizeEndpoint(
  process.env.LLAMA_CPP_ENDPOINT ||
    process.env.SQUIDLEY_LOCAL_ENDPOINT ||
    DEFAULT_ENDPOINT,
);
const modelOverride = (process.env.LLAMA_CPP_MODEL || process.env.SQUIDLEY_LOCAL_MODEL || "").trim();

const results = [];

function normalizeEndpoint(value) {
  const trimmed = String(value || "").trim();
  return (trimmed || DEFAULT_ENDPOINT).replace(/\/+$/, "");
}

function isLocalEndpoint(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]" ||
      host.startsWith("127.")
    );
  } catch {
    return false;
  }
}

function mark(status, label, detail) {
  results.push({ status, label, detail });
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`${status} ${label}${suffix}`);
}

function fail(label, detail) {
  mark("FAIL", label, detail);
}

function partial(label, detail) {
  mark("PARTIAL", label, detail);
}

function pass(label, detail) {
  mark("PASS", label, detail);
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
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response was not JSON: ${text.slice(0, 160)}`);
  }
}

function extractModelId(modelsBody) {
  const data = Array.isArray(modelsBody?.data) ? modelsBody.data : [];
  const first = data.find((item) => typeof item?.id === "string" && item.id.trim().length > 0);
  return first?.id.trim() || "";
}

function extractAssistantText(body) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : undefined;
  const content = choice?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part?.text === "string" ? part.text : "")
      .join("")
      .trim();
  }
  return "";
}

function parseSseContent(text) {
  let sawDone = false;
  let sawDelta = false;
  let assistantText = "";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    const data = line.slice("data:".length).trim();
    if (data === "[DONE]") {
      sawDone = true;
      continue;
    }
    if (!data) continue;
    try {
      const chunk = JSON.parse(data);
      const choice = Array.isArray(chunk?.choices) ? chunk.choices[0] : undefined;
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        sawDelta = true;
        assistantText += delta;
      }
    } catch {
      // Ignore non-JSON SSE comments or server-specific keepalive lines.
    }
  }

  return { sawDone, sawDelta, assistantText: assistantText.trim() };
}

async function checkHealth() {
  const url = `${endpoint}/health`;
  try {
    const response = await fetchWithTimeout(url);
    const body = await readJson(response).catch((error) => ({ parseError: error.message }));
    if (!response.ok) {
      partial("GET /health", `HTTP ${response.status}. Some llama-server builds report loading here; check the server log.`);
      return false;
    }
    const status = typeof body?.status === "string" ? body.status : "ok";
    pass("GET /health", `server responded with status ${status}`);
    return true;
  } catch (error) {
    fail("GET /health", `Could not reach ${url}. Start llama-server first: llama-server -m your-model.gguf --port 8080`);
    if (error?.name === "AbortError") partial("GET /health timeout", `No response within ${REQUEST_TIMEOUT_MS / 1000}s.`);
    return false;
  }
}

async function checkModels() {
  const url = `${endpoint}/v1/models`;
  try {
    const response = await fetchWithTimeout(url);
    const body = await readJson(response);
    if (!response.ok) {
      fail("GET /v1/models", `HTTP ${response.status}. llama-server must expose the OpenAI-compatible models endpoint.`);
      return "";
    }
    const discoveredModel = extractModelId(body);
    const model = modelOverride || discoveredModel;
    if (!model) {
      fail("GET /v1/models", "No model id found. Start llama-server with a GGUF model file.");
      return "";
    }
    const count = Array.isArray(body?.data) ? body.data.length : 0;
    pass("GET /v1/models", modelOverride ? `using LLAMA_CPP_MODEL=${modelOverride}; ${count} model(s) reported` : `using discovered model ${model}`);
    return model;
  } catch (error) {
    fail("GET /v1/models", `Could not read ${url}: ${error?.message || "unknown error"}`);
    return "";
  }
}

async function checkNonStreaming(model) {
  const url = `${endpoint}/v1/chat/completions`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: DEFAULT_PROMPT }],
        stream: false,
      }),
    });
    const body = await readJson(response);
    if (!response.ok) {
      fail("POST /v1/chat/completions non-streaming", `HTTP ${response.status}. Check that model "${model}" is loaded.`);
      return false;
    }
    const text = extractAssistantText(body);
    if (!text) {
      partial("POST /v1/chat/completions non-streaming", "Server responded, but no assistant text was found.");
      return false;
    }
    pass("POST /v1/chat/completions non-streaming", `assistant replied: ${JSON.stringify(text.slice(0, 80))}`);
    return true;
  } catch (error) {
    fail("POST /v1/chat/completions non-streaming", `Request failed: ${error?.message || "unknown error"}`);
    return false;
  }
}

async function checkStreaming(model) {
  const url = `${endpoint}/v1/chat/completions`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: DEFAULT_PROMPT }],
        stream: true,
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      fail("POST /v1/chat/completions streaming", `HTTP ${response.status}. Check llama-server streaming support.`);
      return false;
    }
    const parsed = parseSseContent(text);
    if (!parsed.sawDelta && !parsed.sawDone) {
      fail("POST /v1/chat/completions streaming", "No OpenAI-style SSE data lines were found.");
      return false;
    }
    if (!parsed.sawDone) {
      partial("POST /v1/chat/completions streaming", "Saw streamed data, but did not see data: [DONE].");
      return true;
    }
    pass("POST /v1/chat/completions streaming", parsed.assistantText ? `streamed reply: ${JSON.stringify(parsed.assistantText.slice(0, 80))}` : "saw SSE data and data: [DONE]");
    return true;
  } catch (error) {
    fail("POST /v1/chat/completions streaming", `Request failed: ${error?.message || "unknown error"}`);
    return false;
  }
}

function printSummary() {
  const failed = results.filter((item) => item.status === "FAIL").length;
  const partials = results.filter((item) => item.status === "PARTIAL").length;
  console.log("");
  if (failed > 0) {
    console.log(`FAIL llama-server smoke did not pass (${failed} failed, ${partials} partial). No cloud calls were made.`);
    process.exitCode = 1;
    return;
  }
  if (partials > 0) {
    console.log(`PARTIAL llama-server smoke completed with ${partials} caveat(s). No cloud calls were made.`);
    process.exitCode = 2;
    return;
  }
  console.log("PASS llama-server local OpenAI-compatible text smoke passed. No cloud calls were made.");
}

async function main() {
  console.log("Squidley llama-server local smoke");
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Model: ${modelOverride || "(discover from /v1/models)"}`);
  console.log("Network scope: configured local endpoint only. No cloud URLs are used.");
  console.log("");

  if (!isLocalEndpoint(endpoint)) {
    fail("Endpoint safety check", `Refusing to contact non-local endpoint: ${endpoint}. Use localhost, 127.x.x.x, or ::1.`);
    printSummary();
    return;
  }
  pass("Endpoint safety check", "endpoint is local-only");

  await checkHealth();
  const model = await checkModels();
  if (model) {
    await checkNonStreaming(model);
    await checkStreaming(model);
  } else {
    partial("Chat checks skipped", "No model id was available from /v1/models and LLAMA_CPP_MODEL was not set.");
  }
  printSummary();
}

main().catch((error) => {
  fail("Unexpected script error", error?.message || "unknown error");
  printSummary();
});
