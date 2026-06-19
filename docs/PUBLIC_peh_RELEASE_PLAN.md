# Peh Release Plan

## Product Status: NOT RELEASE READY

Peh is not yet ready for public release. Local Mode is an audited
subsystem, but the full product requires Cloud Mode, a teaching layer, tool
execution, autonomous workflows, and beginner onboarding before it can ship.

Local Mode alone is not the product. The product is a beginner-friendly teaching
agent that starts users locally, teaches them how agents work, explains every
part of her own system, and then graduates them into Cloud Mode where she becomes
a fully capable autonomous agent.

## Release Phases

### Phase 1 — Local Foundation
**Status: COMPLETE (subsystem-ready; product not yet ready to ship)**

What it includes:
- Local model chat (Ollama, llama-cpp)
- Streaming chat with provenance footer
- Local-only egress proof (static + dynamic)
- Egress guard (rejects non-local endpoints)
- Capability and tool honesty matrices
- Honesty annotation for hallucinated tool claims
- Response provenance on every answer
- Mode resolver (local/cloud separation)
- Cloud provider registry (all NOT_IMPLEMENTED)
- Mode-aware capability and tool registries
- Escalation policy (no cloud in local mode)
- Structured planning + provenance layer (deterministic, no execution)
- Small-model reliability layer (bounded compound tools, max 6 steps,
  literal-type cloudUsed:false)
- Diagnostic, gauntlet, and release verification scripts

Note: "Phase 1 complete" means the local-foundation subsystem is
ready. It does NOT mean the product is ready. See
[CAPABILITY_TAXONOMY.md](CAPABILITY_TAXONOMY.md).

What it proves:
- Local model chat works end-to-end
- No cloud calls in default mode
- No silent tool execution
- API keys alone do not unlock cloud
- Model hallucinations are detected and corrected
- Every response says what produced it

What it does NOT prove:
- Cloud Mode works
- Tools work
- Peh can teach beginners
- Peh can explain herself
- The product is ready for a user with zero experience

### Phase 2 — Teaching Layer
**Status: IN PROGRESS (Phase 2A/B/C complete — architecture + integration + polish)**

Phase 2A (architecture): Concept registry, lesson curriculum, knowledge base,
runtime hooks, onboarding stages, self-explanation engine. COMPLETE.

Phase 2B (integration): Teacher chat detection, teacher API routes, onboarding
UI page, concept glossary UI, runtime hook explanations, chat route wiring.
COMPLETE.

Phase 2C (polish): First-run onboarding wizard, teach-while-chatting setting,
in-context teaching cards, explain-this helpers, zero-experience simulation
tests (74 tests), beginner progress with localStorage persistence. COMPLETE.

Remaining: Colloquium UI inline teaching card rendering, teach-while-chatting
annotations in stream responses, polished mobile onboarding experience.

What it requires:
- Beginner onboarding flow (welcome, setup, first chat, limitations)
- Concept explanations:
  - "What is a local model?"
  - "What is a cloud provider?"
  - "What is an agent?"
  - "What are tools?"
  - "What are approvals?"
  - "What are receipts?"
- Guided local setup (install Ollama, pull model, verify)
- Guided first local chat
- Explanation of local limitations ("why Peh can't write files yet")
- Self-explanation system (Peh can answer questions about herself)
- Teacher-first doctrine enforced in UI copy

Why it matters:
- A beginner with no AI experience must be able to understand Peh
- Peh must explain what she can and cannot do before the user asks
- Teaching is the core differentiator, not just capability

### Phase 3 — Cloud Mode Foundation
**Status: NOT STARTED**

What it requires:
- Cloud provider adapters (OpenAI, Anthropic, OpenRouter at minimum)
- Provider setup wizard in UI
- API key education ("what is an API key?", "what does it cost?")
- API key storage guidance (never in browser localStorage, use env vars)
- Cloud consent flow (explicit user approval before any cloud call)
- Cloud chat and streaming through provider adapters
- Cloud receipts (every cloud call recorded in Tabularium)
- Cloud provenance (mode=cloud, provider, model, cloudCalled visible)
- Cost and usage warnings
- Cloud safety boundaries (Velum review before sending content to cloud)

Why it matters:
- Cloud Mode is where Peh becomes a fully capable agent
- Without cloud adapters, Cloud Mode is just architecture
- Users must understand cost, privacy, and provider differences before using cloud

### Phase 4 — Tool Execution
**Status: PARTIAL — narrow approval-gated subset shipped**

Already shipped (LOCAL_LIMITED in the
[capability taxonomy](CAPABILITY_TAXONOMY.md)):
- **Approval-gated file inspection** — one file at a time, ≤256 KB,
  path-bound 10-minute token, secrets redacted before model context.
  Source: `src/lib/reliability/safeFileInspection.ts`,
  `src/lib/reliability/fileApproval.ts`,
  `src/lib/reliability/fileSafety.ts`.
- **Approval-gated tiny edits** — one snippet, one file, ≤4 KB diff,
  approval bound to four hashes (path, original, proposed, current
  file), in-memory backup, automatic rollback on verification failure.
  Source: `src/lib/editing/apply.ts`, `approval.ts`, `safety.ts`,
  `verifier.ts`.
- **Receipts for every approval-gated action** — Tabularium emits
  request, approval, apply, verification, rollback receipts.
- **Honesty annotation override** — any model claim of unsupported
  tool action (write/read outside the gates, shell, web, etc.) is
  corrected in the user-visible reply.

Still required (NOT_IMPLEMENTED today):
- General file read tool (broader than narrow inspection)
- General file write tool (broader than narrow tiny edits)
- File delete / file move
- Project/repo inspection (multi-file)
- Document parsing
- Web search / browsing
- Memory write
- Shell command proposal and execution
- Multi-file editing
- Package install, git operations, sending data externally

Why the partial split exists:
- Beginners can already inspect a file and apply a tiny edit safely.
- The full set of tools requires Cloud Mode for quality and a much
  larger approval-and-receipt surface than this build offers.
- Shipping narrow tools first gives the approval contract a real
  workout before scope expands.

Phase 4 does NOT close until the items listed under "Still required"
ship with the same per-action receipt + honesty-annotator coverage
that the narrow flows have today.

### Phase 5 — Autonomous Agent Workflows
**Status: NOT STARTED**

What it requires:
- Task planning (break complex requests into steps)
- Multi-step execution with progress tracking
- Approval checkpoints at phase boundaries
- Rollback and failure honesty ("this step failed, here is why")
- Agent receipts for full workflow audit
- "Teach while doing" mode (explain each step as it happens)
- Beginner-safe autonomy (conservative defaults, clear warnings)

Why it matters:
- Autonomous workflows are the end-state product goal
- Users must understand what Peh is doing at each step
- Failures must be honest, not hidden
- Peh must be competitive with other agents when Cloud Mode is enabled

### Phase 6 — Release Candidate
**Status: FUTURE**

Requirements for public release:
- All phases 1-5 complete
- All beginner teaching flows implemented and tested
- Local/cloud capability matrix accurate and honest
- Onboarding tested with zero-experience users
- All diagnostics green
- All gauntlets pass
- No overclaims in docs, UI, or code
- User can understand the system with zero prior AI experience
- Autonomous workflow smoke test passes
- Local-to-cloud graduation flow works end-to-end
- Peh can hold her own against comparable agents in Cloud Mode

## What "Release Ready" Means

Peh is release-ready when a person who has never used an AI tool
before can:

1. Install Peh
2. Understand what it is and what it does
3. Run a local chat and understand the limitations
4. Learn what cloud providers are and why they matter
5. Safely enable Cloud Mode with a provider
6. Use tools with approval gates
7. Understand receipts and provenance
8. Trust that Peh is honest about what she did and did not do
9. Graduate from beginner to confident agent user

Until all of that works, the product is not ready to ship publicly.
