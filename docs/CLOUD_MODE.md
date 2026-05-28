# Cloud Mode

## What It Is

Cloud Mode is where Squidley becomes a fully capable autonomous agent. When
implemented and enabled, Squidley will use cloud AI providers, execute tools,
and run autonomous workflows — all with approval gates and receipt tracking.

Cloud Mode is not optional future polish. It is a core part of the product.
Public Squidley does not ship until Cloud Mode works.

## Current Status: ARCHITECTURE ONLY / NOT FUNCTIONAL

Cloud Mode architecture is implemented (mode resolver, provider registry,
capability matrix, tool registry, escalation policy, provenance). **No cloud
provider adapters exist.** Cloud Mode cannot do anything cloud-specific until
adapters are built, tested, and connected to the UI.

### What exists (architecture):
- Mode resolver (`SQUIDLEY_MODE=cloud`)
- Cloud provider registry (7 providers registered, all NOT_IMPLEMENTED)
- Mode-aware capability and tool matrices
- Escalation policy (no cloud in local mode)
- Provenance v2 with mode/consent tracking
- 63+ mode tests

### What does not exist (implementation):
- Cloud provider adapters (OpenAI, Anthropic, OpenRouter, etc.)
- Cloud chat/stream handlers
- Cloud consent UI
- Tool execution surface (file read/write, shell, web search)
- Approval gates UI
- Autonomous agent workflow engine
- Cloud receipts wired to Tabularium
- Cost/usage warnings
- Provider setup wizard

## How to Enable (When Implemented)

```bash
export SQUIDLEY_MODE=cloud
export OPENAI_API_KEY=sk-...
# or
export ANTHROPIC_API_KEY=sk-...
```

**At this time, enabling Cloud Mode changes the mode state in diagnostics but
no cloud features work. No adapters are implemented.**

## What Cloud Mode Must Do Before Release

| Capability | Status | Phase |
|-----------|--------|-------|
| Cloud chat | NOT_IMPLEMENTED | 3 |
| Cloud streaming | NOT_IMPLEMENTED | 3 |
| Cloud consent flow | NOT_IMPLEMENTED | 3 |
| Cloud receipts | NOT_IMPLEMENTED | 3 |
| Cloud provenance in UI | NOT_IMPLEMENTED | 3 |
| Cost warnings | NOT_IMPLEMENTED | 3 |
| Provider setup wizard | NOT_IMPLEMENTED | 3 |
| File read tool | NOT_IMPLEMENTED | 4 |
| File write (approval-gated) | NOT_IMPLEMENTED | 4 |
| Shell execution (approval-gated) | NOT_IMPLEMENTED | 4 |
| Web search | NOT_IMPLEMENTED | 4 |
| Multi-file editing | NOT_IMPLEMENTED | 4 |
| Agent workflows | NOT_IMPLEMENTED | 5 |
| Cloud vision | NOT_IMPLEMENTED | 3 |
| Document parsing | NOT_IMPLEMENTED | 4 |

## Safety Design

Cloud Mode does not imply unlimited access:
- **Consent required** for every cloud API call
- **Approval required** for high-risk tools (file write, shell, etc.)
- **Receipts required** for all actions
- **Velum review** before sending user content to cloud
- **Provenance tracking** for every response
- **Escalation policy** prevents silent cloud use
- **Cost warnings** before paid API calls

## Planned Providers

| Provider | Adapter Status |
|----------|---------------|
| OpenAI | NOT_IMPLEMENTED |
| Anthropic | NOT_IMPLEMENTED |
| OpenRouter | NOT_IMPLEMENTED |
| Google Gemini | NOT_IMPLEMENTED |
| Minimax | NOT_IMPLEMENTED |
| Z.ai | NOT_IMPLEMENTED |

## What Must Be Built

See [PUBLIC_SQUIDLEY_RELEASE_PLAN.md](PUBLIC_SQUIDLEY_RELEASE_PLAN.md) for the
complete phased plan. Cloud Mode spans Phases 3-5.
