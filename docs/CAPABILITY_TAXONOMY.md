# Peh Capability Taxonomy

> Canonical vocabulary for describing what Peh can and cannot do.
> Every doc, matrix, lesson, UI label, and runtime badge MUST use these
> tiers consistently. If a surface uses a different word, it is wrong
> and should be updated to match this file.

## Why a Taxonomy

Beginners cannot tell the difference between "planned", "partial",
"limited", "in progress", and "not implemented" unless we pin those
words to specific behaviors. This taxonomy fixes the meaning of each
tier so docs, runtime, and UI describe the same system.

## The Six Tiers

### 1. `LOCAL_READY`
Implemented, validated, runs on the user's machine, no approval needed
for the read-only or pure-text path. Beginners can use it on day one.

Includes:
- Local chat (Colloquium) — Ollama validated end-to-end
- Teacher mode — deterministic concept Q&A, no model needed
- Structured planning — deterministic, evidence-backed, never executes
- Provenance footer — every reply says what produced it
- Receipts (Tabularium) — browser-local audit log
- Notes (Archivum) — browser-local notes with tags
- Local diagnostics (Nous, health, model listing)
- Deterministic prompt review (Velum) — heuristic, not guaranteed safety
- Honesty annotation — detects hallucinated tool claims in replies

Implication: appears in the UI without warnings beyond the standard
local-only provenance footer.

### 2. `LOCAL_LIMITED`
Implemented, runs locally, but bounded by **hard scope limits and
explicit per-action approval**. Beginners can use it, but only after
seeing a clear approval prompt and the exact scope of the action.

Includes:
- **Approval-gated file inspection** — read one file at a time, ≤256 KB,
  path inside project root, secrets redacted, time-limited token, no
  write
- **Approval-gated tiny edits** — replace exactly one snippet (4 KB max
  diff) in one already-inspected file, hash-bound approval, in-memory
  backup, automatic rollback on verification failure
- **Local image analysis (Oculus)** — works only with a vision-capable
  local model (Ollama vision), refuses non-vision models clearly

Implication: every use SHOWS the approval gate, scope, and what the
user is authorising. Receipts record both the request and the outcome.

### 3. `LOCAL_PARTIAL`
Implemented locally but quality, coverage, or backend support is
limited. Peh says this honestly when the limitation matters.

Includes:
- **Small-model reliability layer** — bounded compound-tool runs for
  small local models (max 6 steps, max 2 retries, no shell, no write)
- **llama.cpp / llama-server backend** — code path exists and unit tests
  pass via OpenAI-compatible endpoint, real binary validation pending
- **Single-file code suggestion (Fabrica)** — suggestion only, no file
  write; quality scales with local model size
- **Advanced planning** — full structure exists; produces good plans on
  7B+ models, weaker plans on small models

Implication: UI surfaces the limitation in plain words and, when
relevant, downgrades confidence labels (Ratio).

### 4. `CLOUD_PLANNED`
Architecture exists in the codebase (registry entries, type shapes,
mode resolver hooks) but **no adapter, no API call path, and no test
coverage of a real cloud round trip**. Cannot run, even if API keys
are configured.

Includes:
- All cloud providers (OpenAI, Anthropic, Google Gemini, OpenRouter,
  Minimax, Z.ai) — registered as `NOT_IMPLEMENTED` in the cloud
  registry
- Cloud chat, streaming, and provenance — typed but not wired
- Cloud escalation offers — reliability layer can suggest escalation;
  it cannot run the call
- Advanced cloud-only capabilities (multi-file build, agent workflows,
  cloud vision, cloud image generation, model evaluation, policy
  control, high-trust control)

Implication: every cloud-related UI surface says "not implemented
yet" in the same words ("Cloud Mode is not implemented yet."). API
keys alone NEVER unlock Cloud Mode. Setting `PEH_MODE=cloud`
changes the mode badge but no cloud feature works.

### 5. `NOT_IMPLEMENTED`
No code path of any kind. Not blocked by policy, simply not built.
These will not arrive on the local roadmap; they are either cloud
work or future work.

Includes:
- Shell execution (any form)
- Web search / web browsing
- Autonomous loops / multi-step agent execution without approval
- Multi-file editing
- General filesystem read/write (`fs.write`, `fs.delete`,
  `fs.move`, project-wide read)
- Memory write (Archelon)
- Document parsing
- Package install
- Git commit / git operations
- Sending email / external messages
- Image generation

Implication: the honesty annotator overrides any model claim that
Peh did one of these. UI says "this build does not have an X
tool" with a one-line reason.

### 6. `BLOCKED`
Refused by design and enforced by the type system or runtime guards.
Will not appear, even if a future feature could theoretically enable
them, without an explicit architectural change.

Includes:
- **Unrestricted filesystem access** — file inspection is path-bound,
  approval-bound, single-file, size-capped; broader access is rejected
- **Hidden cloud calls** — `cloudUsed: false` is a literal type, not
  a boolean; cloud mode requires explicit `PEH_MODE=cloud`
- **Silent tool execution** — every tool action must produce a receipt;
  no result is returned without one
- **Destructive operations during planning** — the planner returns
  zero executable steps for delete/remove/deploy intent
- **Cloud fallback on local failure** — there is no fallback; failures
  surface with beginner-friendly error copy

Implication: these are CONTRACTS, not roadmap items. If a future
release wants to relax one, it must show up as a separate explicit
proposal.

## Machine-Readable Source of Truth

This file is the canonical vocabulary. The machine-readable expression
of the taxonomy lives in two JSON files:

- `docs/capability-matrix.public-peh.json` — every capability,
  with `canonicalTier` (one of the six tiers below), legacy
  `classification` field for diagnostic backward compatibility, and
  per-row proof references / tests / receipts.
- `docs/tool-matrix.public-peh.json` — every tool surface, with
  `canonicalTier`, legacy `publicLocalStatus`, scope limits, and
  approval requirements.

Both files declare a `canonicalTiers` block at the top so consumers
can validate the vocabulary at load time. The Markdown views
(`docs/MODE_CAPABILITY_MATRIX.md`, `docs/CAPABILITY_MATRIX_PUBLIC_SQUIDLEY.md`,
`docs/TOOL_MATRIX_PUBLIC_SQUIDLEY.md`) are projections of the JSON; when
the two disagree, **the JSON wins** and the Markdown should be updated.

Validation:

- `npm run verify:capabilities` runs `scripts/verify-capabilities.mjs`
  which validates both matrices end to end.
- `src/lib/capabilityMatrixTaxonomy.test.ts` (vitest) asserts the
  contract on every test run.
- `npm run diagnostic` re-asserts the diagnostic-level invariants
  (proof references, no llama-cpp LOCAL_READY without smoke proof,
  tool-matrix consistency).
- `npm run verify:release` chains all of the above.

## How to Map Existing Vocabulary

Older docs and JSON matrices use slightly different terms. Use this
crosswalk during rewrites:

| Older term used in docs | Canonical tier |
|---|---|
| READY | `LOCAL_READY` |
| PARTIAL (quality-limited) | `LOCAL_PARTIAL` |
| PARTIAL (scope-limited by approval) | `LOCAL_LIMITED` |
| NOT_IMPLEMENTED (cloud, has registry entry) | `CLOUD_PLANNED` |
| NOT_IMPLEMENTED (truly missing) | `NOT_IMPLEMENTED` |
| CLOUD_REQUIRED / CLOUD_OPTIONAL / locked | `CLOUD_PLANNED` |
| LOCAL_BLOCKED | `BLOCKED` if by design, else `NOT_IMPLEMENTED` |
| MOCK_DEMO_ONLY | `NOT_IMPLEMENTED` (only registry shell exists) |

The `capability-matrix.public-peh.json` and
`tool-matrix.public-peh.json` retain their internal `classification`
field for backwards compatibility with the diagnostic, but every doc
that summarises them should translate to the six canonical tiers.

## Rules for Every Capability Row

When describing any capability in a doc, matrix, lesson, or UI label,
answer these seven questions explicitly:

1. **Available?** — yes / no / approval-gated
2. **Local or cloud?** — local / cloud / mixed
3. **Approval required?** — never / per-action / once-per-session
4. **Deterministic?** — yes / partially / no (model-dependent)
5. **Experimental?** — yes / no
6. **Beginner-safe?** — yes / yes-after-approval / no
7. **Production ready?** — yes / subsystem-only / no

The matrix tables in [MODE_CAPABILITY_MATRIX.md](MODE_CAPABILITY_MATRIX.md)
follow this exact column structure.

## Words to Avoid in User-Facing Copy

The following words make beginners feel locked out or imply more
autonomy than Peh has. Use them only in technical / advanced
docs, never in onboarding, UI labels, or teacher lessons:

- "agentic"
- "orchestration"
- "execution graph"
- "runtime substrate"
- "substrate"
- "deterministic" (in UI without a one-line definition)
- "subsystem" (only in technical docs)

Acceptable replacements:

| Avoid | Use instead |
|---|---|
| agentic behaviour | what Peh can actually do |
| orchestration layer | how Peh plans steps |
| execution graph | the plan |
| runtime substrate | the part of Peh that runs your request |
| deterministic | predictable; no guessing |
| subsystem | part of Peh |

## Standard Phrases (Use Verbatim)

To keep cross-surface wording consistent, always use these phrases:

- Cloud not implemented: **"Cloud Mode is not implemented yet."**
- Build identifier (when distinguishing from future features):
  **"this public Peh build"**
- Provenance footer: **"answered by local model only · no tool used ·
  no cloud used"** (or the structured form `Local Mode / model_name /
  no cloud / no tool`)
- Approval prompt (file inspection): **"Approve and read once"**
- Approval prompt (tiny edit): **"Approve this edit"**
- After approval (inspection): **"Approved. Peh is reading the
  file once and will not change it."**
- After approval (edit): **"Approved. Peh is applying the edit
  and verifying it now."**
- After decline: **"Declined. The file was not read."** /
  **"Declined. No edit was applied."**

Future PRs that introduce a new user-facing phrase for any of these
flows should update this list first, then change every surface that
uses the phrase.
