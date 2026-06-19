# Tabularium in Peh

Tabularium is Peh's local receipt room. It helps you understand what
happened, what stayed local, what used a model, and what changed in this
browser.

## What Receipts Are

A receipt is a small local record for a visible action, such as:

- sending a Colloquium message to the local model server
- completing, failing, or stopping a local chat response
- reviewing text in Velum
- creating a redacted preview
- handing a redacted draft between Velum and another module
- saving Oculus analysis text to Archivum
- creating, copying, exporting, or saving a Fabrica single-file suggestion as an Archivum note
- Prompt Gateway pauses, warnings, or caution-added events before local model calls
- saving, editing, deleting, or exporting an Archivum entry
- exporting or importing an Archivum bundle
- resetting tour or first-run state in Settings
- clearing local Colloquium chats from Settings

Receipts are plain-language summaries. They are meant to build trust by showing
what Peh did.

## Local Storage

Public Tabularium stores receipts in browser `localStorage`:

```text
peh.tabularium.receipts.v1
```

The store is versioned and safe-parsed. If the stored data is corrupt or from an
unsupported version, Peh starts with an empty receipt list instead of
crashing.

Receipts include local-only metadata:

- `localOnly: true`
- `cloudUsed: false`
- `modelUsed`
- `toolsUsed: false`

## Privacy

Tabularium is browser-local only:

- no telemetry upload
- no backend receipt logging
- no cloud sync
- no accounts
- no external audit log

Receipts should avoid storing full pasted text, chat text, secrets, or private
content. Fabrica receipts also avoid storing full source or generated file
content. Receipts store short summaries and small metadata instead.

Module pages build their own receipt payloads through module-owned helpers, then
hand those payloads to Tabularium for central browser-local storage. Tabularium
owns the storage contract; modules own the meaning of their own actions. Nous
owns model-preference receipts, and Settings owns receipts for local
storage-management controls.

## Search, Filters, and Details

The `/tabularium` page lets you search and filter receipts locally by:

- module
- status
- model used / no model
- title, summary, module, or action text

Opening a receipt shows timestamps, module, action, status, local/cloud/model
flags, provider/model when relevant, related item id, safe metadata, and a safe
summary. Prompt Gateway receipts show risk level and finding categories, but not
raw prompt text.

Some module pages link directly to a safety receipt with:

```text
/tabularium?receipt=<local-receipt-id>
```

The link contains only the local receipt id. If the receipt has been cleared
from this browser, Tabularium shows a calm not-found note.

Receipt details also include **Report issue with this receipt** when the public
bug report email is configured. The generated email includes only the receipt id
and safe receipt fields such as module, action, status, summary, and existing
safe metadata. It does not attach raw prompts, source text, image data, local
storage, or logs.

## Export and Clear

**Export Receipts** creates a local text export with:

```text
Peh Public Tabularium Export
exportedAt
localOnly: true
cloudUsed: false
```

**Clear Receipts** removes only Tabularium receipts saved in this browser after
confirmation:

```text
This only clears receipts saved in this browser.
```

Nothing is uploaded.

## What This Is Not

Tabularium public v0.1 is not external auditing, compliance logging, telemetry,
or cloud history. It is a local, beginner-readable receipt center for public
Peh.
