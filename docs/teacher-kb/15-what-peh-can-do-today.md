# What Peh Can Actually Do Today

This module describes what Peh can do RIGHT NOW, in plain
language. It uses the same six tiers as
[the capability taxonomy](../CAPABILITY_TAXONOMY.md): LOCAL_READY,
LOCAL_LIMITED, LOCAL_PARTIAL, CLOUD_PLANNED, NOT_IMPLEMENTED, BLOCKED.

If a future module or UI label uses a different word for the same
thing, this module is the truth — they are the ones that should
update.

## Use freely (LOCAL_READY)

These run on your machine. No approval needed. No cloud calls.

- **Chat with a local model** — type a question; Peh sends it to
  your Ollama or llama-server endpoint and shows the answer with a
  provenance footer ("answered by local model only · no tool used ·
  no cloud used").
- **Ask Peh about herself** — questions like "what is a local
  model?" or "what does an approval gate do?" get answered from a
  built-in concept registry without calling the model.
- **Ask Peh to plan** — give a goal and Peh produces a
  structured plan with evidence labels ("known", "inferred", "assumed",
  "missing"). The plan never runs by itself.
- **See provenance** — every reply shows where it came from.
- **See receipts** — the Tabularium tab lists what Peh actually
  did. Browser-local; nothing leaves your machine.
- **Save notes** — Archivum stores notes in your browser. No upload.
- **Run diagnostics** — Nous shows what is configured and connected.
- **Get a deterministic review** — Velum runs a heuristic pre-check on
  text before you send it to a model. Not a guarantee of safety, but
  catches common risks.
- **Get honesty corrections** — if the model claims to have done a
  tool action this build does not have, Peh adds a correction
  note: "Peh did not …".

## Use after approval (LOCAL_LIMITED)

These run on your machine, but Peh always asks first. The
approval prompt shows exactly what will happen.

- **Approval-gated file inspection** — ask "what does file X do?";
  Peh shows an approval prompt for that exact path. If you
  approve, Peh reads up to 256 KB of that file once, redacts any
  secrets, and explains it. Approval is bound to that path and
  expires in ten minutes. Peh cannot use the same approval to
  read a different file.
- **Approval-gated tiny edits** — ask "replace this snippet with that
  snippet in file X"; Peh shows a diff preview and an approval
  prompt. The original snippet must already exist in the file exactly
  once. The diff is capped at 4 KB. If you approve, Peh keeps an
  in-memory backup, replaces the snippet, re-reads the file, and runs
  verification checks. If verification fails, Peh rolls back to
  the backup and tells you why.
- **Local image analysis (Oculus)** — works only if your local model
  is vision-capable. If it isn't, Peh refuses with a clear
  message instead of guessing.

For both inspection and tiny edits, the approval prompt says exactly
what Peh wants to do, why, and what will happen. "Decline" is
always an option. Receipts record both the request and the outcome.

## Use, but quality varies (LOCAL_PARTIAL)

These work, but the answer quality depends on the local model you
have installed, or on the backend (Ollama vs llama-server).

- **Small-model reliability layer** — if your local model is small
  (under 7B parameters), Peh wraps complicated questions in a
  bounded loop of small compound tools (explain project structure,
  inspect one file safely, summarise an error and the next step, run
  a local health check). Bounded means: max 6 steps, max 2 retries,
  no shell, no broad file access. The reliability layer can suggest
  cloud escalation but cannot run it.
- **Single-file code suggestion (Fabrica)** — Peh reads a single
  file you paste in and proposes edits. Suggestions only. Fabrica
  never writes to disk; if you want to apply a change, use the tiny
  edit flow.
- **Advanced planning** — plans are better with a 7B+ model. Smaller
  models still produce a plan, but expect rougher confidence labels.
- **llama.cpp / llama-server backend** — the code path works (unit
  tests pass via the OpenAI-compatible endpoint), but real-binary
  validation is pending. Until then, Ollama is the validated default.

## Planned but dead today (CLOUD_PLANNED)

The architecture exists. The adapters do not. Setting an API key does
not change this — Cloud Mode requires both `PEH_MODE=cloud` AND
a wired adapter, and no adapters exist yet.

- Cloud chat with any provider (OpenAI, Anthropic, Google Gemini,
  OpenRouter, Minimax, Z.ai).
- Cloud streaming.
- Cloud escalation (the reliability layer can suggest it; it cannot
  run the call).
- Advanced cloud-only features: multi-file build, agent workflows,
  cloud vision, cloud image generation, evaluation.

The phrase you will see in the UI: "Cloud Mode is not implemented
yet."

## Not built (NOT_IMPLEMENTED)

These have no code path. The honesty corrector overrides any model
claim that one of these happened.

- Shell command execution.
- Web search and browsing.
- Multi-step autonomous loops without approval at each step.
- Multi-file editing.
- Broad filesystem access (delete, move, write outside the tiny edit
  flow).
- Memory write to a persistent store (Archelon).
- Document parsing (PDF, DOCX, etc.).
- Package install, git operations.
- Sending email or external messages.

## Refused by design (BLOCKED)

These are contracts, not roadmap items. The codebase actively
prevents them with type-level guards or runtime checks.

- Unrestricted filesystem access — every read is path-bound and
  approval-bound.
- Hidden cloud calls — `cloudUsed: false` is a type, not a flag.
- Silent tool execution — every action emits a receipt.
- Destructive planning — the planner refuses delete / deploy /
  shell goals.
- Cloud fallback on local failure — there is no fallback path.

## Common Beginner Questions

**Q: Can Peh change files on my computer?**
Only one file at a time, only a single snippet, only after you
approve the exact diff. Anything broader is blocked.

**Q: Can Peh read my whole project?**
No. Peh can read one file at a time, only after you approve
that exact path, up to 256 KB, with secrets redacted.

**Q: Can Peh call a cloud model?**
Not in this build. Cloud Mode is architecture only.

**Q: Can Peh run shell commands?**
No. The planner refuses any shell-shaped goal and surfaces "Peh
does not run shell commands."

**Q: What if the model claims to have done something it didn't?**
The honesty corrector catches common false claims and adds a
correction note under the reply.

**Q: How do I undo an edit?**
Tiny edits keep an in-memory backup during the apply step and roll
back automatically if verification fails. For successful edits, the
diff and the receipt are stored so you can manually revert.

## Check Your Understanding

- What does Peh have to ask you before reading a file?
- What is the maximum size of a tiny edit?
- Why does "Cloud Mode is not implemented yet" appear when you click
  a cloud option?
- What is the difference between a LOCAL_READY capability and a
  LOCAL_LIMITED capability?
