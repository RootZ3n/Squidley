# Public Peh Coherence Report — 2026-05-20

> Generated after the reliability / planning / approval-gated inspection /
> approval-gated tiny-edit commits (7f29267 → a44927d) shifted what the
> runtime can actually do. The goal of this pass was to make every surface
> describe the same system.

## Headline Finding

The runtime has **gained four shipped subsystems** since the last
matrix update, but the user-facing docs were still describing the
prior product. The mismatch was an UNDERCLAIM, not an overclaim:

- Approval-gated narrow file inspection (read-only, 256 KB cap, path-
  bound token) — exists; the matrix said "File Read: NOT_IMPLEMENTED".
- Approval-gated tiny edit workflow (single snippet, 4 KB max diff,
  rollback on verify-fail) — exists; the matrix said "File Write:
  NOT_IMPLEMENTED".
- Structured planning + provenance — exists; not in the matrix at all.
- Small-model reliability layer (bounded compound tools) — exists;
  not in the matrix at all.

The new tier `LOCAL_LIMITED` in
[CAPABILITY_TAXONOMY.md](CAPABILITY_TAXONOMY.md) is what was missing.
With it, the matrix can describe what is true: Peh has narrow,
approval-gated tool execution today, while shell / web / multi-file /
autonomous loops remain `NOT_IMPLEMENTED`.

## Method

Three independent reads were performed:

1. **Docs** — every release plan, matrix, mode doc, and audit file in
   `docs/`. Looked for capability claims and "agentic"/"orchestration"/
   "execution graph"/"runtime substrate" jargon.
2. **Runtime** — `src/lib/mode`, `src/lib/providers`, `src/lib/chat`,
   `src/lib/planning`, `src/lib/editing`, `src/lib/reliability`,
   `src/lib/teacher`, `src/lib/capabilities`. Looked at what the code
   actually does, what it refuses, and what is type-enforced.
3. **Teacher KB + UI** — every teacher-kb module, every page in
   `src/app/`, the approval and provenance copy. Looked at language
   consistency and beginner comprehension.

Findings below are bucketed per the requested categories.

## Truthful

- Cloud Mode is correctly described everywhere as "architecture only,
  not implemented." `cloudRegistry.ts` lists every provider as
  `NOT_IMPLEMENTED`. The diagnostic enforces this.
- `PUBLIC_RELEASE_READY = false` is enforced by tests, README, and
  release plan in lockstep.
- The honesty annotator is real, well-tested (21 unit + 8 integration
  + 3 contract tests), and visible in the UI as a correction note.
- Provenance footer (`answered by local model only · no tool used ·
  no cloud used`) appears on every reply; the diagnostic grep-checks it.
- `cloudUsed: false` and `localOnly: true` are literal types in
  planning, reliability, editing, and inspection result types — not
  booleans that could be flipped at runtime.
- Egress guard, local-only proof, and "API keys alone do not unlock
  cloud" are all true and tested.
- LOCAL_FIRST_CONTRACT.md is enforcement-anchored to specific code
  paths.

## Outdated (before this pass)

- `docs/MODE_CAPABILITY_MATRIX.md` predated the four new subsystems.
  It said "File Read/Write: NOT_IMPLEMENTED" when narrow approval-gated
  read and tiny-edit write existed. **Fixed in this pass.**
- `docs/PUBLIC_PEH_RELEASE_PLAN.md` Phase 4 read "NOT STARTED"
  even though narrow approval-gated file inspection and tiny edits
  are shipped. **Updated to "PARTIAL — narrow approval-gated subset
  shipped" in this pass.**
- `docs/teacher-kb/07-approvals-and-risk.md` described approvals as
  aspirational; in reality there are working per-action approval gates
  for inspection and tiny edits, with token TTLs and hash binding.
  **Updated in this pass.**
- `docs/teacher-kb/00-learning-path.md` did not mention what Peh
  can do TODAY beyond chat. **New module 15 added.**
- README "What Is Built Today" did not include planning, reliability,
  inspection, or tiny edits. **Updated in this pass.**
- Capability matrix JSON did not have rows for planning, reliability,
  inspection, or tiny edits. (See "Remaining work" below — schema
  additions are out of scope for this pass to keep the diagnostic
  green; the markdown matrix captures the canonical view.)

## Misleading (before this pass)

- "Tool execution: NOT STARTED" implied no tool execution exists at
  all. In fact, narrow approval-gated tool execution does exist; only
  the broad surface (shell, web, multi-file) does not. **Fixed by
  introducing `LOCAL_LIMITED` tier.**
- "First Autonomous Workflow" in `BEGINNER_ONBOARDING_DESIGN.md` reads
  as a near-term step. It is not; Phase 5 is unstarted. **Flagged in
  the report; the design doc itself is unimplemented and explicitly
  labelled as a requirement, but the term "first" could mislead a
  scanning reader.**
- `TEACHER_FIRST_DOCTRINE.md` describes a fully-realized teaching
  subsystem; only the architecture + integration + polish layer ships.
  Self-explanation and onboarding-runtime are not. **Acceptable as a
  doctrine document but should be cross-linked to current status.**

## Underspecified (before this pass)

- No single canonical taxonomy. Different docs used READY / PARTIAL /
  NOT_IMPLEMENTED / CLOUD_REQUIRED / CLOUD_OPTIONAL with overlapping
  meanings. **Fixed by [CAPABILITY_TAXONOMY.md](CAPABILITY_TAXONOMY.md).**
- "Tool" was used both for action tools (file write) and for
  informational probes (model list, health). **Flagged; the JSON tool
  matrix continues to use both, but the markdown matrix now separates
  approval-gated actions from informational reads.**
- "Honesty annotation" was variously called "honesty correction",
  "honesty message", "honesty annotator". **Standardised in the
  taxonomy: "honesty correction" is the user-facing term;
  `honestyAnnotation.ts` keeps its filename.**

## Overclaiming (before this pass)

- None severe. The repo does not contain any of the absolute-safety
  phrases blocked by `src/lib/heuristicHonesty.test.ts` and the
  diagnostic's `RELEASE_FORBIDDEN` scan. The exact blocklist lives in
  that file; we do not restate it here so this report itself stays
  inside the scan's no-overclaim window.
- One soft overclaim risk: `TEACHER_FIRST_DOCTRINE.md` reads as
  current state; cross-link to phase status should make clear which
  pieces ship and which are aspirational. **Recommended, not blocking.**

## Missing Warnings (before this pass)

- Cloud Mode `READY for receipts` in the old matrix had no caveat.
  The truth is "infrastructure ready, no cloud data to record yet."
  **Removed from the new matrix — receipts are local-only in this
  build, so they appear once under LOCAL_READY.**
- Real `llama-server` binary is unvalidated; the matrix said so in
  text but did not surface it as a per-row tier. **New matrix marks
  llama.cpp `LOCAL_PARTIAL` with "pending real-binary validation" in
  the production-ready column.**
- "Velum review" surfaced in the UI as just "deterministic checks".
  Beginners do not know what deterministic means. **Glossary updated;
  the taxonomy bans bare "deterministic" in user-facing copy.**

## Inconsistent Terminology

| Concept | Variants found | Canonical (see TAXONOMY) |
|---|---|---|
| Honesty correction | honesty annotation / message / correction | "honesty correction" in UI; filenames unchanged |
| Build identifier | this build / this public version / this public local build | "this public Peh build" |
| Provenance footer | "answered by local model only" / "Local Mode / X / no cloud" | both allowed; first is the short form, second the structured form |
| Cloud unavailability | "not implemented" / "not yet implemented" / "planned / not implemented" | "Cloud Mode is not implemented yet." |
| Approval phrase | mixed | "Approve and read once" (inspection); "Approve this edit" (tiny edit); "Decline" (both) |

## Beginner Comprehension Gaps Found

- "Velum" and "Tabularium" appear as bare nav items with no inline
  intro. The glossary explains them, but a first-time user clicking
  Velum sees a page they cannot place.
- "Ratio" appears in the Nous page without a glossary entry. **Added
  to the glossary in this pass.**
- "Deterministic" appears in Velum and Settings copy without
  definition. **Glossary entry added; taxonomy bans bare use.**
- Onboarding design talks about "First Autonomous Workflow" as if it
  ships. It does not.

## UI Standards Found Mostly Consistent

- Approval phrasing is uniform across inspection and edit panels.
- Honesty correction language uses "Peh did not …" everywhere it
  appears — no false "I did" found.
- Every blocked action explains WHY in beginner-readable language.
- Every cloud-related UI surface says "not implemented" clearly.

## Top 10 Concrete Fixes Applied in This Pass

1. New canonical taxonomy at [docs/CAPABILITY_TAXONOMY.md](CAPABILITY_TAXONOMY.md).
2. `docs/MODE_CAPABILITY_MATRIX.md` rewritten with seven-question
   columns and new `LOCAL_LIMITED` tier rows for inspection, tiny
   edits, and image analysis.
3. README "What Is Built Today" expanded to include planning,
   reliability, inspection, and tiny edits (test-required phrases
   preserved).
4. `docs/PUBLIC_PEH_RELEASE_PLAN.md` Phase 4 status corrected to
   "PARTIAL — narrow approval-gated subset shipped".
5. New teacher lesson
   [docs/teacher-kb/15-what-peh-can-do-today.md](teacher-kb/15-what-peh-can-do-today.md)
   describing the actual current surface for beginners.
6. `docs/teacher-kb/07-approvals-and-risk.md` updated to describe
   real (not aspirational) approval gates and to name the two flows
   (file inspection, tiny edits).
7. `docs/teacher-kb/14-glossary.md` extended with Ratio, Planning,
   Reliability layer, Inspection, Tiny edit, Deterministic, Approval
   token.
8. `docs/teacher-kb/00-learning-path.md` and
   `docs/teacher-kb/manifest.json` updated to register module 15.
9. New
   [docs/RELEASE_READINESS_SCORECARD_2026-05-20.md](RELEASE_READINESS_SCORECARD_2026-05-20.md)
   with brutally honest scores across four release targets.
10. This report itself — a snapshot of what was misaligned and what
    was fixed.

## Remaining Work (Not Done in This Pass)

These are deliberate scope-cuts, not oversights. The user constraint
was "Do NOT add major new capabilities" — these are catalogue work,
not capability work.

- `docs/capability-matrix.public-peh.json` — add explicit rows
  for `planning`, `reliability`, `inspection`, `tiny-edit`. The
  diagnostic does NOT require these, but a future maintainer should
  add them so the JSON is the single source of truth.
- `docs/tool-matrix.public-peh.json` — same.
- UI copy edits to add tooltips to "Velum" and "Tabularium" nav links.
  Recommended but not load-bearing; the in-page copy is fine.
- `BEGINNER_ONBOARDING_DESIGN.md` — relabel the "First Autonomous
  Workflow" step to "Future graduated workflow example" so a scanning
  reader does not assume it ships.
- `TEACHER_FIRST_DOCTRINE.md` — add a "current vs aspirational" key
  near the top so the doctrine document is not mistaken for status.

## Suggested Roadmap After This Coherence Pass

Ordered by what reduces remaining risk fastest:

1. **Beginner UX hardening** — tooltips for Latin names, "what does
   Peh do?" panel on the home page, friendlier first-run.
2. **Cloud Mode prototype (Phase 3, narrow slice)** — pick one cloud
   provider (Anthropic or OpenAI), implement the adapter end-to-end,
   wire consent + receipts. This is the next coherence-critical work
   because Cloud Mode is the largest "planned but dead" surface.
3. **Real `llama-server` smoke** — produce
   `reports/llama-server-smoke/PROOF.json` and upgrade llama.cpp from
   `LOCAL_PARTIAL` to `LOCAL_READY` for the text path.
4. **Expand approval-gated edits to "add a single new file"** — same
   safety contract, no broader surface.
5. **Implement Phase 5 (autonomous workflows) only after Phase 3
   ships** — autonomy without cloud is not a beginner-safe story.
6. **Beta testing with a non-technical reader** — the docs are
   honest now, but the only way to confirm beginner comprehension is
   to test with a beginner.

## Verification Performed

- `npx tsc --noEmit` — passes (no source changes).
- `npx vitest run` — passes; no doc-content changes broke the
  README / release-plan / capability-matrix grep tests.
- `node scripts/public-peh-diagnostic.mjs` — passes; matrix
  still contains `localModeStatus` / `cloudModeStatus`, README still
  contains required phrases, no overclaims introduced.
- `node scripts/prove-local-only.mjs` — passes; no runtime change.

The new docs use no phrases on the heuristic-honesty blocklist.
