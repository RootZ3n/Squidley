# Public Local Release Checklist

Release honesty pass dated 2026-05-11.

Use this checklist before publishing or demoing Squidley Public as a local-model
release.

## Validated Local Features

- [x] Ollama local health and model discovery.
- [x] Ollama Colloquium non-streaming chat.
- [x] Ollama Colloquium streaming chat.
- [x] Ollama Fabrica single-file suggestions.
- [x] Ollama Oculus vision route with likely vision model names.
- [x] Prompt Gateway remains deterministic and local.
- [x] Velum, Archivum, Tabularium, Nous, Settings, and module gallery stay
  browser-local where no model is needed.
- [x] Responses and receipts report `provider: "local"` and `cloudUsed: false`.
- [x] Embedding-only models are excluded from chat/generation selections.
- [x] `backendType` is preserved in local backend metadata and stream events.

## Partially Validated Features

- [x] llama.cpp/OpenAI-compatible text chat path is implemented.
- [x] llama.cpp/OpenAI-compatible streaming text path is implemented.
- [x] Fabrica routes through the backend selector for text suggestions.
- [x] OpenAI-compatible text path was validated through Ollama's `/v1` endpoint.
- [ ] Real `llama-server` binary validation completed on a machine with
  `llama-server` installed.

## Blocked Or Unsupported Features

- [x] Oculus with llama.cpp/llama-server vision is blocked.
- [x] Cloud fallback is absent.
- [x] Cloud providers remain locked metadata only.
- [x] Shell/tool execution is absent.
- [x] Multi-file Fabrica builds remain blocked in public local mode.

## Required Manual Tests

- [ ] Run a real `llama-server` binary with a GGUF text model.
- [ ] Run `npm run smoke:llama-server` against that server.
- [ ] Confirm the smoke script's endpoint safety check passes for a local
  endpoint only.
- [ ] Confirm smoke output shows `PASS` for `GET /health`, `GET /v1/models`,
  non-streaming chat, and streaming chat. If any row says `PARTIAL`, document
  the exact output and keep the release caveat.
- [ ] Configure Squidley with `SQUIDLEY_LOCAL_BACKEND=llama-cpp` and confirm
  Colloquium chat works.
- [ ] Confirm Fabrica single-file suggestions work through real `llama-server`.
- [ ] Confirm Colloquium/Fabrica receipts say `provider: "local"`,
  `cloudUsed: false`, and `backendType: "llama-cpp"` where backend metadata is
  shown.
- [ ] Confirm Settings labels the backend as OpenAI-compatible local backend,
  not fully validated llama-server support.
- [ ] Confirm Oculus refuses llama.cpp/llama-server vision with a clear message.
- [ ] Confirm no request is made to a cloud host during all tests.

## Local Smoke Commands

Ollama end-to-end smoke:

```bash
ollama serve
ollama pull llama3.2
SQUIDLEY_LOCAL_BACKEND=ollama SQUIDLEY_LOCAL_ENDPOINT=http://localhost:11434 SQUIDLEY_LOCAL_MODEL=llama3.2 npm run dev
```

Ollama API checks:

```bash
curl -sS http://localhost:11434/api/tags
curl -sS http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2","messages":[{"role":"user","content":"Say hello in one word."}],"stream":false,"think":false}'
```

OpenAI-compatible text path through Ollama:

```bash
curl -sS http://localhost:11434/v1/models
curl -sS http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2","messages":[{"role":"user","content":"Say hello in one word."}],"stream":false}'
```

Real `llama-server` manual smoke:

```bash
llama-server -m your-model.gguf --port 8080
npm run smoke:llama-server
SQUIDLEY_LOCAL_BACKEND=llama-cpp SQUIDLEY_LOCAL_ENDPOINT=http://127.0.0.1:8080 npm run dev
```

If your server uses a different endpoint or needs an explicit model id:

```bash
LLAMA_CPP_ENDPOINT=http://127.0.0.1:8080 LLAMA_CPP_MODEL=your-model-id npm run smoke:llama-server
SQUIDLEY_LOCAL_BACKEND=llama-cpp SQUIDLEY_LOCAL_ENDPOINT=http://127.0.0.1:8080 SQUIDLEY_LOCAL_MODEL=your-model-id npm run dev
```

Repository verification:

```bash
npm test
npm run typecheck
```

Targeted regression smoke:

```bash
npx vitest run src/lib/publicReleaseSafety.test.ts src/lib/providers/registry.test.ts src/app/api/oculus/analyze/route-backend.test.ts src/app/api/fabrica/suggest/route-backend.test.ts
```

## Claims Allowed

- [x] Ollama is validated end-to-end for local chat and local module use.
- [x] Colloquium streams from a configured local model server with no cloud
  fallback.
- [x] Fabrica is a backend-aware single-file local suggestion tool.
- [x] llama.cpp/OpenAI-compatible local text backend support is implemented.
- [x] The OpenAI-compatible text path has been validated through Ollama's `/v1`
  endpoint.
- [x] Oculus local vision is Ollama-only in this release.
- [x] Public Squidley does not use cloud providers without explicit consent.
- [x] Public local release currently makes no cloud calls.
- [x] Embedding-only models are excluded from chat/generation.

## Claims Not Allowed Yet

- [ ] Full `llama-server` support is validated.
- [ ] Real `llama-server` binary has been tested end-to-end.
- [ ] llama.cpp/llama-server vision works in Oculus.
- [ ] Cloud fallback exists.
- [ ] Squidley can use cloud providers without an explicit consent flow.
- [ ] Fabrica is an autonomous coding agent or can edit repositories.

## Pass/Fail Signoff

- [ ] Ollama smoke passed.
- [ ] OpenAI-compatible text smoke passed.
- [ ] Real `llama-server` smoke passed.
- [ ] Colloquium works with `SQUIDLEY_LOCAL_BACKEND=llama-cpp`.
- [ ] Fabrica works with `SQUIDLEY_LOCAL_BACKEND=llama-cpp`.
- [ ] Receipts/backend metadata show local, `cloudUsed: false`, and
  `backendType: "llama-cpp"` where applicable.
- [ ] Oculus llama.cpp unsupported state passed.
- [ ] No-cloud network observation passed.
- [ ] Unit tests passed.
- [ ] Typecheck passed.
- [ ] Release copy contains no full llama-server validation claim.
