# Small Model Reliability Layer

**Status:** scaffolded, tested, opt-in. Not yet wired into chat routes.
**Module:** `src/lib/reliability/`
**Test count:** 69 reliability tests; full suite 1653 passing.

## Why

Small local models (the kind that fit on a normal laptop with Ollama or
llama-server) are useful but fragile. They:

- choke on long contexts,
- return empty content when overloaded,
- repeat the same mistake when retried naively,
- and can produce confident-sounding nonsense.

The reliability layer adds beginner-safe guardrails so Peh Public
can use these models honestly without lying about their limits.

## Local-first policy

| Rule | Enforced where |
|---|---|
| Local mode is always the default. | `DEFAULT_RELIABILITY_POLICY.beginnerMode = true` |
| Cloud is never called automatically. | `runReliability` never performs cloud IO; escalation timeline defaults to `"skipped"`. |
| `cloudUsed` is the literal `false` on every result/receipt. | Type-level: `cloudUsed: false`. |
| Velum redaction runs before any cloud preview. | `buildEscalationOffer` routes the prompt through `sanitizeReceiptText` and `createVelumHandoffPayload`. |
| Whole large files never get inlined silently. | `packContext` rejects items above `rejectIfLargerThan`. |
| At most `maxRetries` retries per task. | `runReliability` loop counter. |
| Same-failure-twice → decompose, never loop. | `buildFailureSignature` + comparison in runner. |

## Architecture overview

```
src/lib/reliability/
├── index.ts          public entry — re-exports everything below
├── types.ts          SmallModelTask, ReliabilityStep, ReliabilityResult,
│                     DEFAULT_RELIABILITY_POLICY, createSmallModelTask()
├── contextPacker.ts  packContext(), renderPackedContext()
├── compoundTools.ts  5 compound tools + COMPOUND_TOOL_REGISTRY
├── runner.ts         runReliability() — bounded loop with validation
├── decompose.ts      buildFailureSignature(), decomposeTask()
├── escalation.ts     buildEscalationOffer(), event-receipt builders
├── codeGraph.ts      indexCodeGraph(), queryCodeGraph()
└── copy.ts           beginner-friendly UI strings + intro card
```

Every file has a colocated `*.test.ts`.

## Compound tools

All compound tools return `CompoundToolResult` and accept an injected
`ToolEnvironment`, so tests can run with no real filesystem.

| Tool | Reads | Writes | Default |
|---|---|---|---|
| `explain_project_structure` | yes (top-level only) | no | enabled |
| `inspect_one_file_safely` | yes (one file, budgeted) | no | enabled |
| `summarize_error_and_next_step` | no | no | enabled |
| `run_local_health_check` | no | no | enabled |
| `make_small_text_change_and_verify` | yes | yes | **disabled** |

The edit tool is intentionally disabled in `DEFAULT_RELIABILITY_POLICY`.
A future build can flip `ToolEnvironment.allowWriteOperations` and pass a
real `writeFile` — but only after explicit approval semantics are wired.

## Retry / decompose behaviour

1. Run primary action.
2. Validate (`defaultValidator`: not-ok ⇒ fail, empty content ⇒ fail).
3. On fail, build a `failureSignature` and retry.
4. Same signature twice ⇒ stop, decompose.
5. Out of retries / out of step budget ⇒ decompose.
6. Decomposition produces ≤5 smaller safe sub-tasks (never any edit-and-verify).

`buildFailureSignature` strips volatile noise (pointers, timestamps,
file paths, stack frames) before comparing.

## Cloud escalation consent rules

Cloud escalation is *only ever offered*. The receipt timeline:

```
local_failed
  ↓
escalation_offered     (offer is built; nothingSent)
  ↓
cloud_packet_previewed (Velum-redacted preview)
  ↓
consent_granted | consent_denied | skipped
```

Even with `decision: "granted"`, this build does **not** make a cloud
call. The `consent_granted` receipt says so explicitly:
*"The user approved escalation. This build does not yet wire a cloud
call, so nothing has been sent."*

This contract is enforced by `integration.test.ts` and
`escalation.test.ts`: every receipt is asserted to have
`cloudUsed === false` on every path.

## Read-only approval model (file inspection)

Peh Public can inspect project files from chat — once, read-only,
and only after the user clicks **Approve**. The pipeline is:

1. **Intent detection** (`inspectionIntent.ts`): conservative regexes
   match phrases like "what does src/app/page.tsx do?", "inspect this
   file: package.json", "summarize docs/readme.md". A path is extracted
   from the message; if intent matched but no path was found, Peh
   asks the user to name one rather than guessing.
2. **Approval request** (`fileApproval.ts` + chat adapter): when no
   token is supplied, the response carries an `approvalRequired` body
   (non-stream) or an `approval_required` event (stream). The
   Colloquium UI renders a card with the path, what will / will not be
   read, the secret-redaction disclaimer, and Approve / Decline
   buttons. No file content is read until Approve is clicked.
3. **Token + resend**: clicking Approve builds a single-use approval
   `{ action, path, approvedAt, approvalId }` and resends the
   original message. The token is bound to the path and expires after
   10 minutes (`FILE_APPROVAL_TTL_MS`).
4. **Path safety** (`fileSafety.ts`): the path is checked against
   strict rules (see below). If anything is off, the request is
   `blocked` and the file is not opened.
5. **Stat + read** (`safeFileInspection.ts`): the file is `stat`-ed for
   size; anything over `MAX_INSPECT_FILE_BYTES` (256 KB) is rejected,
   never silently truncated. Read happens via an injected
   `FileInspectionReader` interface that has **only** `stat` and
   `readFile` methods — no `writeFile`, `appendFile`, `unlink`, etc.
6. **Redaction** (`secretRedaction.ts`): before context packing, the
   contents are scanned for obvious secret patterns (OpenAI/Anthropic
   `sk-` tokens, GitHub `ghp_*`/`github_pat_*` tokens, Slack `xox*`,
   AWS access key ids, PEM private keys, JWTs, `Authorization: Bearer`
   headers, and sensitive `KEY=value` env-style assignments).
7. **Pack** (`contextPacker.ts`): the redacted content goes through the
   existing token budgeter. Truncation notes and omissions are
   disclosed in the reply, never silently dropped.
8. **Receipts** (Tabularium): every transition emits a `system` module
   receipt with `cloudUsed: false` and `read_only: true`. The seven
   action ids are:
   ```
   reliability.file-inspection-requested
   reliability.file-inspection-approved
   reliability.file-inspection-denied
   reliability.file-inspection-blocked
   reliability.file-inspection-redacted
   reliability.file-inspection-packed
   reliability.file-inspection-completed
   ```

### Blocked paths

The path-safety layer refuses to even attempt a read when any of these
hold:

- The path is empty / non-string.
- The path contains `..` anywhere (rejected before resolution).
- The path is absolute but outside the configured project root.
- After resolution the path is outside the project root.
- Any segment is in `node_modules`, `.git`, `.next`, `dist`, `build`,
  `coverage`, `out`, `.cache`, `.turbo`, `.vercel`, `tmp`, `.pnpm-store`,
  or `.yarn`.
- The basename matches a blocked pattern: `.env*`, `.npmrc`, `.netrc`,
  `.htpasswd`, `aws-credentials`, `id_rsa*`, `id_ed25519*`, `*.pem`,
  `*.key`, `*.cer`, `*.crt`, `*.p12`, `*.pfx`, `*.keystore`,
  `known_hosts`, `authorized_keys`, `secrets*`, `credentials*`, `*.lock`.
- The extension is not one of: `.ts .tsx .js .jsx .json .md .mdx .css
  .scss .html .yml .yaml .txt`.
- The file size is greater than 256 KB.

### Redaction limitations (honest)

Secret redaction is **best-effort**. It catches obvious / common
patterns. It will:

- **Miss** hand-rolled custom token formats.
- **Miss** encoded or obfuscated secrets.
- **Miss** multi-line keys that don't use PEM markers.
- **Possibly over-redact** strings that look key-shaped but aren't.

If a file might contain secrets and you are not sure, **do not approve
the read**. Path-safety blocks `.env`, key files, and credentials
outright — there is no approval that unblocks them.

### Why writing remains disabled

The chat surface still has no write path. `make_small_text_change_and_verify`
is a typed stub gated behind `ToolEnvironment.allowWriteOperations`, and
the Node reader exported from `fileInspectionChat.ts` exposes only
`stat` and `readFile`. A future approval-gated tiny-edit workflow is
sketched in the roadmap below but is **not implemented**.

### Future step: approval-gated tiny edit workflow

When (if) we enable real text edits from chat, we plan to reuse the same
approval model with extra constraints:

1. Edit approval requires both the path AND a hash of the exact
   `find` / `replace` pair the user approved.
2. The edit tool reads → applies the exact patch → re-reads to verify
   the change matches what was approved.
3. A `verify` callback (e.g., a test run) must return OK before the
   edit is considered committed.
4. Receipts include before/after hash so a tampering attempt is
   detectable in the audit log.

None of that is wired today. The current stub returns "edit-tool
disabled" and writes nothing.

## Other limitations

- The reliability runner wraps `/api/chat` and `/api/chat/stream` only
  for the narrow intents listed above (health-check, summarize-error,
  code-explanation wrap, file inspection). Other chat falls through
  unchanged.
- The code-graph indexer uses conservative regex only — no real
  TypeScript AST parsing.
- The edit-and-verify tool is a typed stub. The contract is in place
  (`allowWriteOperations` + `writeFile`), but no production caller
  flips the flag.
- Token budgeting uses character counts as a deterministic proxy for
  tokens. We do **not** pretend to count tokens for an arbitrary model
  tokenizer.

## Future code-graph roadmap

The current scaffold gives:

- file-level nodes with kind/exports/imports/calls,
- substring-based `queryCodeGraph`,
- a hard cap (`maxNodes`) and per-file size limit (`maxFileBytes`).

Plausible next steps, all out of scope for this PR:

1. Plug in a real TS parser (`ts.SyntaxKind` walk) for higher fidelity.
2. Build inter-file edges (imports ↔ exports) into a directed graph.
3. Cache the graph in `~/.cache/squidley` rather than re-indexing per run.
4. Wire `queryCodeGraph` into the reliability runner so a "which file
   matters?" step happens before the model is called.

## Teacher integration

A beginner-friendly markdown lesson lives at
`docs/teacher-kb/15-small-model-reliability.md`. It is intentionally not
registered in `TEACHER_LESSONS` in this commit because the teacher
subsystem on `main` is still untracked work-in-progress; whoever lands
the teacher subsystem should add a `small-model-reliability` entry that
points at this markdown file (`level: beginner`, `module: local_mode`,
`requiredForRelease: false`, prerequisite `local-models`).

UI copy strings live in `src/lib/reliability/copy.ts` and can be
rendered anywhere. The `buildReliabilityIntroCard()` helper returns a
plain object — UI is free to style it.

## Changelog

- `95000e4` — Add `src/lib/reliability/` module: types, context packer,
  compound tools, runner, decompose, escalation, code-graph scaffold,
  copy. 69 new tests.
- `7f29267` — Wire reliability layer into chat for `health_check` and
  `summarize_error` intents. 21 new tests.
- `8b6e794` — Wrap local model answers for code-explanation /
  debugging intents with 1-retry + honest fallback. 43 new tests.
- _this commit_ — Approval-gated, read-only file inspection. Path
  safety, secret redaction, approval tokens, chat intent, route +
  stream wiring, minimal UI panel with real Approve / Decline buttons.
  79 new tests; full suite stays green at 1796 passing.
