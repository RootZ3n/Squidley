# Local-Only Testing

How to verify Peh's local-only behavior end to end.

## TL;DR — the one command

```bash
npm run verify:release
```

This is the release gate. It runs:

1. `npm run typecheck` — TypeScript clean.
2. `npm run test` — full vitest suite (includes egress-guard, heuristic-honesty,
   smoke-llama-server contract tests).
3. `npm run diagnostic` — static release-readiness audit.
4. `npm run prove:local-only` — static + dynamic egress proof.
5. `npm run gauntlet:local-model` — live local-model smoke against Ollama
   (or the configured local backend).

If any of these fail, the release is not ready.

## The individual pieces

### 1. `npm test`

Includes the test files that enforce local-only behavior on every run:

- `src/lib/publicReleaseSafety.test.ts` — original release-safety contract:
  cloud env keys do not change routing; cloud providers locked by default;
  no tool fields sent on chat; receipts redact secrets; docs do not drift.
- `src/lib/egressGuard.test.ts` — runtime egress guard. Replaces global
  `fetch` with an interceptor that throws on any non-local URL, then
  exercises chat, stream, fabrica, oculus, health, models, detection.
- `src/lib/heuristicHonesty.test.ts` — fails the build if docs or `src/lib`
  contain unqualified safety/proof overclaims outside a disclaiming context.
- `src/lib/smokeLlamaServer.test.ts` — contract test for the llama-server
  smoke script: remote URL rejected, unreachable-local SKIPs (not PASSes),
  PROOF.json is the gating marker.

### 2. `npm run diagnostic`

Reads the repo without running it. Fails if:

- A cloud SDK is in `package.json`.
- A cloud URL appears in source outside locked-metadata files.
- The endpoint guard is missing or weakened.
- The cloud-locked posture is missing.
- The capability matrix is missing or has a LOCAL_READY row without
  `proofReferences`.
- A row declares `backendStatus.llamaCpp === "LOCAL_READY"` without a
  `reports/llama-server-smoke/PROOF.json`.
- Docs contain absolute-safety overclaim phrases (the canonical list lives
  in `src/lib/heuristicHonesty.test.ts`).

### 3. `npm run prove:local-only`

Two layers:

- **Static**: greps `src/` for cloud URLs outside `src/lib/providers/registry.ts`,
  `src/lib/ratio/modelCapabilities.ts`, `src/lib/security/promptGateway.ts`
  (the only allowed metadata sites). Fails on any other hit.
- **Dynamic**: runs `npx vitest run src/lib/egressGuard.test.ts`. The egress
  guard replaces global `fetch` with an interceptor that throws on any
  non-local URL, then exercises every server-side handler with and without
  hostile cloud env vars. Fails if any non-local URL is attempted.

The dynamic proof does NOT require globally-installed `tsx`. Vitest is a
devDependency and is invoked via `npx --no-install`. If you must skip
dynamic proof (truly impossible environment), set
`ALLOW_STATIC_ONLY_LOCAL_PROOF=1` — `npm run verify:release` does NOT set
that flag and will fail rather than accept static-only proof.

### 4. `npm run gauntlet:local-model`

Live local-model smoke against the configured backend (Ollama by default,
llama-server if `PEH_LOCAL_BACKEND=llama-cpp`). Six tasks:

1. Basic chat.
2. Short summarization.
3. Instruction following.
4. Unsafe request sanity.
5. Prompt injection resistance.
6. Simple code explanation.

Each task evaluates to one of:

- `PASS` — model satisfied this narrow prompt once.
- `TRY_VERIFY` — partial; review required.
- `NEEDS_CLOUD` — tiny check failed badly; do not advertise capability for
  this model without stronger evidence.
- `BLOCKED` — could not run or no usable text returned.

Reports are written to `reports/local-model-gauntlet/`. The overall result
downgrades to `TRY_VERIFY` if any `TRY_VERIFY`, `NEEDS_CLOUD`, or `BLOCKED`
exists. **Only all-PASS produces overall PASS.** Enforced by
`heuristicHonesty.test.ts`.

### 5. `npm run smoke:llama-server` — only when you have a real llama-server

This is the **single source of truth** for whether the llama-cpp path is
LOCAL_READY rather than LOCAL_PARTIAL.

```bash
# In one terminal:
llama-server -m /path/to/your-model.gguf --port 8080

# In another:
LLAMA_SERVER_URL=http://127.0.0.1:8080 npm run smoke:llama-server
```

Statuses:

| Status | Meaning |
|---|---|
| `PASS` | /health + /v1/models + non-streaming + streaming all OK. Writes `reports/llama-server-smoke/PROOF.json`. |
| `PASS_NO_STREAMING` | Non-streaming OK, streaming endpoint produced no usable SSE lines. Also writes PROOF.json. |
| `SKIP_LOCAL_SERVER_NOT_RUNNING` | Local URL but unreachable. Exit 0 — honestly skipped; **does not count as proof**. |
| `FAIL_INCOMPATIBLE` | Reachable but response shape is wrong (not the real OpenAI-compatible API). Exit 1. |
| `FAIL_REMOTE_URL` | A non-local URL was passed in. Refused before any request. Exit 1. |
| `FAIL` | Anything else. Exit 1. |

PROOF.json is what flips llama-cpp capabilities from LOCAL_PARTIAL to
LOCAL_READY. The diagnostic refuses any matrix row that claims llama-cpp
LOCAL_READY without it.

## What a clean release run looks like

```
$ npm run verify:release
> typecheck ........... ok (clean)
> test ............... 87+ files / 1200+ tests pass
> diagnostic ......... releaseReady: true, failures: 0
> prove:local-only ... static + dynamic clean
> gauntlet:local-model ... PASS=5 TRY_VERIFY=1 NEEDS_CLOUD=0 BLOCKED=0 (live Ollama)
```

## What a failing release run looks like

If a contributor adds an `import OpenAI from "openai"`, **all** of these fire:

- `npm run diagnostic` → `deps.no-cloud-sdk: fail`.
- `npm run prove:local-only` (static) → would catch the URL once it is used.
- `npm test` → `egressGuard.test.ts` fails with `EGRESS_GUARD_FAIL: non-local
  fetch attempted: ...`.

If a contributor changes `isAllowedLocalEndpoint` to accept https, the
release-safety test ("rejects https://api.openai.com") fails and the
diagnostic's `guard.endpoint` check fails.

If a contributor writes an unqualified absolute-safety claim in the README
(the test source enumerates the exact phrases that fail), both
`heuristicHonesty.test.ts` and the diagnostic's `heuristic-honesty.docs`
check fail.

## What this testing does NOT prove

- It does not prove the OS, network, or local model server are themselves
  offline.
- It does not prove full safety from prompt injection. Velum and the prompt
  gateway are deterministic heuristics, not formal defenses.
- It does not prove full local-model behavior. The gauntlet is a smoke
  check, not a benchmark.
- It does not prove llama-server works on your specific binary. Only
  `npm run smoke:llama-server` against your real server does that.
