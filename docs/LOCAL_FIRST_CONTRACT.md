# Local-First Contract — Public Squidley

This is the written contract that Public Squidley follows. Every numbered rule
below is **enforced in code and verified by tests**. Pointers to enforcement
points are inline so reviewers can audit each rule independently.

## 1. Default mode is local-only

- `getLocalProviderConfig()` returns `cloudUsed: false` and `toolsUsed: false`
  as type-level constants
  ([`src/lib/providers/local.ts`](../src/lib/providers/local.ts)).
- The `LocalProviderConfig` interface declares both as the literal `false` —
  callers cannot flip them.
- No npm dependency is a cloud AI SDK (`@anthropic-ai/*`, `openai`,
  `@google/genai`, etc.).
  Verified by `scripts/public-squidley-diagnostic.mjs`.

## 2. The endpoint guard rejects non-local hosts

- `isAllowedLocalEndpoint` in
  [`src/lib/providers/local.ts`](../src/lib/providers/local.ts) rejects:
  - any non-`http:` protocol (so `https://api.openai.com` is rejected on
    protocol),
  - any host that is not `localhost`, `::1`, `*.local`, a private IPv4
    (`10.x`, `127.x`, `172.16-31.x`, `192.168.x`, `169.254.x`), or an IPv6
    unique-local / link-local address.
- If a user sets `SQUIDLEY_LOCAL_ENDPOINT=https://api.openai.com`, the config
  silently falls back to the local default rather than honoring it.
- Tested in `src/lib/providers/local.test.ts`.

## 3. No cloud SDK, no cloud fetch

- `grep -RIn 'api.openai.com|openrouter.ai|api.anthropic.com|googleapis.com'
  src/` returns hits only in:
  - `src/lib/providers/registry.ts` (locked metadata),
  - `src/lib/ratio/modelCapabilities.ts` (locked metadata),
  - `src/lib/security/promptGateway.ts` (a regex *to detect* prompt-injection
    attempts referencing cloud keys),
  - `*.test.ts` (test fixtures).
- Enforced by `scripts/public-squidley-diagnostic.mjs` and verified by
  `scripts/egress-proof.sh`.

## 4. No silent cloud fallback on local failure

- Local-provider failure paths in `src/lib/chat/handler.ts`,
  `src/lib/chat/stream.ts`, `src/app/api/fabrica/suggest/route.ts`, and
  `src/app/api/oculus/analyze/route.ts` all return a structured error response
  with `cloudUsed: false`. None of them initiate a follow-up request.

## 5. Unknown capability does not call cloud

- `resolveCapabilityRuntime` in `src/lib/capabilities/runtime.ts` throws on
  unknown capability ids. There is no executor that consumes the returned
  decision to make a network call — even `CLOUD_OPTIONAL` and `CLOUD_REQUIRED`
  states are advisory metadata, not actions.
  See `cloudEscalation.ts` header: *"It does not cause anything to happen.
  Nothing is sent merely because a packet exists."*

## 6. Cloud unlock is hardcoded false

- Every production caller of `decideCapabilityRuntime` passes
  `cloudUnlocked: false`. Searched paths:
  `src/lib/capabilities/{preflight,localReadiness,cloudEscalationDemo}.ts`,
  `src/lib/fabrica/cloudPreflight.ts`.
- Cloud entries in `PROVIDER_REGISTRY` are all
  `enabledByDefault:false, cloudUnlockRequired:true, status:"locked"`. The
  predicate `cloudProvidersAreLockedByDefault()` is asserted in
  `src/lib/publicReleaseSafety.test.ts`.

## 7. Tool calls are not present

- The chat handler never sends `tools`, `tool_choice`, or `functions` fields.
  Asserted by `publicReleaseSafety.test.ts` ("does not send tool declarations
  for casual chat or follow-up history").
- No agent loop, no shell, no FS write paths.

## 8. UI labels honest

- `cloudUsed`, `localOnly`, `modelUsed`, `toolsUsed` are part of the Tabularium
  receipt type. The shell and module pages render local-only badges
  unconditionally — Public Squidley has no "mixed mode" UI.
- `publicReleaseSafety.test.ts` reads the README and docs and asserts copy is
  honest about `llama-server` pending and "no cloud without explicit consent".

## 9. Receipts record what happened, redacted

- `createTabulariumReceipt` in `src/lib/tabularium/receipts.ts` forces
  `localOnly:true, cloudUsed:false, toolsUsed:false` and sanitizes
  text/secrets before persisting. PII-redaction is regression-tested.

## 10. Cloud mode requires explicit activation

- Setting `SQUIDLEY_MODE=cloud` activates Cloud Mode architecture, but no cloud
  provider adapters are implemented yet. Cloud Mode is not functional.
- API keys alone (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) do not change
  mode or routing. The mode resolver (`src/lib/mode/resolver.ts`) enforces this.
- The release-safety test (`src/lib/publicReleaseSafety.test.ts`) asserts that
  setting cloud API keys in env does not change routing or `cloudUsed`.
- When Cloud Mode adapters are implemented, cloud calls will require explicit
  mode activation, provider configuration, and user consent.

## Proof procedures

- **`npm run verify:release`** — the release gate. Runs typecheck, the
  full test suite, the diagnostic, the dynamic egress proof, and the live
  local-model gauntlet. Must exit 0 to ship.
- `scripts/prove-local-only.mjs` — static + dynamic egress proof. Static:
  greps `src/` for cloud URLs outside locked metadata. Dynamic: shells out
  to `npx vitest run src/lib/egressGuard.test.ts` (no global `tsx`
  required; vitest is a devDependency). Static-only fallback is gated
  behind `ALLOW_STATIC_ONLY_LOCAL_PROOF=1` and is never accepted by
  `verify:release`.
- `scripts/public-squidley-diagnostic.mjs` — release diagnostic. Fails on
  cloud SDK deps, cloud URL hits, missing matrix, missing guard,
  LOCAL_READY rows without `proofReferences`, llama-cpp LOCAL_READY without
  `reports/llama-server-smoke/PROOF.json`, or docs overclaim phrases.
- `scripts/smoke-llama-server.mjs` — real llama-server binary smoke. Writes
  `reports/llama-server-smoke/PROOF.json` on PASS. Until that file exists,
  every llama-cpp-side capability is LOCAL_PARTIAL.
- `scripts/egress-proof.sh` — manual packet-capture procedure with `tcpdump`.
- `scripts/gauntlet-local-model.mjs` — live local-model smoke against a real
  Ollama / llama-server instance. Overall result downgrades to TRY_VERIFY if
  any task scores TRY_VERIFY/NEEDS_CLOUD/BLOCKED.
- `src/lib/egressGuard.test.ts` — automated runtime egress assertion on
  every CI build (the same dynamic proof `prove:local-only` shells out to).
- `src/lib/heuristicHonesty.test.ts` — fails the build if docs or `src/lib`
  contain unqualified safety/proof overclaims.
- See [`docs/LOCAL_ONLY_TESTING.md`](LOCAL_ONLY_TESTING.md) for the
  end-to-end testing guide.

## What this contract does **not** promise

- It does not promise that the OS or the local model server are themselves
  offline. If your local model server reaches the network, that is its
  configuration, not Squidley's.
- It does not promise full safety from prompt injection. Velum and the prompt
  gateway are deterministic heuristics, not guaranteed defenses.
- It does not promise full validation of llama-server. The real
  `llama-server` binary path is **pending validation** — the
  OpenAI-compatible text adapter has been exercised against
  Ollama's compatible endpoint and unit tests, not against a real
  llama-server. This is stated honestly in README, setup docs, and Nous.
