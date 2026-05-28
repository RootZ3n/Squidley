# Local Mode

## What It Is

Local Mode is Peh's starting point — the foundation where everything runs
on your machine. It is the first phase of a larger product, not the final
product itself.

Local Mode is where beginners learn what AI models are, how chat works, and
what "local-first" means, before graduating to Cloud Mode where Peh
becomes a fully capable autonomous agent.

## Status

**Local Mode foundation: AUDITED / READY as a subsystem.**

This does not mean Peh is ready to ship. The product requires
Cloud Mode, teaching flows, tool execution, and beginner onboarding before
public release. See [PUBLIC_SQUIDLEY_RELEASE_PLAN.md](PUBLIC_SQUIDLEY_RELEASE_PLAN.md).

## Key Properties

- **Default mode** — active unless you explicitly set `PEH_MODE=cloud`
- **No cloud calls** — all fetch requests go to localhost only
- **No tool execution** — no file write, no shell, no web search
- **Local model chat** — Ollama or llama-server on localhost
- **Browser-local storage** — notes, receipts, settings stay in your browser
- **Honest reporting** — every response says exactly what produced it

## What Works

| Feature | Status |
|---------|--------|
| Chat with local model | Ready |
| Code suggestions (single file) | Ready |
| Image analysis (Ollama vision) | Partial |
| Note storage | Ready |
| Receipt ledger | Ready |
| System diagnostics | Ready |
| Health checks | Ready |
| Model listing | Ready |

## What Does Not Work (Yet)

| Feature | Status | When |
|---------|--------|------|
| File read/write | Not implemented | Phase 4 |
| Shell commands | Not implemented | Phase 4 |
| Web search | Not implemented | Phase 4 |
| Multi-file editing | Not implemented | Phase 4 |
| Agent workflows | Not implemented | Phase 5 |
| Memory persistence | Not implemented | Phase 4 |
| Beginner onboarding | Not implemented | Phase 2 |
| Self-explanation | Not implemented | Phase 2 |

These are planned capabilities. Local Mode is a stepping stone, not a ceiling.

## Cloud Keys Do Not Unlock Anything

Setting `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or any other cloud API key does
not change Local Mode behavior. Cloud Mode requires explicit opt-in via
`PEH_MODE=cloud`.

## Egress Guard

In Local Mode, the egress guard blocks all non-local fetch requests. Only
`localhost`, `::1`, `.local`, and private IP ranges are allowed. HTTPS and
public IPs are rejected.

## Verification

Run `npm run verify:release` to confirm Local Mode subsystem integrity:
- Type checking
- Full test suite (1300+ tests)
- Diagnostic scan (no cloud SDK, no cloud URLs)
- Static + dynamic egress proof
- Live local model gauntlet

This verifies the Local Mode foundation. It does not verify that the full
product is ready to ship.
