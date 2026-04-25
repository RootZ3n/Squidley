# Module Matrix

The single source of truth for module data is
[`src/lib/modules/registry.ts`](../src/lib/modules/registry.ts). This
table is a human-readable mirror; if they diverge, the code wins.

## Core (local-first)

| Module       | Latin meaning            | Local-only | Tour | Public summary                                               |
| ------------ | ------------------------ | :--------: | :--: | ------------------------------------------------------------ |
| Colloquium   | conversation, discussion |     ✅     |  ✅  | Chat with Squidley.                                          |
| Fabrica      | workshop, forge          |     ✅     |  —   | Single-file build/edit only — not a full coding agent.       |
| Archivum     | archive, records         |     ✅     |  —   | Local notes, conversations, snippets.                        |
| More Input   | —                        |     ✅     |  —   | Bring extra context (paste/file/snippet) into a chat.        |
| Velum        | veil, curtain            |     ✅     |  —   | Privacy curtain — mark items hidden/redacted before sharing. |
| Archelon     | —                        |     ✅     |  —   | Long-memory companion across local sessions.                 |
| Oculus       | eye                      |     ✅     |  —   | Look at images/screenshots/diagrams locally.                 |
| Tabularium   | record office, ledger    |     ✅     |  —   | Read/summarize CSVs and small spreadsheets locally.          |
| Nous         | —                        |     ✅     |  —   | Lightweight reasoning workspace (plans, outlines).           |

## Cloud unlock (visible, gated in public)

| Module      | Latin meaning           | Public summary                                          |
| ----------- | ----------------------- | ------------------------------------------------------- |
| Legatus     | envoy, delegate         | Send tasks for Squidley to run on your behalf.          |
| Probatio    | test, trial             | Evaluations and tests against ideas/models.             |
| Imperium    | command, authority      | Coordinate multiple agents and longer workflows.        |
| Praertorium | headquarters            | Overview of running tasks, schedules, queues.           |
| Imaginanium | —                       | Image generation — not in local-only public mode.       |

## Fields

The registry stores, per module:

- `id` — stable kebab-case identifier (URL-safe).
- `displayName` — what the user sees.
- `latinMeaning` — short gloss; used in tour copy where present.
- `beginnerDescription` — single-sentence summary in plain language.
- `category` — `"core-local"` or `"cloud-unlock"`.
- `publicEnabled` — visible in public Squidley.
- `localOnlySupported` — works without cloud features.
- `cloudUnlockRequired` — gated behind cloud unlock.
- `tourAvailable` — has a Companion Tour authored.
- `route` — relative URL for the module's page (when one exists).
