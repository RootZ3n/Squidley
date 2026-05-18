# Structured Planning + Provenance Layer

**Status:** scaffolded, tested, opt-in. Wired into `/api/chat` and
`/api/chat/stream` for narrow planning intents only.
**Module:** `src/lib/planning/`
**Test count:** 64 unit + 12 route-level (76 new); full suite 1872 passing.

## Why

Small local models lie under pressure. When a user asks
"how would you fix this?", a small model that has not actually read the
relevant files will happily invent file paths, function names, and
diffs. That is the dishonest version of "agent magic".

The Structured Planning + Provenance Layer is the honest version:

1. **Planning before action.** Squidley produces a *description* of the
   work, never an execution.
2. **Explainability before autonomy.** Every line of the plan cites its
   evidence — known file, prior receipt, model inference, or user
   assumption.
3. **Provenance before confidence.** Confidence is a function of
   evidence; with no inspected files it stays at `"low"`.
4. **Beginner trust over agent magic.** The UI shows "Known / Inferred
   / Assumed / Missing" buckets, not a confident wall of text.

## Provenance philosophy

Every plan answers four questions for every fact it presents:

| Bucket    | Evidence type        | UI label  |
|-----------|----------------------|-----------|
| Known     | `file` or `receipt`  | Known     |
| Inferred  | `model_inference`    | Inferred  |
| Assumed   | `user_input`         | Assumed   |
| Missing   | (none — explicit gap)| Missing   |

A plan that has not seen file `X.ts` can mention `X.ts` only in
`relatedFiles` / `suggestedNextInspections` / `missing`. It cannot
appear in `known`. This is enforced by the planner's evidence map and
asserted by tests.

## Evidence-backed planning

The planner accepts three input channels and ignores everything else:

1. **User prompt** — parsed for action verb, topic keywords, file path
   hints, and risk signals. Generates the `user_input` evidence entry
   that goes into `assumed`.
2. **Inspected files** — `{ path, packedContent }[]` from prior approved
   read-only inspections. Each produces a `file` evidence entry that
   goes into `known`.
3. **Prior receipts** — only reliability / planning receipts are
   referenced; others are ignored. Generates `receipt` evidence with
   `medium` confidence.

The planner does **not** call a model, **does not** read files, and
**does not** make network calls.

## Confidence semantics

Three honest buckets, no percentages:

| Level    | Meaning                                                          |
|----------|------------------------------------------------------------------|
| `high`   | 2+ inspected files matching the topic, clear action verb         |
| `medium` | 1 inspected file OR ambiguous topic with high-quality evidence   |
| `low`    | No inspected file, OR unknown action verb, OR no topic keywords  |

Confidence can only decrease as the planner walks the evidence — it can
never increase past what the inputs support. The planner emits a
`planning.confidence-lowered` receipt every time it downgrades.

## Risk levels

| Risk       | Triggers                                                       |
|------------|----------------------------------------------------------------|
| `blocked`  | rm -rf, ignore-all-instructions, force-push, sudo, chmod 0777 |
| `elevated` | remove / delete / drop / deploy / ship / destructive verbs    |
| `review`   | fix / add / refactor / change (anything that would write)     |
| `safe`     | explain / investigate / audit / read-only verbs               |

Blocked plans produce **zero** executable steps and a single
`ask_user` advisory step. No bypass.

## Receipts

Six action ids, all under module `system`, all asserting
`cloudUsed: false` and `read_only: true`:

```
planning.started
planning.evidence-linked      (when at least one file is linked)
planning.confidence-lowered   (when confidence < "high")
planning.decomposed           (when any step needs approval/evidence)
planning.completed
planning.blocked              (when riskLevel = "blocked")
```

## Stream protocol

Deterministic event order for the planning path:

```
plan → done
```

No `meta`, no `delta`, no fake progressive planning. The plan is
produced in one shot from the deterministic planner and emitted whole.

## Intercept precedence

In both `/api/chat` and `/api/chat/stream`:

```
teacher (non-stream only)
  ↓
file-inspection (approval-gated read)
  ↓
structured planning (this layer)
  ↓
reliability intent (health-check, summarize-error)
  ↓
answer-wrap (code-explanation, debugging)
  ↓
casual local model
```

Planning runs *after* file inspection so a user can say
"inspect src/auth.ts" → approve → "now make a plan", and the plan picks
up the inspected file as `known` evidence (via the `inspectedFiles`
field in the next request body, populated by the UI).

## Reliability integration

Planning composes with the existing reliability layer:

- **Decomposition**: if the planner detects unknown action verb or
  no topic, it lowers confidence and lists "Squidley could not
  classify what kind of change you want" as missing information.
- **Validation**: planning never goes through `validateLocalAnswer`
  because it never calls the local model. The deterministic output is
  always non-empty, has at least one step, and carries a confidence.
- **Receipts** flow into the same Tabularium chain as reliability
  receipts; the UI's existing receipt rendering picks them up.

## Limitations (honest)

- The planner is **deterministic and rule-based**, not model-driven.
  That keeps it honest but means it cannot infer subtle intent. A
  follow-up could call the local model with a structured prompt and
  validate the model's plan against this layer's schema.
- File-hint extraction uses a conservative regex on the user message.
  Paths the user did not type are not auto-discovered.
- Prior receipts are pulled only from the chat request body; the
  server is stateless. A future enhancement could include the user's
  Tabularium history as evidence.
- `inspectedFiles` arrives from the client, which means the client is
  trusted to provide truthful packed content. In a multi-user
  deployment, this would need to move server-side. For a single-user
  local-first build, this is acceptable.

## Why Squidley plans before acting

The Local Reliability layer (commits `95000e4`, `7f29267`, `8b6e794`)
made answers honest. The Approval-Gated File Inspection layer
(`9a753e2`) made reads honest. The Structured Planning Layer makes
*intentions* honest.

Without this layer, a beginner asking "how would you fix this?" sees a
plausible-looking plan from a small model that may have never seen the
files involved. With this layer, they see what is known, what is
guessed, and what is missing — and decide what to inspect next.

## Future roadmap: approval-gated tiny editing

The disabled `make_small_text_change_and_verify` compound tool is the
natural next step:

1. The planner emits a step with `suggestedTools: ["make_small_text_change_and_verify"]`
   when the action verb is `fix` / `add` / `refactor`.
2. The UI renders a *second* approval card with the proposed change
   (find/replace text + path), shown as a unified diff.
3. The user clicks "Approve this edit". The client builds a
   path-bound + diff-bound approval token (analogous to the
   inspection token).
4. The server validates the path + diff hash + approval, applies
   exactly the approved change, re-reads to verify, and emits a
   `verify` callback (e.g., `npm test`).
5. On verification failure, the change is reverted and a receipt is
   emitted.

None of that is wired today. The planner currently states the
limitation explicitly in every plan it produces:
*"Squidley does not edit files in this build."*

## Changelog

- `95000e4` — Reliability core (types, packer, runner, decompose,
  escalation, code-graph scaffold).
- `7f29267` — Wire reliability into chat (`health_check`,
  `summarize_error`).
- `8b6e794` — Local model answer validation + 1-retry + honest fallback.
- `9a753e2` — Approval-gated read-only file inspection.
- _this commit_ — Structured planning + provenance. Deterministic,
  evidence-backed plans with `known / inferred / assumed / missing`
  buckets, three-bucket confidence, four-tier risk classification,
  and a UI panel that never invents file paths.
