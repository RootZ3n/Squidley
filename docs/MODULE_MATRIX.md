# Module Matrix

The single source of truth for module data is
[`src/lib/modules/registry.ts`](../src/lib/modules/registry.ts). This
table is a human-readable mirror; if they diverge, the code wins.

## Core (local-first)

| Module       | Latin meaning            | Local-only | Tour | Public summary                                               |
| ------------ | ------------------------ | :--------: | :--: | ------------------------------------------------------------ |
| Colloquium   | conversation, discussion |     ✅     |  ✅  | Chat with Squidley.                                          |
| Fabrica      | workshop, forge          |     ✅     |  ✅  | Single-file suggestion workshop — not a full coding agent.   |
| Archivum     | archive, records         |     ✅     |  ✅  | Browser-local notes, tags, import/export bundles.            |
| More Input   | —                        |     ✅     |  ✅  | Paste text into Archivum's local input flow.                 |
| Velum        | veil, curtain            |     ✅     |  ✅  | Deterministic client-side text review and redaction.         |
| Archelon     | —                        |     ✅     |  —   | Future local-memory direction; no public route yet.          |
| Oculus       | eye                      |     ✅     |  ✅  | Manual image preview and optional local vision analysis.     |
| Tabularium   | record office, ledger    |     ✅     |  ✅  | Browser-local receipt history.                               |
| Nous         | —                        |     ✅     |  ✅  | Module/model map, Ratio ASI, and locked provider metadata.   |

## Cloud unlock (visible, gated in public)

| Module      | Latin meaning           | Public summary                                          |
| ----------- | ----------------------- | ------------------------------------------------------- |
| Legatus     | envoy, delegate         | Future agent workflows requiring Cloud Agent mode.      |
| Probatio    | test, trial             | Evaluations and tests against ideas/models.             |
| Imperium    | command, authority      | Future advanced control requiring high-trust unlocks.   |
| Praertorium | headquarters            | Future policy/operations control; locked in public.     |
| Imaginanium | —                       | Image generation — not in local-only public mode.       |

## Fields

The registry stores, per module:

- `id` — stable kebab-case identifier (URL-safe).
- `displayName` — what the user sees.
- `latinMeaning` — short gloss; used in tour copy where present.
- `beginnerDescription` — single-sentence summary in plain language.
- `category` — `"core-local"`, `"cloud-unlock"`, or `"future"`.
- `status` — active, limited, prepared, locked, or future.
- `publicEnabled` — visible in public Squidley.
- `enabled` — active in the current public product.
- `localOnlySupported` — works without cloud features.
- `cloudUnlockRequired` — gated behind cloud unlock.
- `tourAvailable` — has a Companion Tour authored.
- `tourId` — structured tour id when available.
- `route` — relative URL for the module's page (when one exists).
- `ratioActions` — Ratio actions owned by the module, or explicit `none`.
- `receiptActions` — Tabularium receipt actions owned by the module, or explicit `none`.
- `storageKeys` — browser storage keys the module owns.
- `handoffKinds` — browser-local draft handoffs the module owns.
- `providerRequirements` — local/cloud provider requirements, if any.
- `docs` — primary docs path or an intentional docs note.

The registry is validated by
[`src/lib/modules/validateModuleContracts.ts`](../src/lib/modules/validateModuleContracts.ts)
so missing docs, missing routes, duplicate ids/routes, undeclared storage, and
undeclared handoffs fail tests before they become product drift.

## Ratio Status Notes

Public module pages use Ratio, Squidley's Adaptive System Intelligence layer, to
explain current action state in plain language:

- `available` means the action can run in the current local/public setup.
- `limited` means the action can proceed with a narrower safety posture.
- `needs-stronger-model` means the selected model lacks a needed capability.
- `needs-cloud-unlock`, `needs-workspace`, `needs-tool-permission`, and
  `requires-approval` mean the action is gated by explicit future setup or user
  permission.
- `future` means the module or action is intentionally visible but not wired.
- `blocked` means Prompt Gateway or module policy paused the action.

Cloud Unlock modules remain visible, locked, and non-active in public-local mode.
