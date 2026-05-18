# Small Model Reliability Layer

**Status:** scaffolded, tested, opt-in. Not yet wired into chat routes.
**Module:** `src/lib/reliability/`
**Test count:** 69 reliability tests; full suite 1653 passing.

## Why

Small local models (the kind that fit on a normal laptop with Ollama or
llama-server) are useful but fragile. They:

- choke on long contexts,
- return empty content when overloaded,
- repeat the same mistake when retried naively,
- and can produce confident-sounding nonsense.

The reliability layer adds beginner-safe guardrails so Squidley Public
can use these models honestly without lying about their limits.

## Local-first policy

| Rule | Enforced where |
|---|---|
| Local mode is always the default. | `DEFAULT_RELIABILITY_POLICY.beginnerMode = true` |
| Cloud is never called automatically. | `runReliability` never performs cloud IO; escalation timeline defaults to `"skipped"`. |
| `cloudUsed` is the literal `false` on every result/receipt. | Type-level: `cloudUsed: false`. |
| Velum redaction runs before any cloud preview. | `buildEscalationOffer` routes the prompt through `sanitizeReceiptText` and `createVelumHandoffPayload`. |
| Whole large files never get inlined silently. | `packContext` rejects items above `rejectIfLargerThan`. |
| At most `maxRetries` retries per task. | `runReliability` loop counter. |
| Same-failure-twice → decompose, never loop. | `buildFailureSignature` + comparison in runner. |

## Architecture overview

```
src/lib/reliability/
├── index.ts          public entry — re-exports everything below
├── types.ts          SmallModelTask, ReliabilityStep, ReliabilityResult,
│                     DEFAULT_RELIABILITY_POLICY, createSmallModelTask()
├── contextPacker.ts  packContext(), renderPackedContext()
├── compoundTools.ts  5 compound tools + COMPOUND_TOOL_REGISTRY
├── runner.ts         runReliability() — bounded loop with validation
├── decompose.ts      buildFailureSignature(), decomposeTask()
├── escalation.ts     buildEscalationOffer(), event-receipt builders
├── codeGraph.ts      indexCodeGraph(), queryCodeGraph()
└── copy.ts           beginner-friendly UI strings + intro card
```

Every file has a colocated `*.test.ts`.

## Compound tools

All compound tools return `CompoundToolResult` and accept an injected
`ToolEnvironment`, so tests can run with no real filesystem.

| Tool | Reads | Writes | Default |
|---|---|---|---|
| `explain_project_structure` | yes (top-level only) | no | enabled |
| `inspect_one_file_safely` | yes (one file, budgeted) | no | enabled |
| `summarize_error_and_next_step` | no | no | enabled |
| `run_local_health_check` | no | no | enabled |
| `make_small_text_change_and_verify` | yes | yes | **disabled** |

The edit tool is intentionally disabled in `DEFAULT_RELIABILITY_POLICY`.
A future build can flip `ToolEnvironment.allowWriteOperations` and pass a
real `writeFile` — but only after explicit approval semantics are wired.

## Retry / decompose behaviour

1. Run primary action.
2. Validate (`defaultValidator`: not-ok ⇒ fail, empty content ⇒ fail).
3. On fail, build a `failureSignature` and retry.
4. Same signature twice ⇒ stop, decompose.
5. Out of retries / out of step budget ⇒ decompose.
6. Decomposition produces ≤5 smaller safe sub-tasks (never any edit-and-verify).

`buildFailureSignature` strips volatile noise (pointers, timestamps,
file paths, stack frames) before comparing.

## Cloud escalation consent rules

Cloud escalation is *only ever offered*. The receipt timeline:

```
local_failed
  ↓
escalation_offered     (offer is built; nothingSent)
  ↓
cloud_packet_previewed (Velum-redacted preview)
  ↓
consent_granted | consent_denied | skipped
```

Even with `decision: "granted"`, this build does **not** make a cloud
call. The `consent_granted` receipt says so explicitly:
*"The user approved escalation. This build does not yet wire a cloud
call, so nothing has been sent."*

This contract is enforced by `integration.test.ts` and
`escalation.test.ts`: every receipt is asserted to have
`cloudUsed === false` on every path.

## Limitations

- The reliability runner is not yet called from `/api/chat` or
  `/api/chat/stream`. Phase 1–8 deliver a clean, tested module that can
  be opted into later without touching production chat.
- The code-graph indexer uses conservative regex only — no real
  TypeScript AST parsing. It is meant as a "which file is likely
  relevant" hint, not a fully-resolved symbol graph.
- The edit-and-verify tool is a typed stub. The contract is in place
  (`allowWriteOperations` + `writeFile`), but no production caller flips
  the flag and no UI approval surface exists yet.
- Token budgeting uses character counts as a deterministic proxy for
  tokens. We do **not** pretend to count tokens for an arbitrary model
  tokenizer.

## Future code-graph roadmap

The current scaffold gives:

- file-level nodes with kind/exports/imports/calls,
- substring-based `queryCodeGraph`,
- a hard cap (`maxNodes`) and per-file size limit (`maxFileBytes`).

Plausible next steps, all out of scope for this PR:

1. Plug in a real TS parser (`ts.SyntaxKind` walk) for higher fidelity.
2. Build inter-file edges (imports ↔ exports) into a directed graph.
3. Cache the graph in `~/.cache/squidley` rather than re-indexing per run.
4. Wire `queryCodeGraph` into the reliability runner so a "which file
   matters?" step happens before the model is called.

## Teacher integration

A beginner-friendly markdown lesson lives at
`docs/teacher-kb/15-small-model-reliability.md`. It is intentionally not
registered in `TEACHER_LESSONS` in this commit because the teacher
subsystem on `main` is still untracked work-in-progress; whoever lands
the teacher subsystem should add a `small-model-reliability` entry that
points at this markdown file (`level: beginner`, `module: local_mode`,
`requiredForRelease: false`, prerequisite `local-models`).

UI copy strings live in `src/lib/reliability/copy.ts` and can be
rendered anywhere. The `buildReliabilityIntroCard()` helper returns a
plain object — UI is free to style it.

## Changelog

- Add `src/lib/reliability/` module: types, context packer, compound
  tools, runner, decompose, escalation, code-graph scaffold, copy.
- Add `docs/teacher-kb/15-small-model-reliability.md` lesson.
- Register optional `small-model-reliability` lesson in the teacher
  registry (not required-for-release).
- 69 new tests; full suite stays green at 1653 passing.
