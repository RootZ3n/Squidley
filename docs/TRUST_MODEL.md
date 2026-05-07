# Local-First Trust Model

Public Squidley uses a layered trust architecture to keep user data local by
default, make every boundary decision auditable, and prevent silent cloud calls.
This document explains the system as implemented.

## Local-first default

All core workflows run locally. Chat, text review, notes, receipts, model
preferences, and single-file suggestions use browser storage and a local
Ollama-compatible model server. No outbound cloud LLM calls, telemetry, or
silent uploads occur in normal operation.

When a capability needs cloud resources, the system requires explicit
multi-step consent before anything can be sent. That consent path is
implemented but does not yet execute cloud calls.

## Capability states

The capability registry assigns one of five states to each feature:

| State | Meaning |
| --- | --- |
| LOCAL_READY | Runs locally on the user's device. |
| LOCAL_LIMITED | Can run locally; results may be limited by the local model. |
| CLOUD_OPTIONAL | Local works; cloud may improve the result. |
| CLOUD_REQUIRED | Cannot run without a cloud provider. |
| BLOCKED | Currently unavailable. |

Local readiness is a heuristic based on discovered local models and known
capabilities. It is not a benchmark guarantee.

Nous shows these states on the model/provider map so the user can see what is
available before attempting an action.

## Gateway prompt-injection defense

A deterministic Prompt Gateway runs before local model calls. It checks for
common prompt-injection signals such as instruction overrides, tool/shell
coercion, exfiltration language, and cloud-boundary bypass attempts.

The gateway produces a risk assessment (none / low / medium / high / critical)
and a set of recommended actions. It does not call a cloud moderation service.

See [PROMPT_GATEWAY.md](PROMPT_GATEWAY.md) for details.

## Gateway policy boundaries

The gateway enforces policy at six boundaries:

| Boundary | What it guards |
| --- | --- |
| chat | Local model chat calls. |
| tool-use | Tool execution (locked in public). |
| cloud-escalation | Transition from local to cloud provider. |
| provider-switch | Changing the active provider. |
| receipt-write | Receipt persistence (always preserved). |
| velum-handoff | Handoff to Velum for review. |

Each boundary decision produces a Tabularium receipt with the boundary name,
whether it was allowed or blocked, and the reason (e.g. `prompt-injection`,
`velum-required`, `consent-required`).

## Velum before cloud

When the gateway or capability system determines that cloud escalation is
possible, Velum review is required first. The sequence is:

1. **Velum handoff preparation** -- a local receipt records that Velum review
   is needed. This does not mark the review as passed.
2. **Velum review completion** -- the user confirms Velum review is done. A
   separate receipt records `velumReviewPassed: true`. This still does not
   send anything or grant cloud consent.

Preparation is not the same as review passed. Review passed is not the same as
consent. Consent is not the same as execution.

## Cloud consent flow

When Velum review is complete and the gateway allows escalation, the system can
offer cloud consent. The flow produces distinct receipts at each stage:

| Step | Receipt action | What it means |
| --- | --- | --- |
| Capability assessment | `capability.decision` | Evaluated what the feature needs. |
| Injection assessment | `security.prompt-injection.assessment` | Checked for injection risk. |
| Policy decision | `security.gateway-policy.decision` | Allowed or blocked the boundary. |
| Escalation offer | `cloud-escalation.offer` | Cloud was offered for consent. |
| Consent decision | `cloud-consent.granted` / `.denied` / `.cancelled` / `.blocked` | User's response to the offer. |

**Consent does not equal execution.** Granting consent records a permission
decision. No cloud provider call occurs as a result. Actual cloud execution
requires a separate, future execution path that does not exist yet.

Every receipt records `nothingSentYet: true` and `cloudUsed: false` because no
cloud call has been made.

## Tabularium Trust chains

Tabularium groups related receipts into trust chains so the full story of a
boundary decision is readable in one place. A chain might contain:

- Velum prep and review steps
- Gateway assessment and policy steps
- Cloud offer and consent steps

Chain summaries are written so a beginner can follow the narrative:

- "Velum review was prepared locally. Nothing was sent."
- "Velum review was marked complete locally. Consent may be offered next, but nothing was sent."
- "Velum review completed and cloud consent was granted. Nothing was sent by these receipts."
- "Gateway blocked cloud escalation and recorded the blocked consent decision. Nothing was sent."

Each step can carry a transparency badge (e.g. "Velum prep recorded",
"Gateway check passed", "Cloud consent granted") visible in the Tabularium UI.

## Fabrica cloud-required boundary (current example)

Fabrica's multi-file build is the first CLOUD_REQUIRED capability with the full
trust ceremony implemented:

1. User clicks "Check multi-file build preflight."
2. Gateway assesses the request and enforces policy.
3. If blocked by `velum-required`, user prepares Velum handoff, then marks
   review complete.
4. Rerunning preflight with review passed produces `allowedToOfferCloud: true`.
5. Cloud consent dialog opens. User grants, denies, or cancels.
6. Decision is recorded. Nothing is sent.

All steps are visible in Tabularium as a trust chain.

## What is not implemented yet

The following are designed but not active:

- **Actual cloud execution.** No provider call is made even after consent.
- **Global consent persistence.** Consent is page-local state, not persisted
  across sessions.
- **Provider switching.** Cloud providers are locked metadata only.
- **Broad production tool-use execution.** Tool boundaries exist but tools are
  not executed in public Squidley.

## Principles

- Local-first by default.
- No silent cloud calls.
- No hidden provider switching.
- Gateway checks protect every boundary.
- Velum/redaction must run before cloud handoff.
- Consent is permission, not execution.
- Nothing is sent merely because consent was granted.
- Receipts and trust chains explain what happened.
- Local readiness is heuristic, not a benchmark guarantee.
