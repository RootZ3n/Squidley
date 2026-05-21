# Capability Matrix — Public Squidley

This document is the **truth matrix** for what Public Squidley can and cannot
do locally. Classifications are based on real code paths, not on aspirational
copy. The machine-readable form is
[`docs/capability-matrix.public-squidley.json`](capability-matrix.public-squidley.json)
(schema version 2 — adds per-backend status and proofReferences).

## Legend

- **LOCAL_READY** — Real local execution path exists, has tests, no cloud
  fallback. Must have at least one `proofReferences` entry. Ollama-side
  LOCAL_READY rows include live-gauntlet evidence.
- **LOCAL_PARTIAL** — Local path exists; quality or backend coverage is
  limited. Includes capabilities not yet validated against a real
  `llama-server` binary.
- **LOCAL_BLOCKED** — Local path is reachable but currently disabled.
- **CLOUD_OPTIONAL** — Local works; cloud could improve quality if explicitly
  enabled. Not wired in this release.
- **CLOUD_REQUIRED** — Capability declared cloud-required; no real cloud
  call path is wired. Locked metadata only.
- **NOT_IMPLEMENTED** — Surface exists in registry/metadata but has no
  backing route or execution path.
- **MOCK_DEMO_ONLY** — Static/demo data only.
- **UNKNOWN** — Could not classify without further investigation.

## Per-backend validation status

| Backend | Status |
|---|---|
| Ollama | **VALIDATED** — live gauntlet pass on 2026-05-15 with qwen3.5:0.8b (5 PASS / 1 TRY_VERIFY / 0 NEEDS_CLOUD / 0 BLOCKED). |
| llama-server | **UNVALIDATED_PENDING_REAL_BINARY** — OpenAI-compatible text adapter exercised via unit tests and Ollama's compatible endpoint only. `scripts/smoke-llama-server.mjs` writes `reports/llama-server-smoke/PROOF.json` on a real-binary PASS. Until that file exists, every llama-cpp-side capability is `LOCAL_PARTIAL` even if the Ollama equivalent is `LOCAL_READY`. |

## Headline counts (capability-level classification)

| Classification | Count |
|---|---|
| LOCAL_READY | 9 |
| LOCAL_PARTIAL | 5 |
| LOCAL_BLOCKED | 0 |
| CLOUD_OPTIONAL | 0 |
| CLOUD_REQUIRED (wired) | 0 |
| NOT_IMPLEMENTED | 7 |
| MOCK_DEMO_ONLY | 0 |
| UNKNOWN | 0 |

The `CLOUD_REQUIRED` capabilities in `src/lib/capabilities/registry.ts`
(`fabrica:fabrica.multi-file-build`, `legatus`, `probatio`, `imperium`,
`imaginanium`) are classified here as **NOT_IMPLEMENTED**.
They have no backing route, no fetch path, no execution surface — only
locked metadata used by the UI to show future / cloud-unlock copy. Treating
them as CLOUD_REQUIRED would overstate what the codebase actually does.

The `system:local.gauntlet` capability is **LOCAL_PARTIAL** rather than
LOCAL_READY: the gauntlet runs (mechanically), but the gauntlet result is
a heuristic check of *model* behavior, not a safety guarantee. Velum is
LOCAL_READY because Velum is itself a purely mechanical deterministic
check; the *capability* is the check running, not "safety is solved".

The `system:llama-server.smoke` capability is **LOCAL_PARTIAL** until
`reports/llama-server-smoke/PROOF.json` is produced.

## Capability rows

### LOCAL_READY

| Capability | Route | Ollama | llama-cpp | Proof refs |
|---|---|---|---|---|
| `colloquium:chat.basic` | `/api/chat`, `/api/chat/stream` | LOCAL_READY | LOCAL_PARTIAL | live gauntlet 2026-05-15; handler/stream/egressGuard tests |
| `fabrica:fabrica.single-file-suggestion` | `/api/fabrica/suggest` | LOCAL_READY | LOCAL_PARTIAL | route.test + egressGuard.test |
| `archivum:archivum.local-storage` | (browser) | LOCAL_READY | LOCAL_READY | storage.test, publicReleaseSafety.test |
| `more-input:archivum.local-storage` | (browser) | LOCAL_READY | LOCAL_READY | storage.test |
| `velum:velum.deterministic-review` | (browser) | LOCAL_READY | LOCAL_READY | review.test + heuristicHonesty.test (no overclaim copy) |
| `tabularium:tabularium.local-receipts` | (browser) | LOCAL_READY | LOCAL_READY | receipts.test + publicReleaseSafety.test (no secret leak) |
| `nous:nous.system-map` | (browser) | LOCAL_READY | LOCAL_READY | modelMap.test, localCapabilitySummary.test |
| `system:local.health` | `/api/local/health` | LOCAL_READY | LOCAL_PARTIAL | ollama.test, detection.test, egressGuard.test |
| `system:local.models` | `/api/local/models` | LOCAL_READY | LOCAL_PARTIAL | ollama.test, egressGuard.test |

### LOCAL_PARTIAL

| Capability | Why partial |
|---|---|
| `colloquium:chat.advanced-planning` | Quality depends on local model size; Ratio downgrades. |
| `archivum:archivum.summarize` | Local summary quality bounded by installed model. |
| `more-input:archivum.summarize` | Same as above. |
| `oculus:oculus.local-image-analysis` | Ollama only — llama-cpp explicitly blocked with clear 400. Quality depends on vision model. |
| `system:local.gauntlet` | Heuristic local-model smoke. PASS/TRY_VERIFY/NEEDS_CLOUD/BLOCKED are distinct; TRY_VERIFY downgrades overall recommendation. Not a benchmark or safety proof. |
| `system:llama-server.smoke` | Real-binary smoke not yet executed in this repo (no PROOF.json). |

### NOT_IMPLEMENTED

| Capability | Why |
|---|---|
| `fabrica:fabrica.multi-file-build` | No backing route; registry tier=cloud-required (locked). |
| `archelon:archelon.local-memory` | Registry tier=blocked; no surfaced module page. |
| `legatus:legatus.agent-workflow` | No route, no agent surface, no tool execution path. |
| `probatio:probatio.model-evaluation` | No route. |
| `imperium:imperium.advanced-control` | No route. |
| `imaginanium:imaginanium.cloud-image-generation` | No route. |

## Tool-call locality

Public Squidley **does not ship a tool execution surface**.

- No `tools` / `tool_choice` / `functions` fields are sent on chat calls
  (asserted by `publicReleaseSafety.test.ts`).
- No shell execution, no FS write tools, no web search, no background agent.

| Tool | Locality | Status |
|---|---|---|
| (none in this release) | n/a | n/a |

## Heuristic honesty

Public Squidley uses deterministic heuristics in three places:

- **Velum deterministic review** — regex/heuristic content review in the
  browser. Capability is LOCAL_READY (the check runs); the review is NOT
  a formal safety guarantee.
- **Prompt gateway** — deterministic pre-model gateway that blocks tool-like
  injection patterns. Same posture: runs locally and reliably; not a
  formal defense.
- **Local gauntlet** — heuristic local-model smoke. Capability is
  LOCAL_PARTIAL because the *result* is a model-behavior heuristic, not a
  safety claim. `TRY_VERIFY` and `NEEDS_CLOUD` are NOT treated as PASS;
  only all-PASS produces overall PASS. Asserted by
  `src/lib/heuristicHonesty.test.ts`.

`src/lib/heuristicHonesty.test.ts` scans docs, README, and `src/lib` for a
list of absolute-safety overclaim phrases (the canonical list lives in the
test source) and fails the build if any occurs outside a disclaiming context.
The diagnostic enforces a tighter subset of the same list as a hard release
gate.

## Cloud-blocking summary

| Question | Answer |
|---|---|
| Can cloud be called in default mode? | No — no fetch path to any cloud URL. |
| Can cloud be called when env vars exist but consent is absent? | No — verified by `publicReleaseSafety.test.ts` and `egressGuard.test.ts`. |
| Can local failure silently fall back to cloud? | No — local failure returns a beginner-friendly error and stops. |
| Can unknown capability silently call cloud? | No — `resolveCapabilityRuntime` throws on unknown id; no executor wired. |
| Can UI prefetch or health checks call cloud? | No — `/api/local/health` and `/api/local/models` only contact `config.endpoint`, which `isAllowedLocalEndpoint` constrains to local hosts. |
| Can an OpenAI-compatible remote URL be used in local-only mode? | No — `isAllowedLocalEndpoint` rejects `https://` and public hosts; bad config falls back to the local default. |
| Are all cloud-capable routes consent-gated? | There are no cloud-capable routes. `cloudUnlocked` is hardcoded `false` in every production caller; `canUseCloud` therefore can never be true. |
