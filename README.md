# Squidley

A beginner-friendly, **local-first**, companion-guided AI workspace.

This repository is the **public Squidley product**. It is a fresh, standalone codebase — it is not Squidley V1 and it is not Squidley V2. Squidley V2 exists only as a *lessons-learned* reference; private lab assumptions, hardcoded paths, debug panels, and autonomous lab systems do not belong here.

## Philosophy

- **Beginner-friendly** — Squidley teaches you how to use Squidley, from inside the app.
- **Local-first** — Core modules work without cloud dependencies.
- **Safe-by-default** — No autonomous shell execution, no auto-installed background agents.
- **Companion-guided** — A first-run tour introduces each module before you use it.

## Quick start

```bash
# Pull a small local model with Ollama (one-time)
ollama pull llama3.2

# Run Squidley
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Colloquium's Send button talks to a local Ollama-compatible server at
`http://localhost:11434` by default. See [`docs/LOCAL_CHAT.md`](docs/LOCAL_CHAT.md)
for the full setup, environment variables, and the local-only guarantee.

On first run you will see the **Welcome** screen with two options:

- **Start Tour** — Squidley walks you through Colloquium (chat) first.
- **Skip Tour** — Routes straight to the main app.

Your choice is persisted in `localStorage` (`squidley.firstRun.completed`, `squidley.tourMode`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` | Production build. |
| `npm run start` | Run the production build. |
| `npm run lint` | ESLint via `next lint`. |
| `npm run typecheck` | TypeScript `--noEmit` typecheck. |
| `npm test` | Run Vitest unit tests once. |

## Stack

- [Next.js 14](https://nextjs.org) (App Router)
- [React 18](https://react.dev)
- [TypeScript 5](https://www.typescriptlang.org)
- [Tailwind CSS 3](https://tailwindcss.com)
- [Vitest](https://vitest.dev) for unit tests

## Repository layout

```
src/
  app/                      Next.js App Router pages & layout
    page.tsx                Welcome / first-run screen
    colloquium/page.tsx     Chat / Colloquium module
    modules/page.tsx        Module gallery
  components/               Reusable UI components
  lib/
    modules/registry.ts     Public module registry (data-driven)
    tour/colloquium.ts      Tour data for Colloquium
  styles/globals.css        Tailwind entry
public/
  squidley/                 Mascot assets (placeholder + drop-in location)
docs/
  PUBLIC_PRODUCT_SPEC.md
  MODULE_MATRIX.md
  LOCAL_ONLY_PRINCIPLES.md
  LESSONS_FROM_SQUIDLEY_V2.md
```

## Modules

Public Squidley ships with two tiers of modules:

- **Core local** — work with local-only mode: Colloquium, Fabrica, Archivum, More Input, Velum, Archelon, Oculus, Tabularium, Nous.
- **Cloud unlock** — visible but gated: Legatus, Probatio, Imperium, Praertorium, Imaginanium.

See [`docs/MODULE_MATRIX.md`](docs/MODULE_MATRIX.md) for the full matrix.

## Documentation

- [`docs/PUBLIC_PRODUCT_SPEC.md`](docs/PUBLIC_PRODUCT_SPEC.md) — what public Squidley is and is not.
- [`docs/MODULE_MATRIX.md`](docs/MODULE_MATRIX.md) — module list & capabilities.
- [`docs/LOCAL_ONLY_PRINCIPLES.md`](docs/LOCAL_ONLY_PRINCIPLES.md) — what "local-first" means here.
- [`docs/LOCAL_CHAT.md`](docs/LOCAL_CHAT.md) — Colloquium's local chat adapter, env vars, and troubleshooting.
- [`docs/LESSONS_FROM_SQUIDLEY_V2.md`](docs/LESSONS_FROM_SQUIDLEY_V2.md) — what we kept and what we dropped.

## License

TBD.
