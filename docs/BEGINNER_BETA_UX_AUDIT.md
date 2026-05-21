# Beginner Beta UX Audit — 2026-05-20

> Generated after the terminology and trust-surface polish pass.
> Companion to [UI_LANGUAGE_GUIDE.md](UI_LANGUAGE_GUIDE.md) and
> [PUBLIC_SQUIDLEY_COHERENCE_REPORT_2026-05-20.md](PUBLIC_SQUIDLEY_COHERENCE_REPORT_2026-05-20.md).
>
> Audience: a non-technical first-time AI user. The question every
> finding answers: *would this confuse a beginner in the first ten
> minutes?*

## Headline

Public Squidley's runtime is more honest and more capable than its
UI vocabulary lets on. The biggest gap was not technical safety — it
was nomenclature. Six Latin module names with no inline explanation
made the sidebar read like a "secret AI laboratory" rather than a
beginner's workspace. This pass adds a plain-English primary label
for every nav item; the Latin name stays as a subtitle so the
personality survives without intimidating new users.

The remaining beginner-beta blockers are mostly outside the language
layer: Ollama install friction, lack of inline tutorial pacing, and
the missing Cloud Mode story.

## Method

- Read every page in `src/app/` and the shell in
  `src/components/shell/`.
- Inventoried Latin names, engineering jargon, capability badges,
  approval phrases, and provenance copy. (See the
  [Sidebar Inventory finding](#sidebar-inventory) below.)
- Cross-referenced every visible phrase against the canonical
  vocabulary in [UI_LANGUAGE_GUIDE.md](UI_LANGUAGE_GUIDE.md).
- Re-walked the first-run sequence: home → first chat → first
  approval prompt → first receipt → settings.

## Severity Scale

| Sev | Meaning |
|---|---|
| **S1** | Must fix before beginner beta. Confuses or intimidates almost every first-time user. |
| **S2** | Should fix before beginner beta. Slows comprehension but a determined beginner can recover. |
| **S3** | Nice to improve later. Edge case, advanced surface, or low-frequency confusion. |

## Findings

### S1 · Latin nav labels with no inline meaning *(addressed in this pass)*

**Location:** `src/components/shell/Sidebar.tsx`

**Before:** Sidebar items read "Colloquium", "Fabrica", "Archivum",
"Velum", "Oculus", "Tabularium", "Nous", "Archelon", "Legatus", etc.
None had explanations on hover or below.

**Fix shipped:** Every nav item now uses a friendly primary label
(e.g. "Chat", "Notes", "Safety Check") with the Latin name as a small,
dimmer subtitle. Mobile tab bar uses the friendly label. Tooltips on
every nav item carry the one-line beginner description from
`src/lib/ui/terminology.ts`.

**Residual risk:** Page H1s still use the Latin name. That is
intentional — once a user is on the page, the personality belongs
there. The friendly label and tooltip on the nav are enough to get a
beginner to the right page.

### S1 · Sidebar section labels read like internal release notes *(addressed in this pass)*

**Location:** `src/components/shell/Sidebar.tsx`

**Before:** "Workspace", "System", "Future · public-local",
"Cloud Unlock · locked".

**Fix shipped:** "Use freely", "Settings", "Planned · not built yet",
"Cloud-only · not implemented". A first-time user can now read these
labels and immediately understand what they will and will not be able
to click.

### S1 · "Cloud Unlock" implies you can unlock it now *(addressed in this pass)*

**Location:** Home page, modules page, sidebar.

**Before:** A "Cloud Unlock" section with locked tiles and copy that
hints at "later, after explicit setup".

**Fix planned (this pass starts it):** Renamed sidebar section to
"Cloud-only · not implemented". The home page and modules page still
say "Cloud Unlock"; those are S2-level rewrites tracked below.

### S2 · "deterministic checks" in user copy without definition

**Location:**
- `src/app/velum/page.tsx:163` — badge text "Local-only · deterministic checks · no model call"
- `src/app/settings/page.tsx:381` — "Velum review is deterministic and client-side"

**Recommendation:** Replace `deterministic` with `predictable` or
`pattern-based` in user-visible copy. Tests pin
`Deterministic content review` in
`src/lib/capabilities/registry.ts` — those references must stay; this
fix is only for surface copy.

### S2 · "OpenAI-compatible local backend (llama.cpp)"

**Location:** `src/app/settings/page.tsx:245`

**Recommendation:** Reword to "Local text model server (llama.cpp
variant)" or wrap the existing technical phrase in a clearer parent
sentence. Tests check for the exact existing phrase, so the wording
must keep `OpenAI-compatible local backend (llama.cpp)` somewhere; we
can add a beginner-friendly sentence ABOVE it without removing the
test-required phrase.

### S2 · Capability tier badges without beginner descriptions

**Location:** `src/components/capabilities/CapabilityBadge.tsx`
and consumers.

**Recommendation:** Adopt the
`CAPABILITY_TIER_DESCRIPTIONS` map from
`src/lib/ui/terminology.ts` for every badge label and tooltip. Each
of the six canonical tiers has a one-sentence beginner label and a
short tooltip ready to wire in. Not done in this pass to keep blast
radius small; the data and tests are in place.

### S2 · "Velum is a review helper, not a legal or security guarantee"

**Location:** `src/app/velum/page.tsx` (footer note)

**Recommendation:** Keep the honesty but soften: "Velum is a helpful
text scanner, not a guarantee of safety." Same meaning, less alarming
to a non-technical reader.

### S2 · Risk vocabulary mixes domains

**Location:** Planning + edit panels use `safe | review | elevated |
blocked`. Velum copy uses `low risk | medium risk | high risk`.

**Recommendation:** Standardise on `safe | caution | high-risk |
blocked` across all trust panels. Map values once in
`src/lib/ui/terminology.ts` and adopt everywhere.

### S2 · "Receipt room" reads as lore

**Location:** `src/app/tabularium/page.tsx:126` — H1 says
"Receipt room".

**Recommendation:** Either rename to "Activity log" or pair with a
subtitle. Already addressed at the sidebar level ("Activity Log
(Tabularium)"); page H1 still says "Receipt room" and is S3 risk now
that the nav is friendly.

### S2 · Onboarding pacing

**Location:** First-run wizard, home page.

**Observation:** A beginner needs three things in the first 60 seconds:
(1) "what is this app?", (2) "what can I do right now?", (3) "what
can't I do?". The teacher KB module 15 covers all three, but it is
not surfaced on the home page or the first-run wizard prominently.

**Recommendation:** On the home page, after the existing welcome,
add a "What Squidley can do today" card sourced directly from the
canonical capability list. Three columns: Use freely, Use after
approval, Planned but not running.

### S2 · "Ratio" appears in UI without explanation

**Location:** `src/app/nous/page.tsx`, capability notes.

**Status:** Added to teacher KB glossary in commit `a4dc8cf`. UI
surface still lacks a tooltip. S3 risk now that the glossary is
populated.

### S3 · Home page eyebrow says "Public Squidley · welcome"

**Location:** `src/app/page.tsx:69-71`.

**Recommendation:** Either drop the "Public Squidley ·" prefix on
the home page or fold it into the page metadata. A first-time user
does not need to know they are using the "public" build before they
have used anything.

### S3 · Settings page name "Local Control Center"

**Location:** `src/app/settings/page.tsx:209`.

**Recommendation:** Rename to "Settings" to match the nav. The
descriptive phrase can move into a sub-heading.

### S3 · Ollama install friction

**Status:** Outside the language layer. The packaging plan
(Phase 2) addresses this with an Electron-bundled installer flow.

## Trust-Breaking Moments Found

| Moment | Severity | Notes |
|---|---|---|
| Sidebar of Latin names with no inline meaning | S1 | Fixed |
| Section labels reading like changelog entries | S1 | Fixed |
| "Cloud Unlock" suggesting unlock-via-payment | S1 | Sidebar fixed; modules+home page pending |
| Risk-level vocabulary mismatch across panels | S2 | Pending |
| `deterministic` in surface copy without definition | S2 | Pending |
| Velum footer reads as legal disclaimer | S2 | Pending |
| Approval card copy is good as-is | n/a | Verified |
| Honesty corrections are good as-is | n/a | Verified |
| Provenance footer is good as-is | n/a | Verified |

## Sidebar Inventory

Captured pre-fix as a reference. Every row now has a friendly label
in `src/components/shell/Sidebar.tsx`.

| Nav item | Was | Now (friendly) | Now (subtitle) |
|---|---|---|---|
| Home | Welcome | Welcome | — |
| /colloquium | Colloquium | Chat | Colloquium |
| /fabrica | Fabrica | Code Helper | Fabrica |
| /archivum | Archivum | Notes | Archivum |
| /archivum?focus=more-input | More Input | More Input | Archivum (capture) |
| /velum | Velum | Safety Check | Velum |
| /oculus | Oculus | Image Review | Oculus |
| /tabularium | Tabularium | Activity Log | Tabularium |
| /nous | Nous | System Map | Nous |
| /modules | Modules | Modules | — |
| /settings | Settings | Settings | — |
| /modules#archelon | Archelon | Memory | Archelon |
| /modules#legatus | Legatus | Agent Workflows | Legatus |
| /modules#probatio | Probatio | Model Evaluator | Probatio |
| /modules#imperium | Imperium | Advanced Control | Imperium |
| /modules#imaginanium | Imaginanium | Image Generation | Imaginanium |

## What Remains Intentionally "Advanced Mode"

These are NOT bugs. They are deliberate personality / honesty:

- Page H1s still use Latin names. A user who clicked "Safety Check
  (Velum)" sees a page titled "Velum" with its own personality. That
  is the lore continuing on the destination page, not on the door.
- Receipts retain the technical action vocabulary
  (`editing.proposed`, `inspection.requested`, etc.). Receipts are an
  audit surface, not a beginner-comprehension surface.
- The capability matrix legacy `classification` field (LOCAL_READY,
  LOCAL_PARTIAL, NOT_IMPLEMENTED, CLOUD_REQUIRED) is preserved next
  to `canonicalTier`. Old tooling and scripts still read it; UIs
  read the canonical tier and friendly description.
- Honesty corrections quote the model's claim verbatim, which can
  read as awkward. That awkwardness is the point — the user sees
  exactly what the model said before the correction.

## Beginner Beta Blockers

Must fix before shipping a beginner-targeted beta:

1. **Onboarding pacing** — a home-page "what you can do today" card
   sourced from the canonical capability list.
2. **Capability badge wording** — wire
   `CAPABILITY_TIER_DESCRIPTIONS` into `CapabilityBadge`.
3. **Risk vocabulary** — pick one of `safe | caution | high-risk |
   blocked` and adopt across planning + edit + velum.
4. **Cloud Unlock language** — rename on the modules + home page to
   "Cloud-only · not implemented yet" (sidebar already fixed).
5. **Ollama install assistant** — packaging plan phase 2.
6. **Beginner test with a non-technical reader** — the only way to
   confirm the language now feels approachable.

## Nice to Improve Later

- Page H1 friendly subtitle (optional).
- "Receipt room" → "Activity log" on the Tabularium H1.
- Drop the "Public Squidley ·" eyebrow on first-time visitors.
- Add an "Advanced mode" toggle in Settings that reveals the
  technical classifications and the Latin names in primary positions.

## Verification

- `npm run typecheck` — clean.
- `npx vitest run` — full suite passing (including the new
  terminology contract test).
- `npm run diagnostic` — 0 failures.
- `npm run verify:capabilities` — 0 failures.
- `npm run prove:local-only` — PASS.

## Cross-Reference

- Canonical vocabulary source: `src/lib/ui/terminology.ts`
- Language guide: [UI_LANGUAGE_GUIDE.md](UI_LANGUAGE_GUIDE.md)
- Taxonomy: [CAPABILITY_TAXONOMY.md](CAPABILITY_TAXONOMY.md)
- Prior coherence report:
  [PUBLIC_SQUIDLEY_COHERENCE_REPORT_2026-05-20.md](PUBLIC_SQUIDLEY_COHERENCE_REPORT_2026-05-20.md)
- Release readiness scorecard:
  [RELEASE_READINESS_SCORECARD_2026-05-20.md](RELEASE_READINESS_SCORECARD_2026-05-20.md)
