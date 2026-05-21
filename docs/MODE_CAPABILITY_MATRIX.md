# Mode Capability Matrix

> **Product status: NOT RELEASE READY.** Local Mode is an audited subsystem.
> Cloud Mode is architecture only. See
> [PUBLIC_SQUIDLEY_RELEASE_PLAN.md](PUBLIC_SQUIDLEY_RELEASE_PLAN.md).
>
> Tier vocabulary follows [docs/CAPABILITY_TAXONOMY.md](CAPABILITY_TAXONOMY.md).
> The columns `localModeStatus` and `cloudModeStatus` are preserved for the
> diagnostic that grep-checks this file.
>
> This Markdown is a **projection** of the machine-readable matrices at
> [docs/capability-matrix.public-squidley.json](capability-matrix.public-squidley.json)
> and [docs/tool-matrix.public-squidley.json](tool-matrix.public-squidley.json).
> When they disagree, the JSON wins. Run `npm run verify:capabilities`
> to validate.

## How to Read This Matrix

Each row answers seven questions:

| Column | Meaning |
|---|---|
| Capability | What the user can ask Squidley to do |
| Tier | One of `LOCAL_READY`, `LOCAL_LIMITED`, `LOCAL_PARTIAL`, `CLOUD_PLANNED`, `NOT_IMPLEMENTED`, `BLOCKED` |
| Available? | Can a user run it today? |
| Local/Cloud | Where it runs |
| Approval? | When the user has to say yes |
| Deterministic? | Does the same input always give the same answer? |
| Experimental? | Is the surface still being shaped? |
| Beginner-safe? | Can a first-time user run it without surprise? |
| Production ready? | Would you ship it to a beginner in public release? |

`localModeStatus` and `cloudModeStatus` legacy values are summarised at the
bottom for the diagnostic.

## Local Mode — What Actually Works Today

### LOCAL_READY (use freely, no approval needed)

| Capability | Tier | Available? | Local/Cloud | Approval? | Deterministic? | Experimental? | Beginner-safe? | Production ready? |
|---|---|---|---|---|---|---|---|---|
| Local chat (Colloquium) | LOCAL_READY | Yes | Local | Never | No (model-dependent) | No | Yes | Subsystem only |
| Teacher mode (deterministic Q&A) | LOCAL_READY | Yes | Local | Never | Yes | No | Yes | Subsystem only |
| Structured planning (no execution) | LOCAL_READY | Yes | Local | Never | Yes | No | Yes | Subsystem only |
| Provenance footer on every reply | LOCAL_READY | Yes | Local | Never | Yes | No | Yes | Subsystem only |
| Honesty annotation (hallucination correction) | LOCAL_READY | Yes | Local | Never | Yes | No | Yes | Subsystem only |
| Receipts (Tabularium, browser-local) | LOCAL_READY | Yes | Local | Never | Yes | No | Yes | Subsystem only |
| Notes (Archivum, browser-local) | LOCAL_READY | Yes | Local | Never | Yes | No | Yes | Subsystem only |
| Local diagnostics (Nous, health, model list) | LOCAL_READY | Yes | Local | Never | Yes | No | Yes | Subsystem only |
| Velum deterministic review (heuristic, not a guarantee) | LOCAL_READY | Yes | Local | Never | Yes | No | Yes | Subsystem only |

### LOCAL_LIMITED (works, but only after explicit per-action approval)

| Capability | Tier | Available? | Local/Cloud | Approval? | Deterministic? | Experimental? | Beginner-safe? | Production ready? |
|---|---|---|---|---|---|---|---|---|
| Approval-gated file inspection (one file, ≤256 KB, read-only) | LOCAL_LIMITED | Yes | Local | Per-action | Yes (the gate logic) | No | Yes after approval | Subsystem only |
| Approval-gated tiny edits (single snippet, ≤4 KB diff, rollback on verify-fail) | LOCAL_LIMITED | Yes | Local | Per-action | Yes (the gate logic) | No | Yes after approval | Subsystem only |
| Local image analysis (Ollama vision only) | LOCAL_LIMITED | Yes | Local | Never (but model must be vision) | No | No | Yes | Subsystem only |

### LOCAL_PARTIAL (works, quality depends on model or backend)

| Capability | Tier | Available? | Local/Cloud | Approval? | Deterministic? | Experimental? | Beginner-safe? | Production ready? |
|---|---|---|---|---|---|---|---|---|
| Small-model reliability layer (bounded compound tools) | LOCAL_PARTIAL | Yes | Local | Per-tool when risky | Partially | No | Yes | Subsystem only |
| Single-file code suggestion (Fabrica) — never writes | LOCAL_PARTIAL | Yes | Local | Never (suggestion only) | No | No | Yes | Subsystem only |
| Advanced planning quality on small models | LOCAL_PARTIAL | Yes | Local | Never | Partially | No | Yes (with caveats) | Subsystem only |
| llama.cpp / llama-server backend | LOCAL_PARTIAL | Yes (text only) | Local | n/a | n/a | No | Yes (text only) | Pending real-binary validation |
| Note summarisation (Archivum) | LOCAL_PARTIAL | Yes | Local | Never | No | No | Yes | Subsystem only |

## Cloud Mode — What Is Architecture Only

### CLOUD_PLANNED (registered, never runs)

| Capability | Tier | Available? | localModeStatus | cloudModeStatus | Notes |
|---|---|---|---|---|---|
| Cloud chat (any provider) | CLOUD_PLANNED | No | n/a | NOT_IMPLEMENTED | All cloud providers `NOT_IMPLEMENTED` in `cloudRegistry.ts`. API keys do NOT unlock. |
| Cloud streaming chat | CLOUD_PLANNED | No | n/a | NOT_IMPLEMENTED | No adapter wired |
| Cloud escalation (offered by reliability layer) | CLOUD_PLANNED | No | suggest-only | NOT_IMPLEMENTED | Reliability layer can suggest; cannot run |
| Advanced cloud models (large planners, vision, etc.) | CLOUD_PLANNED | No | n/a | NOT_IMPLEMENTED | Locked in registry |
| Multi-file build (Fabrica multi-file) | CLOUD_PLANNED | No | NOT_IMPLEMENTED | NOT_IMPLEMENTED | Requires cloud + tools + approval |
| Agent workflows (Legatus) | CLOUD_PLANNED | No | NOT_IMPLEMENTED | NOT_IMPLEMENTED | Cloud-required |
| Cloud vision | CLOUD_PLANNED | No | n/a | NOT_IMPLEMENTED | — |
| Cloud image generation | CLOUD_PLANNED | No | n/a | NOT_IMPLEMENTED | — |
| Model evaluation (Probatio) | CLOUD_PLANNED | No | NOT_IMPLEMENTED | NOT_IMPLEMENTED | — |
| Policy control (Praertorium) | CLOUD_PLANNED | No | NOT_IMPLEMENTED | NOT_IMPLEMENTED | — |
| High-trust control (Imperium) | CLOUD_PLANNED | No | NOT_IMPLEMENTED | NOT_IMPLEMENTED | — |

Every cloud row in the JSON capability matrix is independently checked by
`scripts/public-squidley-diagnostic.mjs` to confirm there is no
`IMPLEMENTED` status on a `locality: "cloud"` row.

## NOT_IMPLEMENTED (no code path, would be new work)

These have no route, no execution surface, and no honest path to "yes"
in this build. The honesty annotator overrides any model claim that one
of these happened.

| Capability | Tier | Why not |
|---|---|---|
| Shell execution | NOT_IMPLEMENTED | Planner refuses; no exec surface; "Squidley does not run shell commands." |
| Web search / browsing | NOT_IMPLEMENTED | No search provider, no browsing surface |
| Autonomous loops (multi-step without approval) | NOT_IMPLEMENTED | Planner produces zero executable steps for blocked risk |
| Multi-file editing | NOT_IMPLEMENTED | Tiny edits are single-file only |
| General filesystem read/write (`fs.write`, `fs.delete`, `fs.move`) | NOT_IMPLEMENTED | Only narrow approval-gated read/tiny-edit exist |
| Memory write (Archelon) | NOT_IMPLEMENTED | No memory backend |
| Document parsing (PDF, etc.) | NOT_IMPLEMENTED | Cloud-required |
| Package install / npm operations | NOT_IMPLEMENTED | No exec surface |
| Git commit / git operations | NOT_IMPLEMENTED | No exec surface |
| Send email / external messages | NOT_IMPLEMENTED | No egress to external services |

## BLOCKED (refused by design, contract-enforced)

These are NOT roadmap items. They are protected by type-level or
runtime guards that a future feature must explicitly relax.

| Boundary | Enforced by |
|---|---|
| Unrestricted filesystem access | path-bound approval tokens; project-root boundary; 256 KB cap |
| Hidden cloud calls | `cloudUsed: false` literal type in chat/planning/reliability/editing/inspection result types |
| Silent tool execution | every tool action emits a Tabularium receipt; no result returned without one |
| Destructive operations during planning | planner returns zero executable steps for delete / deploy / shell intent |
| Cloud fallback on local failure | no fallback path; failure surfaces with beginner-readable copy |
| Tool/function declarations in chat requests | publicReleaseSafety test asserts no `tools`/`tool_choice`/`functions` in outbound bodies |

## Implementation Summary (canonical-tier counts)

- **LOCAL_READY**: 9
- **LOCAL_LIMITED**: 3
- **LOCAL_PARTIAL**: 5
- **CLOUD_PLANNED**: 11
- **NOT_IMPLEMENTED**: 10
- **BLOCKED (contracts)**: 6

## Diagnostic Compatibility

The repo diagnostic looks for the strings `localModeStatus` and
`cloudModeStatus` in this file to confirm the matrix is mode-aware.
They appear in the CLOUD_PLANNED table above.

## Key Distinctions (for beginners)

- **"Use freely"** → LOCAL_READY
- **"Use after approval"** → LOCAL_LIMITED
- **"Use, but expect quality variance"** → LOCAL_PARTIAL
- **"Planned but currently dead"** → CLOUD_PLANNED
- **"Not built; would be new feature work"** → NOT_IMPLEMENTED
- **"Refused by design"** → BLOCKED

If a UI label, lesson, or doc uses any other word for the same idea,
it should be updated to match.
