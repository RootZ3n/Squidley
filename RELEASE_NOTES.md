# Release Notes

## v0.1.0

Peh v0.1.0 is the first local-first public release candidate. It is
a beginner-friendly AI workspace that runs with browser-local storage and an
Ollama-compatible local model server.

### Highlights

- Lab-style public UI shell with Welcome, Modules, and Settings routes.
- Colloquium local-only streaming chat with local model health, model discovery,
  sessions, persistence, export, and receipts.
- Velum deterministic client-side review/redaction and safe handoffs.
- Prompt Gateway deterministic route-level prompt-injection defense before
  local model calls.
- Tabularium browser-local receipt room with search, filters, detail views,
  export, clear, and safe receipt links.
- Archivum / More Input local knowledge shelf with tags, search, filtering,
  edit, import/export bundles, Velum re-review, and local-only storage.
- Oculus manual image review with optional local vision analysis and analysis
  text handoff/save paths. Images are not stored by default.
- Fabrica beginner single-file suggestion workshop using local model calls only.
  It does not write files, run shell commands, use tools, or perform repo-wide
  edits.
- Nous module/model map with local model preferences, Ratio visibility, and
  locked provider metadata.
- Ratio, Peh's Adaptive System Intelligence layer, with module capability
  notes across the public UI.
- Privacy-respecting bug report flow using prefilled email links only.
- Modular architecture boundaries, module-owned constants/receipt builders, and
  regression tests guarding receipt ownership.

### Known Caveats

- Oculus vision depends on local Ollama vision model reliability. A model may
  appear vision-capable but still fail depending on the local model/runtime.
- Cloud providers are prepared/locked metadata only. No cloud calls or cloud
  fallback are active in this release.
- No accounts, cloud sync, backend database, agents, tools, or shell execution.
- Storage is browser-local only. Clearing browser storage may remove chats,
  Archivum entries, receipts, model preferences, and onboarding state.

### Verification

The release candidate is expected to pass:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```
