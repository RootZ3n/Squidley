# Settings in Public Squidley

Settings is Public Squidley's local control center. It helps you understand and
manage what this browser stores for Squidley.

## Local Model

Settings shows read-only local model information:

- active local endpoint
- backend type: Ollama, auto-detecting, or OpenAI-compatible local backend
- configured/default model
- currently selected model when known
- local server health
- discovered model count

Endpoint and model editing are read-only in this pass because chat API routes
use server-side configuration. Public Squidley does not use cloud fallback here.

## Tours and Onboarding

Settings can restart guided tours for:

- Colloquium
- Velum
- Archivum
- Tabularium

It can also reset the welcome and first-run state. These controls affect only
this browser.

## Local Chat Storage

Settings shows:

- local chat session count
- saved message count
- chat receipt count

Controls:

- export all local chats as a client-side text file
- clear all local chats after confirmation

Nothing is uploaded.

## Archivum Storage

Settings shows:

- Archivum entry count
- tag count
- approximate character count

Controls:

- link to Archivum import/export bundle controls
- clear all Archivum entries after confirmation

Clearing Archivum does not clear Tabularium receipts.

## Tabularium Receipts

Settings shows:

- receipt count
- oldest receipt date
- newest receipt date

Controls:

- export receipts as a client-side text file
- clear receipts after confirmation

Receipt retention is not editable yet; Public Squidley currently keeps the
existing local receipt cap.

## Privacy and Local-Only

In the current public local version:

- Colloquium uses the configured local model server.
- Velum review is deterministic and client-side.
- Archivum entries are stored in this browser.
- Tabularium receipts are stored in this browser.
- No cloud fallback is used.
- No telemetry is uploaded.

Clearing browser storage may remove local Squidley data.

## Bug Reports

Settings includes a **Report issue** link when
`NEXT_PUBLIC_BUG_REPORT_EMAIL` is configured. The link opens a prefilled email.
No telemetry, logs, local storage, prompts, documents, or images are attached
automatically. Users choose what to send and can attach screenshots manually.
