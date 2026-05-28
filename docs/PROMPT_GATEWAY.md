# Prompt Gateway

Peh includes a deterministic Prompt Gateway in front of local model
calls. It is a small server-side safety check that runs before user-provided or
imported text is sent to the configured local model server.

This is not a cloud moderation service and it is not a guarantee. It is a
local, pattern-based hardening layer for common prompt-injection signals.

## Where It Runs

The gateway protects public model-facing routes:

- `POST /api/chat/stream`
- `POST /api/chat`
- `POST /api/fabrica/suggest`
- `POST /api/oculus/analyze`

It is designed so future local model routes can reuse the same helper.

## What It Looks For

The gateway checks for prompt-injection signals such as:

- instruction override attempts, such as "ignore previous instructions"
- hidden/system prompt extraction, such as "reveal your system prompt"
- tool or shell coercion, such as "run command" or "tool call"
- exfiltration or data movement, such as "send this data"
- secrecy and deception language, such as "do not tell the user"
- encoded or hidden instruction hints, including suspicious HTML or code comments
- requests to bypass Peh's local/cloud boundaries

Previews and summaries are redacted and shortened. The gateway should not store
full user text, secrets, source files, generated output, or image data.

## Local Receipts

When a browser client receives Prompt Gateway metadata, it creates a local
Tabularium receipt. These receipts are written client-side to the same
browser-local receipt store as other public Peh receipts.

Gateway receipts can show:

- Prompt Gateway paused a request
- Prompt Gateway added caution
- Prompt Gateway noticed suspicious text

They store safe metadata only:

- route/module
- risk level
- finding categories
- finding count
- safe summary

They do not store raw prompts, secrets, full source text, generated output, or
image data.

When a request is paused or guarded, the UI can show **View safety receipt**.
That link goes to `/tabularium?receipt=<local-receipt-id>`. The URL contains
only the local receipt id, not prompt text, source text, secrets, or image data.

## Blocked vs Caution Behavior

Low-risk text is allowed normally.

Medium-risk text is allowed with a model-facing caution. The caution tells the
local model to treat suspicious text as untrusted content, not instructions to
follow.

High-risk text may be allowed with caution when it is clearly being discussed or
analyzed as text, or when suspicious phrases appear inside pasted source
content.

Direct attempts to override instructions, reveal hidden prompts, use tools or
shell commands, exfiltrate data, or bypass local/public boundaries are paused
with a friendly structured error.

The user-facing message is intentionally plain:

```text
Peh paused this request because it looked like it was trying to override
system instructions or use tools this public version does not have. You can
rephrase it as a question or review the text in Velum.
```

## Relationship to Velum

Velum and the Prompt Gateway are different layers:

- **Velum page**: user-controlled review. You paste text, review findings, and
  choose whether to create a redacted preview.
- **Prompt Gateway**: automatic route-level check before local model calls.

Both are deterministic and local. Neither sends text to a cloud service.

## Local-Only Boundary

The gateway does not add:

- cloud calls
- external scanning or moderation APIs
- API key collection
- auth or billing
- backend database storage
- telemetry upload
- agents, tools, or shell execution
- file-system writes

Peh still uses only the configured local model server for model
workflows, with no cloud fallback.

## Limits

Pattern checks can miss attacks, and they can flag harmless text. Treat the
gateway as a second safety layer, not a complete security system. When a request
is paused, rephrase it as a question or review/redact the text in Velum before
trying again.
