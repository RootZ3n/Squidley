# Known Limitations

Public Squidley is intentionally local-first and beginner-safe. These limits are
part of the current product boundary.

## Not Included Yet

- No cloud unlock.
- No cloud fallback.
- No accounts, authentication, billing, or sync.
- No backend database.
- No telemetry upload.
- No vector database, embeddings, or RAG.
- No agents or autonomous task runners.
- No tool execution.
- No shell execution.
- No repo-wide edits.
- No automatic file-system writes.

## Module Limits

- Colloquium requires a reachable local Ollama-compatible server and an
  installed local model.
- Velum is deterministic pattern review. It is a helper, not a guarantee.
- Archivum stores entries in browser `localStorage` only.
- Tabularium receipts are browser-local and are not external audits.
- Oculus requires a local vision-capable model for image analysis.
- Oculus does not watch the screen, use the camera, or store images by default.
- Fabrica is single-file suggestion only. It does not write files, run commands,
  or behave like a coding agent.
- Nous provider registry entries for cloud providers are metadata only and are
  locked/off by default.

## Browser Storage

Local chats, Archivum entries, Tabularium receipts, and Nous model preferences
are saved in this browser. Clearing browser storage can remove Squidley data.

Use each module's export controls before clearing storage if you want a local
backup.
