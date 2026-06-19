# UI Language Guide

> Canonical wording for Peh user-facing surfaces.
> Companion to [docs/CAPABILITY_TAXONOMY.md](CAPABILITY_TAXONOMY.md).
>
> The machine-readable source of truth for terminology lives in
> `src/lib/ui/terminology.ts`. UI components import from there; docs
> and tests pin the contract.

## Why a Language Guide

A beginner does not know what "Velum" is, and they cannot guess
"approval-gated narrow file inspection" from a sidebar link. They need
plain English first; the lore can stay as a subtitle. This guide pins
the exact phrasings so every panel says the same thing.

## Module Name Mapping (friendly first, lore preserved)

| Friendly label | Latin (subtitle) | What it does |
|---|---|---|
| Welcome | — | Start here. Overview of what Peh can do today. |
| Chat | Colloquium | Talk to a local AI model on your machine. |
| Code Helper | Fabrica | Paste a single file; get a code suggestion. |
| Notes | Archivum | Save snippets and notes in this browser only. |
| More Input | Archivum (capture) | Quickly capture text to use later. |
| Safety Check | Velum | Review text before sharing it with the model. |
| Image Review | Oculus | Analyse an image with a local vision model. |
| Activity Log | Tabularium | Review what Peh actually did, with receipts. |
| System Map | Nous | See what is configured and what is connected. |
| Modules | — | All available parts of Peh. |
| Settings | — | Tours, storage, and local model preferences. |
| Memory (planned) | Archelon | Long-term memory — planned, not built yet. |
| Agent Workflows (locked) | Legatus | Multi-step agent flows — Cloud Mode only. |
| Model Evaluator (locked) | Probatio | Evaluate cloud models — Cloud Mode only. |
| Advanced Control (locked) | Imperium | High-trust controls — Cloud Mode only. |
| Image Generation (locked) | Imaginanium | Cloud image generation — Cloud Mode only. |

Rules:
- The friendly label is the primary nav text. The Latin name is a
  subtitle, smaller and dimmer.
- Tooltips on the nav item carry the one-line beginner description.
- Page H1s remain free to use the Latin name as a personality choice,
  but the sidebar/tab bar must use the friendly label.

## Sidebar Section Labels

| Was | Now |
|---|---|
| Workspace | Use freely |
| System | Settings |
| Future · public-local | Planned · not built yet |
| Cloud Unlock · locked | Cloud-only · not implemented |

The new section labels are descriptive rather than evocative. A
beginner can tell at a glance what each row of the sidebar can do.

## Capability Tier Vocabulary (UI badges + tooltips)

These are the six canonical tiers. Every badge in the UI must use the
"Beginner label" and the "Short" tooltip. Long descriptions appear in
expanded popovers and docs.

| Tier | Beginner label | Short tooltip | Long description (docs / popover) |
|---|---|---|---|
| LOCAL_READY | Ready | Works locally. No approval needed. | Implemented and validated. Runs on your machine. Beginner-safe. |
| LOCAL_LIMITED | Approval needed | Works locally with safety limits and your approval. | Real local capability bounded by hard scope limits and explicit per-action approval. Examples: narrow file inspection, tiny verified edits. |
| LOCAL_PARTIAL | Limited | Works locally. Quality depends on your model. | Implemented locally but quality, backend coverage, or model dependence limits delivery. |
| CLOUD_PLANNED | Planned (cloud) | Designed for Cloud Mode. Not running yet. | Architecture exists in the codebase but no adapter or API call path is wired. Cannot run, even if API keys are configured. |
| NOT_IMPLEMENTED | Not built | No code path. Would be new work. | Nothing is built for this. The honesty corrector overrides any model claim that it happened. |
| BLOCKED | Intentionally unavailable | Refused by design for safety and trust. | Contract-enforced refusal. The codebase actively prevents this with type-level or runtime guards. |

## Trust-Surface Phrases (use verbatim)

These are the canonical phrases. They live in `TRUST_PHRASES` in
`src/lib/ui/terminology.ts`. If you need to add a new phrase, add it
there first.

### Approval prompts

| Context | Phrase |
|---|---|
| Approve file inspection (button) | `Approve and read once` |
| Approve tiny edit (button) | `Approve this edit` |
| Decline (both flows) | `Decline` |
| After approve · inspection | `Approved. Peh is reading the file once and will not change it.` |
| After approve · edit | `Approved. Peh is applying the edit and verifying it now.` |
| After decline · inspection | `Declined. The file was not read.` |
| After decline · edit | `Declined. No edit was applied.` |

### Reliability / uncertainty

| Context | Phrase |
|---|---|
| Model uncertain | `The local model may be uncertain here.` |
| Could not verify | `Peh could not verify the answer.` |
| Action needs approval | `This action requires your approval.` |

### Rollback

| Context | Phrase |
|---|---|
| Tiny edit verify failed | `Peh applied the edit, verification failed, and the file was restored from backup.` |
| Generic rollback | `The change was reversed. Your file is back to its previous state.` |

### Provenance footer

| Context | Phrase |
|---|---|
| Short (UI) | `answered by local model only · no tool used · no cloud used` |
| Structured (receipts) | `Local Mode / [model] / no cloud / no tool` |

### Cloud unavailability

Use verbatim: **"Cloud Mode is not implemented yet."**

Variants seen in older copy that should be brought into line:
- "Cloud is locked in this build" → `Cloud Mode is not implemented yet.`
- "Cloud unlock · locked in public" → `Cloud Mode is not implemented yet.`
- "Cloud currently used: false" → `Cloud: off (not in use)`

### Build identifier

When distinguishing the current build from future capabilities, use
**"this public Peh build"** (not "this version", not "this build",
not "this public local build"). The honesty corrector messages already
use this form.

## Words to Avoid in User-Facing Copy

The following words intimidate beginners or imply more autonomy than
Peh has. Acceptable in advanced docs and code comments; not in
UI labels, onboarding, or teacher lessons.

| Avoid | Use instead |
|---|---|
| agentic | what Peh can do |
| orchestration | how Peh plans steps |
| execution graph | the plan |
| runtime substrate / substrate | the part of Peh that runs your request |
| subsystem | part of Peh |
| deterministic | predictable; no guessing |
| invariant | rule that always holds |
| escalation | suggesting a cloud model |
| egress | data leaving your machine |
| schemaVersion | (do not surface in UI) |
| literal type | (do not surface in UI) |
| catastrophically | (never; alarming) |
| failed catastrophically | something went wrong; details below |
| non-deterministic | the model may give different answers each time |

If you must use one of these terms in a UI label, include a one-line
plain-English definition on the same surface (tooltip, info icon,
adjacent text). Example: `pattern-based checks (no guessing)`.

## Voice and Tone

- **Calm.** Never alarming. "Peh could not verify the answer" is
  better than "agent failed catastrophically".
- **Specific.** Say what did and did not happen. "Declined. The file
  was not read." beats "Operation cancelled."
- **Honest.** Never imply Peh did something she did not.
- **Beginner-first.** Plain English wins. Lore is an opt-in subtitle.
- **No emoji** unless the user has explicitly opted into a lighter
  visual style.

## Cross-Reference

- Canonical tiers: [CAPABILITY_TAXONOMY.md](CAPABILITY_TAXONOMY.md)
- Machine-readable matrices:
  [capability-matrix.public-peh.json](capability-matrix.public-peh.json),
  [tool-matrix.public-peh.json](tool-matrix.public-peh.json)
- TypeScript source: `src/lib/ui/terminology.ts`
- Validation test: `src/lib/ui/terminology.test.ts`
- Beginner UX audit: [BEGINNER_BETA_UX_AUDIT.md](BEGINNER_BETA_UX_AUDIT.md)
