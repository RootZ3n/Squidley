# Approval-Gated Tiny Edit Workflow

**Status:** scaffolded, tested, opt-in. Wired into `/api/chat` and
`/api/chat/stream` for narrow `editProposal` intents only.
**Module:** `src/lib/editing/`
**Test count:** 66 unit + 9 route-level (75 new); full suite 1947
passing.

## Approval philosophy

A "tiny edit" is the most cautious possible mutation Squidley Public
will perform:

- **One file.**
- **One targeted replacement** of an exact, already-inspected snippet.
- **Approved every time** by the user via a diff-preview panel.
- **Bound to four hashes** in the approval token, so the file changing
  even by one byte invalidates the approval.
- **Verified after writing**, with deterministic checks.
- **Rolled back automatically** on any verification failure.

The user is the agent of every change. Squidley *proposes* and
*verifies*; the user *approves*.

## Why edits are tiny

Tiny edits are a deliberately constrained surface. Each constraint
exists because it removes a class of mistakes:

| Constraint                         | Removes…                              |
|------------------------------------|---------------------------------------|
| One file per approval              | accidental multi-file refactors       |
| Exact-anchor original snippet      | regex / pattern-replacement collisions|
| Original must appear exactly once  | ambiguous "which one?" replacements   |
| ≥ MIN_SNIPPET_BYTES (4) anchor     | trivially-colliding tiny anchors      |
| ≤ MAX_SNIPPET_BYTES (2 KB)         | hidden mega-rewrites                  |
| Max diff bytes (4 KB)              | ballooning file size                  |
| Allow-listed extensions            | binary clobbers, lockfile damage      |
| File must be previously inspected  | "blind write" workflows               |
| File hash must still match         | TOCTOU drift between propose & apply  |

Anything that wants to be larger than this should not be a "tiny edit"
— it should be a description the user applies themselves.

## Approval token (four-hash binding)

```ts
{
  action: "tiny_edit",
  path: string,
  originalHash: sha256(originalSnippet utf-8),
  proposedHash: sha256(proposedSnippet utf-8),
  fileHash:     sha256(currentFileContents utf-8),
  approvedAt:   epoch ms,
  approvalId:   short opaque string
}
```

A change to any of the four hashes — including a one-byte change in
the file itself — invalidates the approval. The token has a 5-minute
TTL (`TINY_EDIT_APPROVAL_TTL_MS`), shorter than inspection's 10 min
because edits are more sensitive.

## Verification model

Verification is deterministic and local. No shell commands, no build
commands, no test runs.

Universal checks (every edit):

1. **replacement-present** — the proposed snippet appears in the file
   after writing.
2. **original-removed** — the original snippet is no longer present.
3. **file-not-empty** — the file is not empty after the edit.
4. **file-length-reasonable** — the file length ratio after/before is
   between 0.1× and 10×.

Extension-specific checks:

| Extension                | Extra checks                                  |
|--------------------------|-----------------------------------------------|
| `.json`                  | `json-parses` (`JSON.parse` round-trips)      |
| `.ts .tsx .js .jsx`      | `balanced-delimiters`, `no-unterminated-strings` |

The TS/JS checks are *lightweight* — no real parser. They catch
obvious shape damage (broken braces, unterminated strings) but won't
catch semantic errors. That's by design: tiny edits are not
refactors.

## Rollback semantics

The apply engine holds the original file contents in memory before
writing. If any of the following happen, the apply engine writes the
backup back to disk immediately:

- Re-read after write fails.
- Verification status is `failed`.

If the rollback write itself fails (rare), Squidley emits an
`editing.failed` receipt that says so explicitly. The user is told
that the file may be in a partially-edited state. Squidley does NOT
attempt heroic recovery — the user owns the next step.

## Receipts

Eight action ids, all under module `system` with `cloudUsed: false`
and `tiny_edit: true`:

```
editing.proposed
editing.approval-requested
editing.approved
editing.applied
editing.verified
editing.rollback-started
editing.rollback-completed
editing.failed
```

Raw snippet contents never appear in receipt metadata — only the
counts (`bytes_removed`, `bytes_added`) and the path.

## Stream protocol

Deterministic event order, depending on phase + outcome:

```
Phase A (no approval token):
  edit_preview → edit_result → done

Phase B (verified):
  edit_applied → verification → edit_result → done

Phase B (rolled back):
  edit_applied → verification → rollback → edit_result → done

Phase B (denied / blocked before write):
  edit_result → done
```

No `meta`, no `delta`. The reply text rendering happens in the
client; the wire carries structured events the UI maps to panels.

## Intercept precedence

In both routes:

```
teacher (non-stream only)
  ↓
file-inspection (approval-gated read)
  ↓
tiny-edit (this layer)
  ↓
structured planning
  ↓
reliability intent (health-check, summarize-error)
  ↓
answer-wrap (code-explanation, debugging)
  ↓
casual local model
```

A message that matches BOTH inspection intent ("what does X.ts do") and
edit intent ("make a tiny edit") routes to inspection first — reads
happen before writes.

## Planning integration

A plan whose action verb is `fix` / `add` / `refactor` may suggest a
tiny edit as a step. The plan never auto-applies — the user explicitly
clicks Approve in the diff panel. The planner emits the suggestion as
a description; the actual edit requires:

1. A new POST with `editProposal: { path, originalSnippet, proposedSnippet }`
2. Server returns `editApprovalRequired` with the diff preview
3. User clicks Approve
4. Client builds the approval token + resends with `editApproval`

## Limitations (honest)

- The TS/JS verification is a **lightweight** brace/string check — not
  a real parser. It cannot catch type errors, missing imports, or
  semantic issues. The user is responsible for running their own
  build/tests after a tiny edit lands.
- The four-hash approval is **client-attested** in a single-user
  local-first build. The path-safety + file-hash check are what
  actually bound what's possible.
- Symlink behaviour follows the inspection layer's behaviour (it
  doesn't special-case symlinks). A symlink inside the project root
  pointing outside it would be a known gap and should be addressed
  before any production deployment.
- The exact-once anchor rule means edits cannot replace common
  patterns (e.g. "useState") without extending the anchor to make it
  unique. This is a feature.
- No file creation, no file deletion, no rename. These would each
  require their own approval model.

## Future roadmap

This is the deliberate stopping point for autonomous editing in
Squidley Public. Plausible extensions, each non-trivial:

1. **Multi-file tiny edits** — a batched approval that lists every
   single-file change. Same hash-binding per file, all-or-nothing
   apply, atomic rollback across files.
2. **AST-aware verification** — plug in a real TS parser so the
   `balanced-delimiters` / `no-unterminated-strings` checks are
   replaced with full syntax validation. Still no semantic check.
3. **Test-pass verification** — run a designated test command after
   the edit, roll back on failure. This would require allowing shell
   execution, which crosses a different safety boundary and would
   need its own dedicated approval model.
4. **Plan-driven edits** — when a plan step suggests a tiny edit, let
   the UI offer a one-click "Try this edit" button that posts the
   `editProposal` shape automatically. The user still approves the
   actual write.

None of those are wired today.

## Changelog

- `95000e4` — Reliability core.
- `7f29267` — Wire reliability into chat.
- `8b6e794` — Local answer validation + retry + fallback.
- `9a753e2` — Approval-gated read-only file inspection.
- `e3f22d8` — Structured planning + provenance.
- _this commit_ — Approval-gated tiny edit workflow. Two-phase
  commit, four-hash approval token, deterministic verification, in-
  memory rollback, 8 receipt actions, UI diff panel with real
  Approve / Decline buttons. 75 new tests; full suite stays green at
  1947 passing.
