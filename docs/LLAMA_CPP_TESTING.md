# Testing Squidley with llama-server (llama.cpp)

Manual validation guide for the llama.cpp / llama-server integration.

Current release status: the OpenAI-compatible text path is implemented and has
been tested through Ollama's compatible endpoint. A real `llama-server` binary
has not been validated yet, so use this guide before claiming full
llama-server support.

## Prerequisites

- llama.cpp built with `llama-server` binary available
- A GGUF model file (e.g., `llama-3.2-3b-instruct-q4_k_m.gguf`)
- Node.js installed for running Squidley

## 1. Start llama-server

```bash
# Basic start (CPU only)
llama-server -m llama-3.2-3b-instruct-q4_k_m.gguf --port 8080

# With GPU offloading (NVIDIA)
llama-server -m llama-3.2-3b-instruct-q4_k_m.gguf --port 8080 -ngl 99

# With GPU offloading (Apple Silicon)
llama-server -m llama-3.2-3b-instruct-q4_k_m.gguf --port 8080 -ngl 99
```

Server should print: `llama server listening at http://0.0.0.0:8080`

## 2. Verify llama-server is working

The preferred smoke is the repository script. It refuses non-local endpoints,
uses only the configured local endpoint, discovers the first model from
`/v1/models`, and prints clear `PASS`, `PARTIAL`, or `FAIL` rows:

```bash
npm run smoke:llama-server
```

Defaults:

```text
LLAMA_CPP_ENDPOINT=http://127.0.0.1:8080
LLAMA_CPP_MODEL=(optional; discovered from /v1/models when omitted)
```

Use overrides only when needed:

```bash
LLAMA_CPP_ENDPOINT=http://127.0.0.1:8080 LLAMA_CPP_MODEL=your-model-id npm run smoke:llama-server
```

The smoke checks:

- `GET /health`
- `GET /v1/models`
- non-streaming `POST /v1/chat/completions`
- streaming `POST /v1/chat/completions`
- no cloud URL use; the script exits before fetch if the endpoint is not
  localhost, `127.x.x.x`, or `::1`

If every row is `PASS`, the local OpenAI-compatible text server is ready for
the Squidley UI checks below. If any row is `PARTIAL` or `FAIL`, keep the real
`llama-server` validation caveat and copy the output into the release notes or
issue.

Manual curl checks, useful when debugging the script:

```bash
# Health check
curl http://localhost:8080/health
# Expected: {"status":"ok"} or {"slots_idle":1,...,"status":"ok"}

# Model discovery
curl http://localhost:8080/v1/models
# Expected: {"object":"list","data":[{"id":"...","object":"model",...}]}

# Chat completion (non-streaming).
# Replace "test" with the id returned by /v1/models if your build requires it.
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"test","messages":[{"role":"user","content":"Say hello in one word."}],"stream":false}'
# Expected: {"choices":[{"message":{"role":"assistant","content":"Hello!"}}],...}

# Chat completion (streaming).
# Replace "test" with the id returned by /v1/models if your build requires it.
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"test","messages":[{"role":"user","content":"Say hello."}],"stream":true}'
# Expected: data: {"choices":[{"delta":{"content":"Hello"},...}]} lines ending with data: [DONE]
```

## 3. Alternative: Test via Ollama's OpenAI-compatible endpoint

If you don't have llama-server installed, you can validate the OpenAI-compatible
code path using Ollama (which also exposes `/v1/chat/completions`):

```bash
# Ollama also serves OpenAI-compatible API on its default port
curl http://localhost:11434/v1/models
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3.5:0.8b","messages":[{"role":"user","content":"Say hello"}],"stream":false}'
```

Note: Ollama does NOT expose `/health`, so the llama-cpp health probe will
return `ok: false` with "responded with HTTP 404". Chat and models will still
work. This is expected.

## 4. Configure Squidley

Create or update `.env.local`:

```env
SQUIDLEY_LOCAL_BACKEND=llama-cpp
SQUIDLEY_LOCAL_ENDPOINT=http://127.0.0.1:8080
SQUIDLEY_LOCAL_MODEL=the-model-id-from-smoke-output
```

Or leave `SQUIDLEY_LOCAL_BACKEND` unset for auto-detection (probes Ollama first,
then llama-server at the same endpoint).

## 5. Start Squidley

```bash
SQUIDLEY_LOCAL_BACKEND=llama-cpp SQUIDLEY_LOCAL_ENDPOINT=http://127.0.0.1:8080 SQUIDLEY_LOCAL_MODEL=the-model-id-from-smoke-output npm run dev
```

Open http://localhost:3000 in your browser.

## 6. Expected UI behavior

### Settings page (/settings)
- **Backend** row should show "OpenAI-compatible local backend (llama.cpp)"
- **Health** should show "ready" (if /health returns 200; see note above about Ollama)
- **Endpoint** should show your configured endpoint
- **Discovered models** should show 1 (or however many models are loaded)

### Colloquium (/colloquium)
- Health banner should show "OpenAI-compatible local backend configured."
- Model dropdown should show the loaded model
- Chat should work: type a message, get a streamed response
- Streaming meta event includes `backendType: "llama-cpp"`
- Response receipts should show `provider: "local"`, `cloudUsed: false`

### Fabrica (/fabrica)
- Create a small single-file suggestion.
- The suggestion should return from the real `llama-server` endpoint.
- The response/receipt path should remain local: `provider: "local"`,
  `cloudUsed: false`, no tools, and no file writes.

### Tabularium / receipts
- Open Tabularium after Colloquium and Fabrica checks.
- Confirm visible receipts do not contain cloud use.
- Confirm backend metadata shows `backendType: "llama-cpp"` where the UI or
  receipt exposes backend type.

### Colloquium (server unavailable)
- If llama-server is stopped, the health banner should show setup instructions
- Instructions mention both Ollama and llama-server as options
- No cloud fallback is attempted

## 7. Known limitations

- **Vision**: Oculus blocks llama.cpp/llama-server vision in this release.
  It is unsupported until real binary vision validation is completed.
- **Model names**: llama-server model IDs may be file paths. Squidley strips
  paths and `.gguf` extensions for display, but the raw ID is used for API calls.
- **Single model**: llama-server typically serves one model at a time, loaded
  at startup. The model dropdown will show only that model.
- **Auto-detection**: When `SQUIDLEY_LOCAL_BACKEND=auto`, Squidley probes
  Ollama first. If Ollama is running on the same port, it will be detected
  instead of llama-server.
- **Thinking models**: Squidley sends `think: false` in Ollama requests to
  avoid empty replies from models that use extended thinking mode (e.g., qwen3.5).
  This is not needed for llama-server's OpenAI-compatible endpoint.
- **Token counts in streaming**: llama-server may not include `usage` data in
  stream chunks. The `done` event may show no `promptEvalCount`/`evalCount`.
- **Fabrica**: routes through the backend selector for text suggestions.
- **Oculus**: remains Ollama-only for local vision.

## 8. Switching between providers

To switch from llama-server back to Ollama:

```env
# .env.local
SQUIDLEY_LOCAL_BACKEND=ollama
SQUIDLEY_LOCAL_ENDPOINT=http://localhost:11434
SQUIDLEY_LOCAL_MODEL=llama3.2
```

Or remove `SQUIDLEY_LOCAL_BACKEND` entirely for auto-detection.
