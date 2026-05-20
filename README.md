# Squidley Public

> **Product status: NOT RELEASE READY**
> Local Mode foundation is audited and includes narrow approval-gated tool
> execution (file inspection, tiny edits) plus structured planning. Cloud
> Mode is architecture only — no adapters wired. Full teaching, broad tool
> execution, and autonomous workflows are not yet implemented. See
> [docs/PUBLIC_SQUIDLEY_RELEASE_PLAN.md](docs/PUBLIC_SQUIDLEY_RELEASE_PLAN.md)
> and [docs/CAPABILITY_TAXONOMY.md](docs/CAPABILITY_TAXONOMY.md).

Squidley is a **local-first teaching + planning assistant**. She starts on
your machine, teaches every concept step by step, plans tasks deterministically,
and — for narrow, approval-gated tools — actually executes. She is **not** an
autonomous cloud agent. Cloud Mode and broad tool execution are planned
phases.

Public Squidley is more than local chat: it includes a teacher, a planner, a
small-model reliability layer, narrow approval-gated file inspection, and
narrow approval-gated tiny edits. It is **not** a multi-file editor, not a
shell, not a web browser, and not yet a cloud-capable agent.

## What Squidley Will Be

- **A teacher first**: Squidley teaches you what local models are, what cloud
  providers are, what tools do, what approvals protect, and what receipts prove.
  Teaching is first-class architecture with a concept registry, lesson
  curriculum, runtime teaching hooks, and a self-explanation engine.
  See [docs/TEACHER_FIRST_DOCTRINE.md](docs/TEACHER_FIRST_DOCTRINE.md).
- **Local-first start**: your first experience is private, free, on your own
  machine. Nothing leaves your device until you explicitly enable Cloud Mode.
- **Cloud-capable**: when you are ready, Squidley connects to cloud providers
  for more powerful models, tools, and autonomous workflows.
- **Honest**: every answer says exactly what produced it. Squidley never
  pretends to have done something she did not do.
- **Approval-gated**: risky actions (file write, shell, network) require
  explicit approval. Cloud calls require consent.
- **Receipt-backed**: every action produces an auditable receipt.

## What Is Built Today

Capability tiers below use the canonical taxonomy:
[docs/CAPABILITY_TAXONOMY.md](docs/CAPABILITY_TAXONOMY.md). See
[docs/MODE_CAPABILITY_MATRIX.md](docs/MODE_CAPABILITY_MATRIX.md) for the
seven-question column view.

### Use freely (LOCAL_READY)
- Local model chat via Ollama or llama-server. Ollama is validated end-to-end
- Streaming chat with provenance footer
- Teacher chat: beginner questions answered deterministically from the concept
  registry, no model call needed
- Structured planning: deterministic, evidence-typed plans that never execute
- Honesty annotation for hallucinated tool claims
- Receipts (Tabularium, browser-local), notes (Archivum, browser-local),
  diagnostics (Nous)
- Egress guard blocking all non-local fetch
- Velum deterministic text review (heuristic — not a guarantee of safety)
- Mode resolver (local/cloud separation); cloud provider registry (architecture,
  all NOT_IMPLEMENTED)

### Use after approval (LOCAL_LIMITED)
- **Approval-gated file inspection** — read one file at a time, ≤256 KB,
  path-bound approval token, secrets redacted before the model sees them
- **Approval-gated tiny edits** — replace exactly one snippet in one
  already-inspected file, 4 KB max diff, hash-bound approval token, in-memory
  backup, automatic rollback on verification failure
- **Local image analysis (Oculus)** — works with vision-capable local models;
  refuses non-vision models clearly

### Use, quality varies (LOCAL_PARTIAL)
- Small-model reliability layer: bounded compound-tool runs for small local
  models (max 6 steps, max 2 retries, no shell, no broad file access; cloud
  escalation may be suggested but never auto-run)
- Single-file code suggestion (Fabrica) — suggestions only, no file write
- llama.cpp / llama-server backend — real-binary validation pending
- Advanced planning quality on small models

### Teaching layer (Phase 2C complete; polish ongoing)
- First-run onboarding wizard (7-step guided introduction)
- Concept registry (30+ concepts), lesson curriculum (14 lessons), knowledge
  base (16 markdown modules including "What Squidley Can Actually Do Today"),
  runtime teaching hooks (21 events)
- Teacher UI at `/teacher`: learning path, concept glossary, ask panel, settings
- Teach-while-chatting toggle, in-context teaching cards, explain-this helpers
- 74 zero-experience simulation tests verifying beginner answer honesty
- 1584+ tests total, release verification pipeline

### What Is Not Built Yet (NOT_IMPLEMENTED / CLOUD_PLANNED)
- **Cloud Mode** (Phase 3 — CLOUD_PLANNED): provider adapters, cloud chat,
  consent flow, cloud receipts. See [docs/CLOUD_MODE.md](docs/CLOUD_MODE.md).
  Setting an API key alone does not unlock Cloud Mode.
- **Broad tool execution** (Phase 4 — PARTIAL): narrow approval-gated file
  inspection and tiny edits ship today. General file read/write, shell, web
  search, multi-file edit, and project-wide inspection are NOT_IMPLEMENTED.
  See [docs/AUTONOMOUS_TOOL_POLICY.md](docs/AUTONOMOUS_TOOL_POLICY.md).
- **Autonomous workflows** (Phase 5 — NOT_IMPLEMENTED): multi-step execution
  loops, approval checkpoints across many steps.
- **Release candidate** (Phase 6): all phases complete, tested with beginners.

## Quick Start (Development)

```bash
npm install
ollama pull llama3.2
npm run dev
```

Open `http://localhost:3000`. If Ollama is not running: `ollama serve`.

Defaults:
```text
SQUIDLEY_LOCAL_ENDPOINT=http://localhost:11434
SQUIDLEY_LOCAL_MODEL=llama3.2
```

This starts Local Mode only. Cloud Mode requires `SQUIDLEY_MODE=cloud` plus a
configured cloud provider — but no cloud adapters are implemented yet.

## Operating Modes

### Local Mode (default)
Everything runs on your machine. No cloud calls, no tool execution, no API keys
needed. This is the audited foundation. API keys alone do not enable Cloud Mode.
See [docs/LOCAL_MODE.md](docs/LOCAL_MODE.md).

### Cloud Mode (planned, architecture only)
Explicit opt-in via `SQUIDLEY_MODE=cloud`. Will support cloud AI providers, tool
execution, and autonomous workflows when implemented. Currently architecture-
only: no cloud adapters exist. See [docs/CLOUD_MODE.md](docs/CLOUD_MODE.md).

## Current Modules

| Module | What it does now |
| --- | --- |
| Colloquium | Local-only streaming chat with model discovery and sessions. |
| Velum | Deterministic client-side text review and redaction helper. |
| Archivum / More Input | Browser-local notes, tags, search/filter/edit, import/export. |
| Oculus | Manual image preview and optional local vision analysis. |
| Fabrica | Beginner single-file code suggestion workshop. No file writes. |
| Tabularium | Browser-local receipts showing what happened and what stayed local. |
| Nous | Module/model map, capability status, locked provider metadata. |
| Settings | Local control center for tours, storage, and export. |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm test` | Vitest test suite |
| `npm run typecheck` | TypeScript check |
| `npm run diagnostic` | Release-readiness diagnostic |
| `npm run prove:local-only` | Local-only egress proof |
| `npm run verify:release` | Full verification pipeline (subsystem gate) |

**Note**: `verify:release` verifies the Local Mode subsystem. It does not mean
the full product is ready to ship.

## Safety and Privacy (Local Mode)

- All fetch calls go to localhost only. Cloud endpoints are rejected.
- No cloud SDK in dependencies.
- `cloudUsed: false` and `toolsUsed: false` are type-level constants.
- Receipts never store raw user content.
- No telemetry, no background agents, no automatic file writes.

## Release Plan

See [docs/PUBLIC_SQUIDLEY_RELEASE_PLAN.md](docs/PUBLIC_SQUIDLEY_RELEASE_PLAN.md)
for the six-phase plan from Local Foundation to Release Candidate.

## Documentation

### Product & Architecture
- [docs/PUBLIC_SQUIDLEY_RELEASE_PLAN.md](docs/PUBLIC_SQUIDLEY_RELEASE_PLAN.md) — release phases and requirements
- [docs/CAPABILITY_TAXONOMY.md](docs/CAPABILITY_TAXONOMY.md) — canonical capability tiers and standard phrases
- [docs/PUBLIC_SQUIDLEY_COHERENCE_REPORT_2026-05-20.md](docs/PUBLIC_SQUIDLEY_COHERENCE_REPORT_2026-05-20.md) — most recent product coherence pass
- [docs/RELEASE_READINESS_SCORECARD_2026-05-20.md](docs/RELEASE_READINESS_SCORECARD_2026-05-20.md) — release readiness rubric and scores
- [docs/TEACHER_FIRST_DOCTRINE.md](docs/TEACHER_FIRST_DOCTRINE.md) — teaching principles
- [docs/SELF_EXPLANATION_REQUIREMENTS.md](docs/SELF_EXPLANATION_REQUIREMENTS.md) — what Squidley must be able to explain
- [docs/BEGINNER_ONBOARDING_DESIGN.md](docs/BEGINNER_ONBOARDING_DESIGN.md) — onboarding flow design

### Teaching
- [docs/teacher-kb/](docs/teacher-kb/) — teaching knowledge base (15 beginner lessons)
- [docs/teacher-kb/00-learning-path.md](docs/teacher-kb/00-learning-path.md) — recommended learning order
- [docs/teacher-kb/14-glossary.md](docs/teacher-kb/14-glossary.md) — plain-language glossary

### Modes & Capabilities
- [docs/LOCAL_MODE.md](docs/LOCAL_MODE.md) — Local Mode reference
- [docs/CLOUD_MODE.md](docs/CLOUD_MODE.md) — Cloud Mode reference and status
- [docs/CLOUD_MODE_ARCHITECTURE.md](docs/CLOUD_MODE_ARCHITECTURE.md) — mode separation architecture
- [docs/MODE_CAPABILITY_MATRIX.md](docs/MODE_CAPABILITY_MATRIX.md) — capability status by mode
- [docs/AUTONOMOUS_TOOL_POLICY.md](docs/AUTONOMOUS_TOOL_POLICY.md) — tool risk tiers and approval design

### Local Foundation
- [docs/LOCAL_FIRST_CONTRACT.md](docs/LOCAL_FIRST_CONTRACT.md) — local-first contract with enforcement points
- [docs/CAPABILITY_MATRIX_PUBLIC_SQUIDLEY.md](docs/CAPABILITY_MATRIX_PUBLIC_SQUIDLEY.md) — capability truth matrix
- [docs/TOOL_MATRIX_PUBLIC_SQUIDLEY.md](docs/TOOL_MATRIX_PUBLIC_SQUIDLEY.md) — tool truth matrix
- [docs/LOCAL_ONLY_TESTING.md](docs/LOCAL_ONLY_TESTING.md) — local-only verification
- [docs/LOCAL_MODEL_SETUP.md](docs/LOCAL_MODEL_SETUP.md) — Ollama and local model setup

### Module Docs
- [docs/LOCAL_CHAT.md](docs/LOCAL_CHAT.md), [docs/VELUM_PUBLIC.md](docs/VELUM_PUBLIC.md), [docs/ARCHIVUM_PUBLIC.md](docs/ARCHIVUM_PUBLIC.md), [docs/FABRICA_PUBLIC.md](docs/FABRICA_PUBLIC.md), [docs/OCULUS_PUBLIC.md](docs/OCULUS_PUBLIC.md), [docs/TABULARIUM_PUBLIC.md](docs/TABULARIUM_PUBLIC.md), [docs/NOUS_PUBLIC.md](docs/NOUS_PUBLIC.md)

## Stack

- Next.js 14 App Router
- React 18
- TypeScript 5
- Tailwind CSS 3
- Vitest

## License

Apache-2.0. See [LICENSE](LICENSE).
