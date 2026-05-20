# Public Squidley — Release Readiness Scorecard

> Date: 2026-05-20. Following the coherence pass and reconciliation
> against the four new shipped subsystems (planning, reliability,
> approval-gated inspection, approval-gated tiny edits).
>
> Scores are brutally honest. They are not advertising. Anything
> below 7 / 10 means the release target it sits under is not safe to
> hit yet.

## Rubric (each dimension scored 0–10)

- **Local reliability** — does the local path actually work for the
  kinds of questions a beginner asks?
- **Onboarding clarity** — can a brand-new user understand what
  Squidley is in their first session?
- **Capability honesty** — does every surface describe the same
  system?
- **Docs accuracy** — would a reader of the docs build correct
  expectations about runtime?
- **Teacher quality** — does the teaching layer answer beginner
  questions usefully?
- **Safety posture** — type-level invariants, approval gates,
  egress, receipts.
- **Deterministic behaviour** — are the load-bearing parts (gates,
  receipts, refusals) deterministic and tested?
- **Beginner comprehension** — would a non-technical reader follow
  the language?
- **Test coverage** — do the tests prove the contracts?
- **Trustworthiness** — would a careful reader trust Squidley not
  to do something unexpected?

## Scores by Release Target

### Internal Dev (the team uses it daily)

| Dimension | Score | Notes |
|---|---|---|
| Local reliability | 9 | Ollama validated end-to-end; small models bounded |
| Onboarding clarity | 8 | Wizard exists; in-context cards work |
| Capability honesty | 9 | Reconciled in this pass |
| Docs accuracy | 9 | Matrix, README, release plan now match runtime |
| Teacher quality | 8 | 30+ concepts, 14 lessons, 21 hooks, 12 onboarding stages |
| Safety posture | 9 | Type-level cloudUsed false; receipts on every action |
| Deterministic behaviour | 9 | Planner, gates, refusals are pure |
| Beginner comprehension | 8 | Glossary expanded; jargon mostly absent in UI |
| Test coverage | 9 | 1584+ tests; honesty + release safety contracts |
| Trustworthiness | 9 | Behavior matches docs after this pass |

**Verdict: READY** for internal use. This is what the team gets today.

### Technical Beta (engineers, researchers, dev-adjacent users)

| Dimension | Score | Notes |
|---|---|---|
| Local reliability | 9 | Small-model reliability layer handles the rough edges |
| Onboarding clarity | 8 | Latin names on nav still need tooltips |
| Capability honesty | 9 | New taxonomy makes scope obvious |
| Docs accuracy | 9 | Matrix is canonical; release plan honest |
| Teacher quality | 8 | Useful; could use a "what does it do today?" landing page |
| Safety posture | 9 | All approval flows enforced |
| Deterministic behaviour | 9 | Planner is type-enforced |
| Beginner comprehension | 7 | Technical users self-correct; non-technical still struggle with Velum/Tabularium naming on nav |
| Test coverage | 9 | Strong |
| Trustworthiness | 9 | Refusals are honest, not silent |

**Verdict: READY** with the caveat that the audience must be
technical. Approval-gated inspection / tiny edits behave well under
power-user scrutiny.

### Beginner Beta (non-technical first-time AI users)

| Dimension | Score | Notes |
|---|---|---|
| Local reliability | 8 | Needs Ollama install; small-model layer helps |
| Onboarding clarity | 6 | Wizard works but Latin module names still surface |
| Capability honesty | 9 | Fixed in this pass |
| Docs accuracy | 9 | Match runtime |
| Teacher quality | 7 | New "what can I do today?" lesson added; needs UI surfacing |
| Safety posture | 9 | The right gates are in the right places |
| Deterministic behaviour | 9 | The boring parts behave |
| Beginner comprehension | 6 | Tooltips missing; "deterministic" still surfaces; first-time user has Ollama install friction |
| Test coverage | 8 | Strong on contracts, light on first-run UX simulations |
| Trustworthiness | 8 | Honest, but the install path still trips beginners |

**Verdict: NOT YET** for beginner beta. Blockers are mostly UX:
- Latin module names on nav need inline intro / tooltips.
- First-run "what does this app actually do" needs a clearer top-of-
  home-page summary that lists the LOCAL_READY + LOCAL_LIMITED
  capabilities in plain language.
- Ollama install friction needs the packaging plan (Phase 2+).
- A non-technical beta reader needs to hit a 7+ on comprehension.

### Public Release (general audience, anyone who finds it)

| Dimension | Score | Notes |
|---|---|---|
| Local reliability | 8 | Same as beginner beta |
| Onboarding clarity | 5 | Same blockers + no Cloud Mode story |
| Capability honesty | 9 | This pass made it honest |
| Docs accuracy | 9 | Match runtime |
| Teacher quality | 7 | Same as beginner beta |
| Safety posture | 9 | Strong |
| Deterministic behaviour | 9 | Strong |
| Beginner comprehension | 6 | Same blockers |
| Test coverage | 8 | Same as beginner beta |
| Trustworthiness | 8 | Honest, but Cloud Mode-shaped hole in the product |

**Verdict: NOT YET.** Two coherence-critical things are missing:

1. The Cloud Mode hole — the product is positioned as "starts local,
   graduates to cloud" but the cloud half is dead. Beginners reading
   the product will see "Cloud Mode" everywhere and assume it works.
2. Beginner UX — Latin names, tooltip gaps, install friction.

`PUBLIC_RELEASE_READY = false` remains the correct call.

## Remaining Blockers (ordered by what removes risk fastest)

1. **Cloud Mode narrow slice** (one provider, end-to-end). Cuts the
   biggest "planned but dead" surface in half.
2. **Beginner-facing landing copy** that lists today's capabilities
   in plain language using the canonical taxonomy.
3. **Tooltips on Latin nav items** (Velum, Tabularium, Nous, Oculus,
   Fabrica, Archivum, Colloquium).
4. **First-run Ollama-install assistant** improvements (Phase 2 of
   PACKAGING_PLAN).
5. **`reports/llama-server-smoke/PROOF.json`** so llama.cpp text
   path moves from `LOCAL_PARTIAL` to `LOCAL_READY`.
6. **Test simulation of a zero-experience user flow** (74 such tests
   exist; expand to cover the new inspection / edit / planning
   surfaces with beginner-style prompts).
7. **`BEGINNER_ONBOARDING_DESIGN.md` relabel** to remove "First
   Autonomous Workflow" framing that implies near-term ship.

## What Has Improved Since the Last Audit

- Approval-gated narrow file inspection ships, with the safety
  contract type-enforced.
- Approval-gated tiny edits ship, with hash-bound tokens and
  automatic rollback on verify failure.
- Structured planning ships, with evidence-typed plans and explicit
  refusal of destructive intent.
- Small-model reliability layer ships, bounded by an explicit policy
  and a literal-type `cloudUsed: false`.
- Coherence pass aligned docs, matrix, release plan, README, and
  teacher KB with the new runtime.

## What Has Not Changed (and Is Fine)

- Cloud providers remain `NOT_IMPLEMENTED`. This is the right call:
  no half-shipped adapters.
- The egress guard, honesty annotator, and release-safety contracts
  remain green.
- `PUBLIC_RELEASE_READY = false`. The product is honest about not
  being ready.

## Bottom Line

This build is **safe and honest** for internal and technical-beta use.
It is **not yet** safe to ship to a non-technical audience because
the Cloud Mode hole and the beginner UX gaps would create
expectations the product cannot meet. Local Mode + approval-gated
tools + planning is a real product surface — it just needs the
beginner-facing wrapping to match the runtime's honesty.
