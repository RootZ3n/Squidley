# Squidley Public

Squidley Public is a beginner-friendly, **local-first**, companion-guided AI
workspace. It teaches users from inside the app and keeps the public demo honest
about what is local, what uses a model, what is saved in the browser, and what
is not implemented yet.

This repository is the standalone public Squidley product. It is not a private
lab system and it is not an autonomous coding agent.

## What It Is

- **Beginner-friendly**: guided tours and plain-language module copy.
- **Local-first**: core workflows use browser storage and a local
  Ollama-compatible model server.
- **Safe-by-default**: no surprise cloud calls, no shell execution, no
  background agents, no automatic file writes.
- **Transparent**: Tabularium receipts and Nous model/provider maps explain what
  happened.
- **Adaptive**: Ratio, Squidley's Adaptive System Intelligence layer, decides
  which behavior is safe for the current model, provider, unlock level, and
  permissions. Small Ratio notes now appear across module pages, with Nous as
  the full map.
- **Modular**: the public app uses a small core and module-owned features.
  Core provides contracts and orchestration; modules own their UI, storage,
  tours, receipts, handoffs, and docs.

## What It Is Not

- No cloud unlock or cloud fallback.
- No API key collection.
- No accounts, billing, auth, or sync.
- No backend database.
- No telemetry upload.
- No vector database, embeddings, or RAG.
- No agents, tools, shell execution, or repo-wide edits.

## Quick Start

Install dependencies and pull the default local model:

```bash
npm install
ollama pull llama3.2
npm run dev
```

Open:

```text
http://localhost:3000
```

If Ollama is not already running:

```bash
ollama serve
```

Defaults:

```text
SQUIDLEY_LOCAL_ENDPOINT=http://localhost:11434
SQUIDLEY_LOCAL_MODEL=llama3.2
NEXT_PUBLIC_BUG_REPORT_EMAIL=bugs@example.com
```

See [.env.example](.env.example) and
[docs/LOCAL_MODEL_SETUP.md](docs/LOCAL_MODEL_SETUP.md).

## First Demo Path

1. Start the app.
2. Click **Start Tour** on the welcome page.
3. Chat in **Colloquium** with a local model.
4. Review text in **Velum** before sharing it.
5. Save a note in **Archivum**.
6. Check **Tabularium** receipts.
7. View **Nous** to see model/provider status.
8. Try **Fabrica** for a single-file suggestion.

## Screenshots

Screenshots are not committed yet. Suggested demo captures:

- Welcome: `docs/screenshots/welcome.png`
- Colloquium local chat: `docs/screenshots/colloquium.png`
- Modules on mobile: `docs/screenshots/modules-mobile.png`

## Current Modules

| Module | What it does in Public Squidley |
| --- | --- |
| Colloquium | Local-only streaming chat with local model discovery and sessions. |
| Velum | Deterministic client-side text review and redaction helper. |
| Archivum / More Input | Browser-local notes, tags, search/filter/edit, import/export bundles. |
| Oculus | Manual image preview and optional local vision analysis. Images are not stored by default. |
| Fabrica | Beginner single-file suggestion workshop. No shell, tools, repo-wide edits, or file writes. |
| Tabularium | Browser-local receipts explaining what happened and what stayed local. |
| Nous | Module/model map, Ratio adaptive intelligence, local model preferences, and locked provider metadata. |
| Settings | Local control center for tours, storage summaries, and clear/export controls. |
| Modules | Public module gallery with core local and locked cloud-unlock modules. |

Cloud-unlock modules are visible as future/advanced concepts, but remain locked.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` | Production build. |
| `npm run start` | Run the production build. |
| `npm run lint` | ESLint via `next lint`. |
| `npm run typecheck` | TypeScript `--noEmit` typecheck. |
| `npm test` | Run Vitest unit tests once. |

## Safety and Privacy Notes

- Colloquium, Oculus, and Fabrica call only the configured local
  Ollama-compatible endpoint.
- Velum runs deterministic checks in the browser and does not call a model.
- Archivum, Tabularium, chat sessions, and Nous preferences are browser-local.
- Receipts avoid storing full source text, full generated output, image data, or
  secrets.
- Bug reports open a prefilled email. Squidley does not upload telemetry or
  attach logs, local storage, prompts, documents, or images automatically.
- Clearing browser storage can remove local Squidley data.

## Known Caveats

- Oculus vision depends on local Ollama vision model reliability.
- Cloud providers are prepared/locked metadata only.
- No accounts, cloud sync, backend database, agents, tools, or shell execution.
- Storage is browser-local only.

## Local-First Trust Model

Public Squidley uses a layered local-first trust architecture: capability
states, gateway prompt-injection defense, policy boundaries, Velum review
before cloud, explicit consent flow, and Tabularium trust chains. Consent
does not equal execution. See [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md).

## Documentation

- [docs/PUBLIC_RELEASE_CHECKLIST.md](docs/PUBLIC_RELEASE_CHECKLIST.md) — release/demo checklist.
- [RELEASE_NOTES.md](RELEASE_NOTES.md) — v0.1.0 release notes.
- [docs/LOCAL_MODEL_SETUP.md](docs/LOCAL_MODEL_SETUP.md) — Ollama and local model setup.
- [docs/LOCAL_SERVICE.md](docs/LOCAL_SERVICE.md) — run Public Squidley as a local user service.
- [docs/BUG_REPORTING.md](docs/BUG_REPORTING.md) — privacy-respecting mailto bug reports.
- [docs/PROMPT_GATEWAY.md](docs/PROMPT_GATEWAY.md) — deterministic gateway checks before local model calls.
- [docs/ADAPTIVE_SYSTEM_INTELLIGENCE.md](docs/ADAPTIVE_SYSTEM_INTELLIGENCE.md) — Ratio adaptive behavior and capability decisions.
- [docs/MODULAR_ARCHITECTURE.md](docs/MODULAR_ARCHITECTURE.md) — small-core/module-boundary rules.
- [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) — current boundaries.
- [docs/LOCAL_CHAT.md](docs/LOCAL_CHAT.md) — local chat adapter and troubleshooting.
- [docs/LOCAL_CONVERSATIONS.md](docs/LOCAL_CONVERSATIONS.md) — local chat storage.
- [docs/SETTINGS_PUBLIC.md](docs/SETTINGS_PUBLIC.md) — local control center.
- [docs/VELUM_PUBLIC.md](docs/VELUM_PUBLIC.md) — text review and redaction.
- [docs/ARCHIVUM_PUBLIC.md](docs/ARCHIVUM_PUBLIC.md) — local knowledge shelf.
- [docs/FABRICA_PUBLIC.md](docs/FABRICA_PUBLIC.md) — single-file workshop.
- [docs/OCULUS_PUBLIC.md](docs/OCULUS_PUBLIC.md) — manual image review.
- [docs/TABULARIUM_PUBLIC.md](docs/TABULARIUM_PUBLIC.md) — local receipts.
- [docs/NOUS_PUBLIC.md](docs/NOUS_PUBLIC.md) — model map and provider registry.
- [docs/MODULE_MATRIX.md](docs/MODULE_MATRIX.md) — module list and capability matrix.
- [docs/LOCAL_ONLY_PRINCIPLES.md](docs/LOCAL_ONLY_PRINCIPLES.md) — local-first principles.
- [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) — local-first trust architecture and cloud consent flow.

## Stack

- Next.js 14 App Router
- React 18
- TypeScript 5
- Tailwind CSS 3
- Vitest

## License

Apache-2.0. See [LICENSE](LICENSE).
