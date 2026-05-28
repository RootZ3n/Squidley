# Receipts and Provenance

## What is a Receipt?

A receipt is a record of what Squidley actually did. Every action gets a
receipt — whether it is a model answer, a tool call, or a cloud request.

A receipt shows:
- What happened (chat, tool call, cloud request)
- Which model was used
- Whether cloud was called
- Whether tools were used
- The timestamp
- Whether the action succeeded or failed

## What is Provenance?

Provenance means "where did this come from?" Every answer Squidley gives has
a provenance footer that shows:

- **Mode:** Local or Cloud
- **Model:** which model answered
- **Cloud:** whether a cloud call was made
- **Tools:** whether any tools were used

Example: "Local Mode / Ollama / no cloud / no tool"

## The Tabularium

The Tabularium is Squidley's receipt ledger. You can open it any time to
review all the receipts. It is stored in your browser only — clearing browser
data removes it.

Receipts do not store your full text. They store metadata: what happened, when,
how, and the outcome. This protects your privacy while giving you an audit
trail.

## Why Receipts Matter

Model text is not proof. A model saying "I wrote the file" does not mean a
file was written. Only a receipt from a real tool action is proof. This is why
Squidley's honesty system exists — to catch cases where the model claims
something that did not happen.

## Check Your Understanding

- Where can you see your receipts?
- What does the provenance footer tell you?
- Why is a receipt more trustworthy than model text?
