# Peh Public Local Readiness Handoff

Status date: 2026-05-11.

Use this as the quick continuation note for a future Codex, Claude, or new chat
before publishing or demoing Peh Public as a local-model release.

## Current Validated Status

- Ollama is validated end-to-end for local health, model discovery,
  Colloquium chat, Colloquium streaming, Fabrica single-file suggestions, and
  Oculus vision with likely vision model names.
- The llama.cpp/OpenAI-compatible text path is implemented for local chat,
  streaming, model discovery, health probing, and Fabrica suggestions.
- The OpenAI-compatible text path was validated through Ollama's `/v1`
  compatibility endpoint.
- A real `llama-server` binary has not been validated yet.
- Oculus is honestly Ollama-only for local vision in this release.
- Local model gauntlet reports exist as narrow local smoke evidence only. They
  are not benchmarks and do not prove safety.
- Public local paths currently make no cloud calls and report `cloudUsed: false`.
- Cloud provider metadata exists, but cloud providers are locked and require a
  future explicit consent/review flow before any use.

## What Changed In Local-Model Work

- Added backend selection for `ollama`, `llama-cpp`, and `auto`.
- Added llama.cpp/OpenAI-compatible helpers for `/health`, `/v1/models`, and
  `/v1/chat/completions`.
- Preserved `backendType` in local health/model metadata and chat stream events.
- Routed Colloquium and Fabrica through the selected local backend.
- Kept Oculus blocked for llama.cpp/llama-server vision with a clear error.
- Excluded embedding-only models from chat/generation readiness.
- Added `scripts/smoke-llama-server-local.mjs` and npm script
  `smoke:llama-server`.
- Added `scripts/gauntlet-local-model.mjs` and npm script
  `gauntlet:local-model`.
- Added local gauntlet report indexing plus `/api/local/gauntlet`.
- Added a small Settings panel for local gauntlet summaries with the warning:
  "Narrow local smoke only, not a benchmark or proof of safety."

## Allowed Release Claims

- Ollama is validated end-to-end for the public local release.
- Colloquium streams from a configured local model server with no cloud
  fallback.
- Fabrica is a backend-aware single-file local suggestion tool.
- llama.cpp/OpenAI-compatible local text backend support is implemented.
- The OpenAI-compatible text path has been validated through Ollama's `/v1`
  endpoint.
- Real `llama-server` binary validation is still pending.
- Oculus local vision is Ollama-only in this release.
- Oculus blocks llama.cpp/llama-server vision in this release.
- Public Peh does not use cloud providers without explicit consent.
- Public local release currently makes no cloud calls.
- Embedding-only models are excluded from chat/generation.
- Local model gauntlet PASS means only that a model passed a narrow local smoke
  prompt once.

## Prohibited Claims

- Full `llama-server` support is validated.
- A real `llama-server` binary has been tested end-to-end.
- llama.cpp/llama-server vision works in Oculus.
- Gauntlet PASS proves model safety, intelligence, or general reliability.
- Small models are generally reliable.
- Cloud fallback exists automatically.
- Peh can use cloud providers without an explicit consent/review flow.
- Fabrica is an autonomous coding agent.
- Fabrica can edit repositories, write files, use shell commands, or run tools
  in public local mode.

## Commands To Run Before Release

Repository verification:

```bash
npm test
npm run typecheck
```

Ollama local smoke:

```bash
ollama serve
ollama pull llama3.2
PEH_LOCAL_BACKEND=ollama PEH_LOCAL_ENDPOINT=http://localhost:11434 PEH_LOCAL_MODEL=llama3.2 npm run dev
```

Real `llama-server` validation, when a GGUF model and binary are available:

```bash
llama-server -m your-model.gguf --port 8080
npm run smoke:llama-server
PEH_LOCAL_BACKEND=llama-cpp PEH_LOCAL_ENDPOINT=http://127.0.0.1:8080 npm run dev
```

If the server requires a specific model id:

```bash
LLAMA_CPP_ENDPOINT=http://127.0.0.1:8080 LLAMA_CPP_MODEL=your-model-id npm run smoke:llama-server
PEH_LOCAL_BACKEND=llama-cpp PEH_LOCAL_ENDPOINT=http://127.0.0.1:8080 PEH_LOCAL_MODEL=your-model-id npm run dev
```

Optional local-model gauntlet:

```bash
GAUNTLET_BACKEND=ollama GAUNTLET_ENDPOINT=http://127.0.0.1:11434 GAUNTLET_MODEL=llama3.2 npm run gauntlet:local-model
GAUNTLET_BACKEND=openai-compatible GAUNTLET_ENDPOINT=http://127.0.0.1:8080 npm run gauntlet:local-model
```

Targeted release-safety tests:

```bash
npx vitest run src/lib/publicReleaseSafety.test.ts src/lib/providers/registry.test.ts src/app/api/oculus/analyze/route-backend.test.ts src/app/api/fabrica/suggest/route-backend.test.ts src/app/api/local/gauntlet/route.test.ts src/lib/localGauntlet/reports.test.ts
```

## Remaining Caveats

- Real `llama-server` binary validation remains the main release caveat.
- llama.cpp/llama-server vision is blocked and unsupported.
- Small-model capability evidence is limited. Treat local gauntlet reports as
  smoke evidence, not benchmarks.
- No live packet-capture audit has been recorded in this handoff.
- Windows/WSL and fresh-machine packaging checks still need separate signoff if
  they are part of the release target.

## Next Steps In Priority Order

1. Run real `llama-server` with a GGUF text model.
2. Run `npm run smoke:llama-server` and save the exact output.
3. Run Peh with `PEH_LOCAL_BACKEND=llama-cpp` against that server.
4. Verify Colloquium streaming, Fabrica single-file suggestions, and
   Tabularium/Settings metadata show `provider: "local"`, `cloudUsed: false`,
   and `backendType: "llama-cpp"` where exposed.
5. Verify Oculus refuses llama.cpp/llama-server vision before any model call.
6. Run `npm test` and `npm run typecheck`.
7. Update release notes and the checklist only after the real-machine results
   are recorded.

## Key References

- [Public local release checklist](PUBLIC_LOCAL_RELEASE_CHECKLIST.md)
- [Local model capability matrix](LOCAL_MODEL_CAPABILITY_MATRIX.md)
- [llama.cpp / llama-server testing guide](LLAMA_CPP_TESTING.md)
- [Local model setup](LOCAL_MODEL_SETUP.md)
- [Local chat contract](LOCAL_CHAT.md)
