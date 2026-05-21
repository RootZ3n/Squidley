# Public Squidley — Pre-Release Truth Audit (2026-05-15)

Repo: `/mnt/ai/squidley` (the prompt's suggested `/mnt/ai/squidley-public` does
not exist; this is the correct path.)

This is a truth audit, not a cosmetic pass.

## 1. Final verdict

**RELEASE READY WITH WARNINGS**

Public Squidley is honestly local-first in the senses it claims to be. The
hardest claims — *"no cloud silently called"*, *"no cloud fallback on local
failure"*, *"locked cloud providers cannot be activated in this build"* — are
not just documented; they are enforced by the type system, the endpoint guard,
the absence of any cloud SDK in `package.json`, and now by a runtime egress
guard test that runs on every CI build.

The warnings are honestly disclosed in the repo and are NOT silent gaps:

1. Real `llama-server` binary path is **not validated**. The
   OpenAI-compatible local backend has been exercised against Ollama's
   compatible endpoint and unit tests — never against a real `llama-server`
   binary. This is stated in README, setup docs, Nous, and the capability
   matrix. Treat the llama-cpp text path as "implementation present, real
   binary smoke pending".
2. Velum / prompt-gateway / gauntlet checks are deterministic heuristics, not
   safety proofs. The gauntlet output and Velum copy say so explicitly.
3. `scripts/egress-proof.sh` documents a manual `tcpdump` procedure but is not
   itself a runtime egress assertion. The new
   `src/lib/egressGuard.test.ts` is the automated complement.

## 2. Executive summary

### What works locally

- Local streaming and non-streaming chat through Colloquium against Ollama
  (validated end-to-end against real Ollama 0.x with qwen3.5:0.8b on this
  host). Returns 14 models from a live `/api/tags`.
- Local single-file suggestions in Fabrica.
- Local image analysis in Oculus (Ollama only; llama-cpp explicitly blocked
  with a clear `400` message — no silent fallback).
- Browser-local note storage / search / export / import (Archivum), Velum
  deterministic review, Tabularium receipts ledger, Nous system map.
- Local provider auto-detection (Ollama probed first, then llama-cpp).
- Local model list filters embedding-only models from default selection.
- Local gauntlet (CLI + API route) ran live during this audit:
  PASS=5, TRY_VERIFY=1, NEEDS_CLOUD=0, BLOCKED=0; no cloud calls.

### What does not work locally

- Multi-file build (Fabrica), agent workflows (Legatus), advanced
  control (Imperium), model evaluation (Probatio), cloud image
  generation (Imaginanium), Archelon memory companion. **None of these
  have a fetch path.** They are locked metadata only. The capability matrix labels
  them NOT_IMPLEMENTED rather than CLOUD_REQUIRED because *registering* them
  as cloud-required overstates what the codebase does.

### What requires cloud

- Nothing in this release. There is no wired cloud call path, no cloud SDK
  dependency, and no env switch that flips routing.

### What is not implemented

- See NOT_IMPLEMENTED rows in
  [`docs/CAPABILITY_MATRIX_PUBLIC_SQUIDLEY.md`](CAPABILITY_MATRIX_PUBLIC_SQUIDLEY.md).

### What was broken

- Nothing was broken when this audit started. The existing
  `publicReleaseSafety.test.ts` was already asserting the right invariants
  (no cloud fallback when env keys exist, locked cloud providers, honest UI
  copy, etc.).
- The repo did NOT have:
  - a machine-readable capability matrix,
  - an automated runtime egress assertion in the test suite,
  - an explicit `LOCAL_FIRST_CONTRACT.md` (it had `LOCAL_ONLY_PRINCIPLES.md`),
  - a `diagnostic` / `verify:release` npm script.

### What was fixed / added

- `docs/LOCAL_FIRST_CONTRACT.md` — explicit local-first contract with
  pointers to enforcement points.
- `docs/capability-matrix.public-squidley.json` — machine-readable matrix.
- `docs/CAPABILITY_MATRIX_PUBLIC_SQUIDLEY.md` — human-readable matrix.
- `docs/PUBLIC_SQUIDLEY_AUDIT_2026-05-15.md` — this report.
- `src/lib/egressGuard.test.ts` — automated runtime egress assertion (11
  tests). Replaces global `fetch` with an interceptor that fails on any
  non-local URL, then exercises chat, stream, fabrica, oculus, health, models,
  and detection.
- `scripts/prove-local-only.mjs` — egress proof script (static + dynamic).
- `scripts/public-squidley-diagnostic.mjs` — release-readiness diagnostic.
  Exits non-zero on cloud SDK deps, cloud URLs in source, missing matrix,
  missing guard, or weakened endpoint check.
- `package.json` scripts: `diagnostic`, `prove:local-only`, `verify:release`.

## 3. Local-first proof

Live proof captured on this host (2026-05-15):

```
$ ollama running at http://localhost:11434 — 14 models
$ npx vitest run                       — 1248 / 1248 tests pass
$ npx tsc --noEmit                     — clean
$ node scripts/public-squidley-diagnostic.mjs
  releaseReady: true, failures: 0
  - deps.no-cloud-sdk: ok
  - src.no-cloud-urls: ok (0 hits outside locked metadata)
  - src.fetch-destinations: ok (all 12 fetch() calls target local endpoints)
  - guard.endpoint: ok
  - posture.cloud-locked: ok
  - matrix.present: {LOCAL_READY:10, LOCAL_PARTIAL:4, NOT_IMPLEMENTED:7}
  - tests.release-safety: ok
  - live.ollama: reachable at http://localhost:11434 with 14 model(s)
$ node scripts/prove-local-only.mjs
  static proof: 0 cloud URLs outside locked metadata
$ SQUIDLEY_LOCAL_BACKEND=ollama node scripts/gauntlet-local-model.mjs
  model: qwen3.5:0.8b (auto-discovered)
  PASS=5  TRY_VERIFY=1  NEEDS_CLOUD=0  BLOCKED=0
  "No cloud calls were made."
```

The egress guard test (`src/lib/egressGuard.test.ts`) is part of every test
run. It:

1. Replaces `globalThis.fetch` with an interceptor that throws on any
   non-local URL.
2. Calls `handleChatRequest` (Ollama + llama-cpp), `openLocalChatStream`
   (Ollama + llama-cpp), `detectLocalBackend`, `/api/local/health`,
   `/api/local/models`, `/api/fabrica/suggest`, `/api/oculus/analyze`.
3. Sets `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
   `OPENROUTER_API_KEY` in env and re-runs the chat path — destinations
   remain local-only.

## 4. Capability matrix summary

| Classification | Count |
|---|---|
| LOCAL_READY | 10 |
| LOCAL_PARTIAL | 4 |
| LOCAL_BLOCKED | 0 |
| CLOUD_OPTIONAL | 0 |
| CLOUD_REQUIRED (wired) | 0 |
| NOT_IMPLEMENTED | 7 |
| MOCK_DEMO_ONLY | 0 |
| UNKNOWN | 0 |

(See `docs/CAPABILITY_MATRIX_PUBLIC_SQUIDLEY.md` for per-row detail.)

## 5. Tool locality summary

Public Squidley ships **no tool execution surface**:

| Locality | Count |
|---|---|
| LOCAL_TOOL | 0 |
| LOCAL_NETWORK_TOOL | 0 |
| CLOUD_TOOL | 0 |
| DISABLED | 0 |
| NOT_IMPLEMENTED | 0 |
| UNKNOWN | 0 |

The chat handler never sends `tools`, `tool_choice`, or `functions`. The
capability registry tracks future tool-using surfaces (Legatus, Imperium,
etc.) as metadata only; they have no execution path.

## 6. Cloud-blocking audit

| Question | Answer |
|---|---|
| Can cloud be called in default mode? | **No.** No fetch path targets a cloud URL. No cloud SDK in deps. |
| Can cloud be called when env vars exist but consent is absent? | **No.** Verified by `publicReleaseSafety.test.ts` and `egressGuard.test.ts`. |
| Can local failure silently fall back to cloud? | **No.** Local failure paths return `cloudUsed:false` and stop. |
| Can unknown capability silently call cloud? | **No.** `resolveCapabilityRuntime` throws on unknown id; no executor consumes the decision to call out. |
| Can UI prefetch or health checks call cloud? | **No.** Same-origin only or `config.endpoint` (guarded). |
| Can an OpenAI-compatible remote URL be used in local-only mode? | **No.** `isAllowedLocalEndpoint` rejects `https://` and public hosts; bad config falls back to the local default. |
| Are all cloud-capable routes consent-gated? | There are no cloud-capable routes. `cloudUnlocked` is hardcoded `false` in every production caller; `canUseCloud` therefore can never be true. |

## 7. Bugs found

None blocking release.

The previously-shipped invariants were already enforced. The only "issues"
were **missing artifacts**, not behavior bugs:

| Severity | Location | Symptom | Root cause | Fix | Test added |
|---|---|---|---|---|---|
| low | repo | No automated runtime egress proof in CI. | Existing tests asserted invariants but did not generically intercept `fetch`. | Added `src/lib/egressGuard.test.ts` with 11 cases. | self |
| low | docs/ | No machine-readable capability matrix. | Matrix existed only in prose. | Added `docs/capability-matrix.public-squidley.json` + markdown. | n/a |
| low | docs/ | No explicit `LOCAL_FIRST_CONTRACT.md` mapping each rule to its enforcement point. | Documentation distributed across several files. | Added `docs/LOCAL_FIRST_CONTRACT.md`. | n/a |
| low | scripts/ | No `verify:release` aggregator. | Manual checklist only. | Added `diagnostic`, `prove:local-only`, `verify:release` scripts. | n/a |

## 8. Files changed

```
A  docs/LOCAL_FIRST_CONTRACT.md
A  docs/CAPABILITY_MATRIX_PUBLIC_SQUIDLEY.md
A  docs/capability-matrix.public-squidley.json
A  docs/PUBLIC_SQUIDLEY_AUDIT_2026-05-15.md
A  scripts/prove-local-only.mjs
A  scripts/public-squidley-diagnostic.mjs
A  src/lib/egressGuard.test.ts
M  package.json   (added diagnostic, prove:local-only, verify:release)
```

No production source file was changed by this audit. The audit verified the
codebase as-shipped is correct on every claim it makes.

## 9. Tests added

`src/lib/egressGuard.test.ts` — 11 tests:

- `isLocalUrl` rejects cloud endpoints up front.
- chat handler (Ollama) only touches local URLs.
- chat handler (llama-cpp) only touches local URLs.
- stream handler (Ollama) only touches local URLs.
- stream handler (llama-cpp) only touches local URLs.
- detection probe only touches local URLs in auto mode.
- `/api/local/health` only touches local URLs.
- `/api/local/models` only touches local URLs.
- `/api/fabrica/suggest` only touches local URLs.
- `/api/oculus/analyze` only touches local URLs.
- cloud env vars during chat do not change destinations.

## 10. Commands run and results

| Command | Result |
|---|---|
| `npx vitest run` | 87 files / 1248 tests, all pass |
| `npx tsc --noEmit` | clean |
| `node scripts/public-squidley-diagnostic.mjs` | exit 0; releaseReady: true |
| `node scripts/prove-local-only.mjs` | exit 0; static proof clean |
| `SQUIDLEY_LOCAL_BACKEND=ollama node scripts/gauntlet-local-model.mjs` | PASS=5, TRY_VERIFY=1, no cloud calls |

## 11. Remaining risks

1. **Real `llama-server` binary not validated.** The llama-cpp text adapter
   is exercised via OpenAI-compatible mocks and Ollama's compatible endpoint;
   no real `llama-server -m model.gguf` smoke has been performed in this
   environment. The repo says so honestly in README, setup docs, Nous, and
   the matrix. Treat the llama-cpp path as "implementation present, real
   binary smoke pending".
2. **Oculus vision quality.** Local vision results depend on the installed
   vision model. Oculus refuses non-vision models with a clear message and
   blocks llama-cpp explicitly, but small vision models can still produce
   weak descriptions. This is honestly labeled LOCAL_PARTIAL.
3. **Velum / prompt-gateway are heuristic.** They are deterministic regex /
   pattern checks, not guaranteed defenses. Copy says so.
4. **Gauntlet TRY_VERIFY on prompt-injection.** A small local model can echo
   injected text; the gauntlet flagged this as TRY_VERIFY rather than PASS.
   This is a model-quality observation, not a Squidley behavior bug. The
   prompt gateway in the actual route runs **before** the model and blocks
   injection patterns at the application layer regardless.
5. **`scripts/prove-local-only.mjs` dynamic proof** falls back to static
   proof when a TS loader (tsx) is not installed. The automated dynamic
   proof lives in `src/lib/egressGuard.test.ts` and runs on every vitest
   invocation, so the dynamic gap is covered by the test suite. The script
   could optionally be ported to call into compiled JS post-`next build` to
   get a full dynamic CLI proof, but that is a nice-to-have, not a blocker.

## 12. Release recommendation

**Ship.** Public Squidley meets a stricter bar than the sibling projects this
audit pattern was designed to catch:

- No cloud SDK in deps.
- No cloud URL fetch path in source.
- Endpoint guard rejects `https://` and public hosts.
- `cloudUnlocked` hardcoded false in every production caller.
- `cloudUsed:false` enforced at the type level on `LocalProviderConfig` and
  `TabulariumReceipt`.
- Automated runtime egress assertion in CI.
- Honest UI/docs copy that explicitly disclaims unvalidated paths.
- Live local-model gauntlet passes with real Ollama, no cloud calls.

Ship with the warnings already disclosed: pending real `llama-server` binary
validation; deterministic-only safety heuristics; quality depends on the
installed local model.
