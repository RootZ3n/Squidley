# Small Local Models and Reliability

Small local models — the ones small enough to run on a normal laptop —
are useful, but they need guardrails. Squidley's reliability layer adds
those guardrails so Local Mode stays honest and usable.

## Why a small model can struggle

A small model has a smaller "memory" and fewer parameters. That means:

- Long inputs make it forget things.
- One big task done in a single shot is much harder than many small
  tasks done one at a time.
- It will sometimes return an empty answer or repeat a previous mistake.

That is the nature of small models. Squidley does not pretend the small
model is bigger than it is — instead, she works *with* it.

## What Squidley does to stay reliable

There are five tools in the reliability layer:

1. **Compound tools.** Small, focused actions like
   "list the project structure", "inspect one file safely",
   "summarize an error". The model does not have to do everything in
   one shot. Each compound tool returns a structured result and
   stops there.

2. **Token budgeting.** Squidley never dumps a whole large file into
   the prompt. If a file is too big, she truncates it with a *visible*
   note and tells you what was left out. The middle of important code
   is never silently removed.

3. **Bounded retries.** If a step fails, Squidley tries again — once.
   Not forever. The retry limit is fixed in policy.

4. **Decompose on failure.** If the same error keeps happening, or if
   the retry budget runs out, Squidley stops looping and suggests
   smaller next steps instead.

5. **Optional cloud escalation.** If local keeps failing, Squidley can
   *offer* to ask a cloud model. She never does this automatically.
   Before any cloud call would happen, you see exactly what would be
   sent (with secrets and emails redacted), and you decide.

## What Squidley does NOT do

- She does not silently call cloud, even if you have a cloud API key.
- She does not silently truncate the middle of code.
- She does not pretend a failed retry succeeded.
- She does not keep looping when the same error returns twice.

## Why this matters for beginners

Local-first does not mean pretending local models can do everything.
It means: do as much as you can locally, do it honestly, and only ever
*offer* to escalate when local genuinely cannot finish the job.
