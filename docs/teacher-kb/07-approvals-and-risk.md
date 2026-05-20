# Approvals and Risk

Not every action Squidley can take is equally risky. Reading a file
is safer than writing one. Generating a suggestion is safer than
applying it. Squidley sorts actions into tiers and asks for approval
before doing anything risky.

This module describes the approval gates that ACTUALLY EXIST today,
plus the ones planned for future capabilities.

## What Squidley Asks Approval For Today

In this public Squidley build, there are two real approval-gated
flows. Both are LOCAL_LIMITED in
[the capability taxonomy](../CAPABILITY_TAXONOMY.md):

### 1. Approval-gated file inspection

When you ask "what does this file do?", Squidley shows an approval
prompt that names:

- the exact file path she wants to read
- the maximum size she will read (256 KB)
- that the read is one-time, read-only, with secrets redacted

The buttons say "Approve and read once" and "Decline". After you
approve, Squidley reads that file once and only once. The approval
token expires in ten minutes and is bound to that exact path —
Squidley cannot use it to read a different file.

After approval she shows: "Approved. Squidley is reading the file
once and will not change it."

If you decline: "Declined. The file was not read."

### 2. Approval-gated tiny edits

When you ask Squidley to replace a snippet, she:

1. checks that the file is already inspected (so you saw it first),
2. confirms the original snippet appears EXACTLY ONCE in the file,
3. shows a diff preview (the old lines and the new lines),
4. shows the approval prompt: "Approve this edit".

The diff is capped at 4 KB. The approval token is bound to four
hashes — the path, the original snippet, the proposed snippet, and
the current full file. Any change to any of those invalidates the
token.

If you approve, Squidley keeps an in-memory backup, applies the edit
once, re-reads the file, and runs verification checks. If verification
fails, she rolls back to the backup and tells you why.

After approval she shows: "Approved. Squidley is applying the edit
and verifying it now."

If you decline: "Declined. No edit was applied."

## Risk Tiers in This Build

| Tier | Examples in this build | Approval? |
|---|---|---|
| Low risk | Local chat, planning, diagnostics, receipt viewing, notes, deterministic text review (Velum) | No |
| Medium risk | Approval-gated file inspection, local image analysis | Per-action |
| High risk | Approval-gated tiny edits | Per-action (with hash binding) |
| Refused | Shell, web search, multi-file edit, broad filesystem access, anything destructive | Always blocked |

There is no path to bypass an approval gate. There is no path to
trigger a refused action.

## Risk Tiers Planned for Future Phases

These do not exist yet. The current build's approval system is the
foundation they will use when they ship.

| Tier | Examples (future) | Approval model |
|---|---|---|
| Medium risk | Repository inspection (multi-file), document parsing, web search | Per-action receipt |
| High risk | File write (general), file delete, code editing across files, git operations | Scoped approval |
| Very high risk | Shell command execution, package install, sending data externally | Explicit scoped approval + receipts |

If you read this in a UI panel that says "Approval gate" but no
approval prompt actually appears, that panel is for a future
capability that has not shipped yet.

## What Every Approval Prompt Tells You

Before you say yes, Squidley always shows:

1. **What she wants to do** — the exact path, snippet, or action.
2. **Why it is risky** — a short, beginner-readable reason.
3. **What will happen if you approve** — the literal next step.
4. **What will NOT happen** — for example: the read won't store
   anything beyond the receipt; the edit won't touch a second file.

If any of those are missing from an approval panel, that is a bug
worth reporting.

## Important: Cloud Mode Does Not Skip Approvals

Cloud Mode is not implemented yet, but the architecture is explicit:
enabling Cloud Mode would NOT bypass approval gates. High-risk
actions always require explicit, scoped approval — regardless of mode.

## Honesty: What Approvals Don't Protect Against

Approval gates protect against Squidley taking action you didn't say
yes to. They do NOT:

- prove the action is correct
- prove the resulting code works
- prove the model's reasoning is sound

That is why each approved action produces a receipt and the tiny edit
flow runs verification checks after applying. Approval is consent;
verification is proof.

## Check Your Understanding

- Why does Squidley ask permission separately for each file?
- What four pieces of information are bound to a tiny-edit approval
  token?
- If Squidley applies a tiny edit and verification fails, what
  happens?
- Can Squidley use a file-inspection approval to read a different
  file?
- Does enabling Cloud Mode bypass approval gates?
