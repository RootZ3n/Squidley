# Public Release Checklist

Use this before a public demo or release tag.

## Local Setup Checks

- Run `npm install`.
- Copy `.env.example` to `.env.local` only if you need non-default local model settings.
- Confirm `SQUIDLEY_LOCAL_ENDPOINT` defaults to `http://localhost:11434`.
- Confirm `SQUIDLEY_LOCAL_MODEL` defaults to `llama3.2`.

## Ollama Checks

- Install Ollama from `https://ollama.com/download`.
- Start the local server if needed:
  ```bash
  ollama serve
  ```
- Pull a basic chat model:
  ```bash
  ollama pull llama3.2
  ```
- Optional for Oculus:
  ```bash
  ollama pull llava
  ```

## Route Smoke Checklist

- `/` shows welcome and first-run choices.
- `/modules` lists core local modules and locked cloud-unlock modules.
- `/colloquium` checks health, discovers models, streams local chat, and does not auto-send imports.
- `/velum` reviews/redacts text locally and does not store pasted text by default.
- `/archivum` saves, searches, edits, exports, imports, and deletes local entries.
- `/oculus` previews a manually selected image and never stores image data by default.
- `/fabrica` creates single-file suggestions only and never writes files.
- `/tabularium` shows local receipts without full sensitive content.
- `/nous` shows module/model/provider maps with cloud providers locked.
- `/settings` summarizes local storage and local-only controls.

## Local-Only and Privacy Checklist

- No cloud provider is enabled by default.
- No API key fields are shown.
- No telemetry upload exists.
- No backend database is required.
- No shell/tool execution is exposed.
- No module claims to save files automatically.
- Cloud providers in Nous are described as prepared and locked.

## Receipt and Storage Checklist

- Chat, Velum, Archivum, Oculus, Fabrica, Settings, and Nous actions create safe receipts where expected.
- Receipts avoid full pasted text, full chat text, full source code, image data, and secrets.
- Browser storage is versioned and safe-parsed.
- Clear/export controls explain that data is browser-local.

## Known Limitations

- See `docs/KNOWN_LIMITATIONS.md`.
- Fabrica is not a coding agent.
- Velum is not a legal/security guarantee.
- Tabularium is not external auditing.
- Oculus needs a local vision model for analysis.
- Archivum is not RAG and has no vector database.

## Intentionally Not Included

- Cloud unlock.
- Auth, billing, accounts, or sync.
- API key collection.
- Backend database.
- Agents, tools, shell execution, or repo-wide edits.
- Embeddings, vector DB, or RAG.
- Private/lab-specific behavior.

## Pre-Release Commands

```bash
npm install
npm run typecheck
npm test
npm run build
git diff --check
```
