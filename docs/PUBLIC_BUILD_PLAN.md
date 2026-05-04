# Public Squidley — Build Plan

> Created 2026-05-04. Not a release audit — this is the phased build plan
> for bringing public Squidley from current state to shippable MVP.

## Current Repo Assessment

### What exists and works

| Area | State | Detail |
|------|-------|--------|
| **Next.js 14 scaffold** | Working | App Router, layout, sidebar, AppShell, global CSS (299 lines) |
| **Welcome page** | Working | Mascot, tour start/skip, value points, module pills, cloud-unlock locked display |
| **Colloquium (chat)** | Working | 2,051-line client, streaming + non-streaming Ollama proxy, conversation storage (592 lines), sessions, prompt gateway |
| **Velum (review)** | Working | 457-line page, 181-line review engine, 495-line handoff system, deterministic client-side checks |
| **Archivum (notes)** | Working | 829-line page, 459-line storage engine, tags, search, import/export |
| **Tabularium (receipts)** | Working | 348-line page, 301-line receipt engine, gateway receipts |
| **Nous (model map)** | Working | 571-line page, 275-line model preferences, provider registry with 5 providers |
| **Oculus (image)** | Working | 535-line page, vision helpers, handoff system |
| **Fabrica (builder)** | Working | 397-line page, suggestion engine, single-file workshop |
| **Settings** | Working | 358-line page, storage summary, tour controls |
| **Modules gallery** | Working | 308-line page, core + cloud-unlock listings |
| **Ratio (ASI)** | Working | Decision engine, module policies, provider capabilities, UI decisions, unlock levels, 14 files |
| **Tour system** | Working | 7 module tours with step definitions, tested (colloquium: 8 tests, others: 3 each) |
| **Prompt gateway** | Working | 281-line deterministic security layer, tested |
| **Provider registry** | Working | Ollama active, 4 cloud providers prepared/locked |
| **Tests** | Passing | 47 files, 312 tests, all green |
| **Typecheck** | Clean | tsc --noEmit passes |
| **Docs** | Extensive | 21 markdown docs covering every module, architecture, limitations |

### Quantitative snapshot

- **Source**: ~7,039 lines lib (non-test) + ~5,872 lines pages + ~1,200 lines components
- **Tests**: ~4,571 lines across 45 test files, 312 assertions
- **Docs**: 21 files in docs/
- **API routes**: 5 (chat, chat/stream, local/models, local/health, oculus/analyze, fabrica/suggest)
- **Modules with dedicated lib/**: 9 (archivum, chat, colloquium, fabrica, modules, nous, oculus, ratio, velum) + 4 (providers, security, settings, tabularium, tour, support)

### What this means

Public Squidley is **substantially built**. The core local-chat-with-Ollama
loop, all 7 planned modules, the tour system, the receipt system, the prompt
gateway, and the adaptive intelligence layer all exist and pass tests.

This is not a skeleton — it's a real app with ~14K lines of source and 312
tests. The gap is not "build the features" but "verify end-to-end demo path
works on a fresh machine, polish rough edges, and package for distribution."

## Public MVP Scope

### In scope (ship in v0.1.0)

1. **Colloquium** — local streaming chat with Ollama, conversation persistence, prompt gateway
2. **Velum** — client-side text review and redaction, handoff from other modules
3. **Archivum** — browser-local notes with tags, search, import/export
4. **Tabularium** — receipts for what happened and what stayed local
5. **Nous** — model/provider map, local model preferences, Ratio adaptive notes
6. **Oculus** — manual image preview + optional local vision analysis (if practical on fresh install)
7. **Fabrica** — single-file suggestion workshop, no shell/tools/file-writes
8. **Tours** — guided walkthrough of each module
9. **Settings** — tour controls, storage summary, clear/export
10. **Welcome** — mascot, onboarding, module gallery

### Out of scope (not in public v0.1)

- Cloud providers / API key collection
- Accounts, billing, auth, sync
- Backend database
- Telemetry
- Agents, tools, shell execution
- Vector DB / RAG / embeddings
- Multi-user

## Gap List

### Missing core features

| Gap | Priority | Detail |
|-----|----------|--------|
| Fresh-install verification | P0 | No evidence the full demo path works end-to-end on a clean machine with just `npm install && ollama pull llama3.2 && npm run dev` |
| Ollama not-running UX | P0 | What does Colloquium show when Ollama isn't running? Needs clear "start Ollama" guidance, not a cryptic error |
| Model not-pulled UX | P0 | What happens if llama3.2 isn't pulled? Need graceful detection + instruction |
| Streaming error recovery | P1 | If Ollama drops mid-stream, does the UI recover cleanly or leave a half-rendered message? |
| Mobile responsive check | P1 | README mentions phone use; sidebar + chat need to work on small screens |
| Conversation list/management | P1 | Can users see past conversations, rename them, delete them? |

### Broken or partial features

| Issue | Priority | Detail |
|-------|----------|--------|
| ratio.ts missing | P1 | `src/lib/ratio/ratio.test.ts` exists (190 lines) but no `ratio.ts` — tests may import from `index.ts` but worth confirming the test target is real |
| Oculus vision reliability | P2 | README flags this as a caveat — depends on which Ollama vision model is available |
| Fabrica scope boundary | P2 | Need to verify no accidental file-write or shell path exists even in error cases |

### Docs needed (later, for release)

| Doc | When |
|-----|------|
| CHANGELOG.md | Phase 5 |
| SECURITY.md | Phase 6 |
| Screenshots in README | Phase 5 |
| Windows/WSL testing doc | Phase 5 |

### Installer/package work (later)

| Item | When |
|------|------|
| `npm run build` production verification | Phase 5 |
| systemd / launchd service template | Phase 5 |
| Desktop shortcut / PWA manifest | Phase 5 |
| npm package or standalone binary | Phase 5 |

## Phased Build Plan

### Phase 1: Local Chat and Model Detection

**Goal**: The core "install → pull model → chat" path works perfectly on a fresh machine.

- [ ] Fresh-install test: `npm install && npm run dev` on clean checkout
- [ ] Ollama health detection: clear UI state for "not running", "running but no models", "ready"
- [ ] Model pull guidance: if llama3.2 not found, show exact command in Colloquium
- [ ] Streaming error recovery: mid-stream Ollama drop shows a clean error, not a broken UI
- [ ] Conversation list: verify users can see, continue, and delete past conversations
- [ ] Confirm `ratio.ts` / index.ts exports are wired correctly (test target exists)
- [ ] Run `npm run build` (production Next.js build) and verify it completes

**Exit criteria**: A person with Node + Ollama installed can clone, npm install, pull llama3.2, npm run dev, and have a working streaming chat in under 3 minutes.

### Phase 2: Velum + Archivum End-to-End

**Goal**: The review and notes modules work as a coherent flow.

- [ ] Velum: paste text, get review findings, redact, copy clean output
- [ ] Archivum: save a note, tag it, search for it, export bundle, import bundle
- [ ] Velum → Archivum handoff: reviewed text can be saved as a note
- [ ] Colloquium → Velum handoff: chat output can be sent to Velum for review
- [ ] Receipts fire correctly for each action

**Exit criteria**: User can chat → review output in Velum → save to Archivum → find it later.

### Phase 3: Receipts + Nous + Ratio

**Goal**: Transparency layer is complete — user can see what happened and why.

- [ ] Tabularium: all module actions produce receipts
- [ ] Receipt detail view: tap a receipt to see what happened
- [ ] Nous: model map shows detected models, provider status, preferences
- [ ] Ratio notes: appear on relevant module pages explaining adaptive decisions
- [ ] Settings: storage summary is accurate, clear actually clears, export works

**Exit criteria**: Every user action produces a receipt. Nous shows truth about what's local.

### Phase 4: Tours + Onboarding Polish

**Goal**: A complete beginner can use Squidley without reading docs.

- [ ] Tour flow: welcome → colloquium → velum → archivum → tabularium → nous → fabrica → done
- [ ] Each tour step highlights the right element and has clear copy
- [ ] Tour progress persists (browser-local)
- [ ] Returning user sees "continue where you left off"
- [ ] Mobile tour: works on phone-width screens
- [ ] Oculus tour: only shows if a vision model is detected
- [ ] Fabrica tour: explains the safe boundary clearly

**Exit criteria**: Non-technical person can complete the full tour and understand what each module does.

### Phase 5: Packaging + Distribution

**Goal**: Squidley is installable by the target audience.

- [ ] Production build: `npm run build && npm start` serves the app correctly
- [ ] systemd service template (Linux)
- [ ] PWA manifest / icons for "Add to Home Screen"
- [ ] CHANGELOG.md with v0.1.0 notes
- [ ] README screenshots (welcome, colloquium, velum, mobile)
- [ ] Windows/WSL quick start verified
- [ ] `npm run smoke` — automated check that the app starts and health endpoint responds

**Exit criteria**: README quick start works on Linux, macOS, and WSL2. Screenshots exist.

### Phase 6: Release-Readiness Cleanup

**Goal**: Auditor score ≥ 90%, 0 blockers.

- [ ] SECURITY.md
- [ ] Suppress test-fixture false positive in `publicReleaseSafety.test.ts`
- [ ] README Install/Setup, Run/Usage, Testing sections pass auditor
- [ ] `npm audit --audit-level=moderate` clean
- [ ] Final `npm test` + `npm run typecheck` + `npm run build` all pass
- [ ] Release-readiness auditor: 0 fail, ≤ 2 warn

**Exit criteria**: `verify:release` script passes. Auditor score ≥ 90%.

## First Implementation Prompt

```
Fix public Squidley Phase 1: local chat and model detection.

Repo:
/mnt/ai/squidley

Context:
Public Squidley has a working Colloquium chat, Ollama provider, streaming
proxy, and 312 passing tests. Phase 1 goal is making the core
install-to-chat path work perfectly on a fresh machine.

Tasks:
1. Run `npm run build` and fix any production build errors.
2. Check what Colloquium shows when:
   a. Ollama is not running (ECONNREFUSED)
   b. Ollama is running but llama3.2 is not pulled
   c. Ollama is running and model is available
3. For (a): show a clear "Start Ollama" card with the exact command.
4. For (b): show a "Pull your model" card with `ollama pull llama3.2`.
5. For (c): existing chat should work — verify streaming works end-to-end.
6. Add a health status indicator to the Colloquium page header showing
   Ollama connection state (uses existing /api/local/health).
7. Verify mid-stream error recovery: if Ollama drops during streaming,
   the UI shows a clean error message on the last message, not a broken
   partial render.
8. Verify conversation list: users can see past conversations in the
   sidebar, continue them, and delete them.
9. Confirm src/lib/ratio/ exports are wired (ratio.test.ts has a test
   target — verify it resolves).
10. Do not add cloud providers or API key collection.
11. Do not change the safety model.

Run:
npm run build
npm test
npx tsc --noEmit

Deliver:
- files changed
- before/after UX for each Ollama state
- test results
- build result
- remaining Phase 1 items
```
