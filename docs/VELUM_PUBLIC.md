# Velum in Public Squidley

Velum is Squidley's safety and privacy review layer. In this public pass, Velum
helps you pause before sharing text with AI, saving it, or importing it
somewhere else.

## What It Does

Velum runs deterministic checks in the browser for beginner-understandable risk
signals:

- possible secrets, API keys, and tokens
- passwords or credentials
- email addresses
- phone numbers
- simple street-address patterns
- simple personal identifier patterns
- prompt-like or prompt-injection phrases such as "ignore previous
  instructions" or "reveal your instructions"

It returns a plain-language review with an overall risk level and findings.
This is a helper, not a legal, privacy, or security guarantee.

## Guided Tour

Velum includes an in-page guided tour using Squidley's companion tour panel.
Use **Restart tour** on `/velum` to walk through:

- what Velum means
- the paste area
- the Review text button
- findings and explanations
- redacted preview
- the local-only guarantee

## Local-Only Behavior

Public Velum is local-only:

- no cloud calls
- no model calls
- no backend database
- no upload
- no storage of pasted review text by default

The review runs in the browser using simple pattern checks.

## Prompt Gateway Relationship

Velum is the user-controlled review page. Public Squidley also includes an
automatic Prompt Gateway before local model calls. The gateway runs on
model-facing API routes and looks for prompt-injection signals before text is
sent to the local model server.

Both layers are deterministic and local:

- Velum helps you review text before you choose what to do.
- Prompt Gateway quietly checks model requests as a second safety layer.
- Neither layer sends text to a cloud scanning service.
- Neither layer is a perfect guarantee.

See [docs/PROMPT_GATEWAY.md](PROMPT_GATEWAY.md).

## Redacted Preview

Velum can create a local redacted preview. It replaces likely sensitive values
with labels such as:

- `[REDACTED_SECRET]`
- `[REDACTED_EMAIL]`
- `[REDACTED_PHONE]`
- `[REDACTED_ADDRESS]`

The preview does not overwrite the original text unless you click **Use
redacted version**.

## Send Redacted Version to Colloquium

Colloquium has a **Review in Velum** button near the chat draft box. Use it when
you want to pause before sending text to your local model.

The round trip is:

1. Write a draft in Colloquium.
2. Click **Review in Velum**.
3. Velum fills the paste area with that draft and waits.
4. Click **Review text** when you are ready.
5. Create a redacted preview if needed.
6. Click **Send redacted version to Colloquium**.
7. Colloquium fills the draft box and still waits for you to click **Send**.

When a redacted preview exists, Velum can hand that preview to Colloquium with
**Send redacted version to Colloquium**.

This handoff is explicit and browser-local:

- Colloquium-to-Velum handoff uses `sessionStorage`
- only the redacted preview is transferred
- the original pasted text is not included
- Velum-to-Colloquium handoff uses `sessionStorage` briefly, then is consumed once
- Colloquium fills the draft box but does not send automatically
- you must still review the draft and click **Send**
- Colloquium still uses your local model server, with no cloud fallback

Draft text is not placed in the URL.

## Review More Input Before Saving

Archivum's More Input flow can also send pasted text to Velum first. Use
**Review in Velum first** when you want to check a note, snippet, or document
before saving it locally.

The More Input round trip is:

1. Paste text in Archivum's More Input section.
2. Click **Review in Velum first**.
3. Velum fills the paste area with that text and waits.
4. Click **Review text** when you are ready.
5. Create a redacted preview if needed.
6. Click **Send redacted version to More Input**.
7. More Input fills the draft with the redacted preview and still waits for you
   to click **Save to Archivum**.

This uses browser `sessionStorage`, expires automatically, and is consumed once.
It does not place the text in the URL, upload it, or save it automatically.

## Limits

Velum can miss sensitive information, and it can flag text that is harmless.
Use it as a pause-and-review helper. When unsure, remove or redact private
details before sending text to any AI system.
