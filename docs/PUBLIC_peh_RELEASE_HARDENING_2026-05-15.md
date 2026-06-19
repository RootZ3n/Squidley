# Public Peh — Final Release Hardening Pass (2026-05-15)

Repo: `/mnt/ai/peh`

This is the no-loose-ends pass that follows
[`docs/PUBLIC_PEH_AUDIT_2026-05-15.md`](PUBLIC_PEH_AUDIT_2026-05-15.md).
Its purpose was to close or hard-gate every remaining warning so the final
verdict can be **RELEASE READY** rather than "RELEASE READY WITH WARNINGS".

## 1. Final verdict

**RELEASE READY**

`npm run verify:release` exits 0 across every stage:

```
> typecheck ............... clean
> test ..................... 89 files / 1261 tests pass
> diagnostic ............... releaseReady: true, failures: 0
> prove:local-only ......... static + dynamic clean (verdict: PASS)
> gauntlet:local-model ..... PASS=5 / TRY_VERIFY=1 / NEEDS_CLOUD=0 / BLOCKED=0
                             (live Ollama qwen3.5:0.8b; no cloud calls)
EXIT=0
```

The gauntlet's overall recommendation is `TRY_VERIFY`, not `PASS`, because
qwen3.5:0.8b (a 0.8B-parameter model) can repeat injected text in the
prompt-injection task. That is honestly captured in the gauntlet report and
in the capability matrix (`system:local.gauntlet` is `LOCAL_PARTIAL`). It is
a **model** quality limitation, not a Peh behavior bug — the
application-layer prompt gateway and Velum review run regardless of model
quality. The release does not claim "safety solved"; it claims "the local
checks ran, no cloud calls were made, and the result is honestly labeled".

## 2. Warnings eliminated

| Original warning | How it was closed |
|---|---|
| Real `llama-server` binary smoke is still pending — implementation exists but has only been validated against Ollama's compatible endpoint. | Added `scripts/smoke-llama-server.mjs` with explicit `PASS / PASS_NO_STREAMING / SKIP_LOCAL_SERVER_NOT_RUNNING / FAIL_INCOMPATIBLE / FAIL_REMOTE_URL / FAIL` status set, structured JSON reports, and a `reports/llama-server-smoke/PROOF.json` marker. Updated the capability matrix to mark every llama-cpp-side backend status `LOCAL_PARTIAL` until PROOF.json exists. The diagnostic refuses any matrix row that claims llama-cpp `LOCAL_READY` without PROOF.json (verified by introducing the case and confirming the diagnostic failed). Added `src/lib/smokeLlamaServer.test.ts` (4 tests) covering remote-URL rejection, unreachable-local SKIP, and PROOF.json gating. |
| Velum / prompt-gateway / gauntlet are deterministic heuristics, not safety proofs. | Added `src/lib/heuristicHonesty.test.ts` (8 tests) that scans docs, README, and `src/lib` for unqualified absolute-safety overclaim phrases and fails the build on any hit outside a disclaiming context. Reclassified `system:local.gauntlet` to `LOCAL_PARTIAL` with an explicit `honestyNote` field. Added per-row `honestyNote` for heuristic capabilities. The diagnostic now enforces a tighter subset of the same overclaim list as a hard release gate. |
| `prove-local-only.mjs` dynamic proof falls back to static when `tsx` is not installed. | Rewrote `scripts/prove-local-only.mjs` to invoke `npx --no-install vitest run src/lib/egressGuard.test.ts` for its dynamic proof. Vitest is already a devDependency; no global `tsx` is needed. Static-only fallback is gated behind `ALLOW_STATIC_ONLY_LOCAL_PROOF=1` and `npm run verify:release` does not set that flag and rejects static-only proof. |

## 3. What remains

Nothing blocks release.

Two genuinely external warnings are now hard-gated rather than silent:

1. The matrix continues to label every llama-cpp-side capability
   `LOCAL_PARTIAL` until `reports/llama-server-smoke/PROOF.json` is
   produced. This is enforced by the diagnostic.
2. Heuristic safety surfaces (Velum, prompt-gateway, gauntlet) continue to
   carry explicit "not a safety proof" copy, asserted by
   `heuristicHonesty.test.ts`.

Both are correctly labeled and tested. Neither is a release blocker —
they are the honest truth of the product as shipped.

## 4. Files changed

```
A  docs/LOCAL_ONLY_TESTING.md
A  docs/PUBLIC_PEH_RELEASE_HARDENING_2026-05-15.md  (this file)
A  scripts/smoke-llama-server.mjs
A  src/lib/heuristicHonesty.test.ts
A  src/lib/smokeLlamaServer.test.ts
M  docs/CAPABILITY_MATRIX_PUBLIC_PEH.md             (per-backend status, proof refs)
M  docs/LOCAL_FIRST_CONTRACT.md                         (proof procedures updated)
M  docs/capability-matrix.public-peh.json          (schema v2; per-backend status; proofReferences)
M  package.json                                          (smoke:llama-server → new script; verify:release runs gauntlet too)
M  README.md                                             (release verification section)
M  scripts/prove-local-only.mjs                          (dynamic proof via vitest; no tsx)
M  scripts/public-peh-diagnostic.mjs                (strict release gate: proof refs, PROOF.json, overclaim scan)
```

No production source file under `src/app/**` or `src/components/**` was
changed by this hardening pass — the application code was already correct.
The pass added enforcement, tests, and honest matrix labels.

## 5. Tests added

- `src/lib/heuristicHonesty.test.ts` — 8 tests
- `src/lib/smokeLlamaServer.test.ts` — 4 tests
- Total: 12 new tests. Test suite is now 89 files / 1261 tests, all pass.

## 6. Commands run and results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 89 files / 1261 tests pass |
| `node scripts/public-peh-diagnostic.mjs` | releaseReady: true, failures: 0 |
| `node scripts/prove-local-only.mjs` | static + dynamic clean (verdict: PASS) |
| `LLAMA_SERVER_URL=https://api.openai.com node scripts/smoke-llama-server.mjs` | exit 1, `FAIL_REMOTE_URL` |
| `LLAMA_SERVER_URL=http://127.0.0.1:65530 node scripts/smoke-llama-server.mjs` | exit 0, `SKIP_LOCAL_SERVER_NOT_RUNNING` |
| `LLAMA_SERVER_URL=http://127.0.0.1:8080 node scripts/smoke-llama-server.mjs` | exit 1, `FAIL_INCOMPATIBLE` (a non-llama-server service answered on :8080 on this host) — script correctly classified the situation rather than claiming success |
| `PEH_LOCAL_BACKEND=ollama node scripts/gauntlet-local-model.mjs` | exit 0; PASS=5 / TRY_VERIFY=1 / NEEDS_CLOUD=0 / BLOCKED=0; "No cloud calls were made." |
| `npm run verify:release` | exit 0 |

## 7. Explicit answers

| Question | Answer |
|---|---|
| Was a real llama-server binary smoke added? | **Yes.** `scripts/smoke-llama-server.mjs` exercises /health, /v1/models, non-streaming chat, and streaming chat against a real local llama-server, with status enum `PASS / PASS_NO_STREAMING / SKIP_LOCAL_SERVER_NOT_RUNNING / FAIL_INCOMPATIBLE / FAIL_REMOTE_URL / FAIL` and writes `reports/llama-server-smoke/PROOF.json` on PASS. |
| Is llama-server LOCAL_READY or LOCAL_PARTIAL? | **LOCAL_PARTIAL** in this release. No real `llama-server` binary is available on this audit host; `reports/llama-server-smoke/PROOF.json` does not exist; the diagnostic enforces that no row may claim llama-cpp `LOCAL_READY` without it. |
| Can remote OpenAI-compatible URLs be used in local-only mode? | **No.** `isAllowedLocalEndpoint` rejects `https://` and public hosts. `scripts/smoke-llama-server.mjs` refuses non-local URLs before any request with `FAIL_REMOTE_URL`. `src/lib/egressGuard.test.ts` throws on any non-local fetch attempt across every server handler. |
| Are heuristic safety checks clearly labeled as heuristics? | **Yes.** Every heuristic surface (Velum, prompt gateway, gauntlet) carries explicit "deterministic heuristic, not safety proof" copy. `src/lib/heuristicHonesty.test.ts` fails the build on any unqualified safety overclaim. The capability matrix has a `honestyNote` field on heuristic rows. |
| Can TRY_VERIFY be treated as PASS? | **No.** The gauntlet's `recommendedOverall` downgrades to `TRY_VERIFY` whenever any task scores `TRY_VERIFY` or `NEEDS_CLOUD`; only all-PASS produces overall PASS. Asserted by `heuristicHonesty.test.ts` and verified live in this audit (the gauntlet ran 5 PASS + 1 TRY_VERIFY → "Overall recommendation: TRY_VERIFY"). |
| Does prove-local-only run dynamic proof without global tsx? | **Yes.** It shells out to `npx --no-install vitest run src/lib/egressGuard.test.ts`. Vitest is already a devDependency. No global `tsx` is required. |
| Can verify:release pass if dynamic local-only proof is skipped? | **No.** `npm run verify:release` does NOT set `ALLOW_STATIC_ONLY_LOCAL_PROOF`. With that flag unset, `prove-local-only.mjs` fails if `node_modules/vitest` is missing or if the dynamic egress-guard run fails. |
| Does every LOCAL_READY capability have proof? | **Yes.** The diagnostic enumerates every row classified `LOCAL_READY` and fails if any has an empty `proofReferences` array. All 9 LOCAL_READY rows reference at least one of: live gauntlet report, route/handler unit tests, egress guard tests, or release-safety tests. |
| Are NOT_IMPLEMENTED capabilities prevented from looking ready? | **Yes.** All 7 NOT_IMPLEMENTED rows have no backing route; the UI surfaces them as locked future modules; the registry tier is `cloud-required` or `blocked`; `receiptActions: "none"`; no fetch path exists for them; `publicReleaseSafety.test.ts` asserts cloud providers stay locked. |
| Did any cloud SDK or cloud call path get added? | **No.** `package.json` continues to have zero cloud AI SDKs. The diagnostic enforces this on every run. |
| Can any cloud call happen in default local-only mode? | **No.** No fetch path targets a cloud URL. `isAllowedLocalEndpoint` rejects non-local hosts. `cloudUnlocked` is hardcoded false in every production caller. `egressGuard.test.ts` throws on any non-local fetch. Hostile cloud env vars in test fixtures do not change routing. |
