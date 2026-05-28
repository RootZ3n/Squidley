# Cloud Mode Architecture

## Overview

Peh has two operating modes: **Local Mode** and **Cloud Mode**.

Local Mode is the audited foundation. Cloud Mode is the planned fully capable
autonomous agent mode. Both are required for the product to ship publicly —
Local Mode alone is not the product. See
[PUBLIC_SQUIDLEY_RELEASE_PLAN.md](PUBLIC_SQUIDLEY_RELEASE_PLAN.md).

## Mode Resolution

The mode is determined by a central resolver at `src/lib/mode/resolver.ts`.

Resolution order:
1. Explicit UI/config setting (highest priority)
2. `PEH_MODE` environment variable
3. Default: `local`

### Critical Invariant

**API keys alone NEVER enable Cloud Mode.** Setting `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc. without `PEH_MODE=cloud` has no effect on the operating mode. The keys are detected for informational purposes but do not unlock any cloud functionality.

## Mode States

### Local Mode

| Property | Value |
|----------|-------|
| mode | `local` |
| cloudUnlocked | `false` |
| toolPolicy | `none` |
| providerPolicy | `local-only` |
| capabilityPolicy | `local-baseline` |
| consentRequired | `false` |
| receiptsRequired | `true` |
| localOnlyGuardEnabled | `true` |
| egressGuardEnabled | `true` |

### Cloud Mode

| Property | Value |
|----------|-------|
| mode | `cloud` |
| cloudUnlocked | `true` |
| toolPolicy | `approval-gated` |
| providerPolicy | `cloud-configured` |
| capabilityPolicy | `cloud-extended` |
| consentRequired | `true` |
| receiptsRequired | `true` |
| localOnlyGuardEnabled | `false` |
| egressGuardEnabled | `false` |

## Cloud Mode Activation Requirements

Cloud Mode becomes active when ALL of:
1. `PEH_MODE=cloud` is set (or equivalent explicit config)
2. At least one cloud provider is configured with an API key
3. That provider has an implemented adapter (checked at runtime)

If any requirement is missing, Cloud Mode features are blocked with honest messaging.

## Provider Registry

All providers are registered at `src/lib/providers/cloudRegistry.ts`.

**Implemented (local):**
- Ollama (IMPLEMENTED)
- llama-cpp (PARTIAL)

**Planned (cloud, all NOT_IMPLEMENTED):**
- OpenAI
- OpenRouter
- Anthropic
- Google Gemini
- Minimax
- Z.ai

A provider marked NOT_IMPLEMENTED has no adapter, no API call path, and no test coverage. It cannot be used.

## Cloud Escalation Policy

See `src/lib/mode/escalation.ts`.

- **Local Mode**: No cloud escalation. User may be informed that Cloud Mode could support the request.
- **Cloud Mode**: Escalation requires configured provider + capability status READY/PARTIAL + consent + Velum review.

## Receipts and Provenance

Every response carries mode-aware provenance (`src/lib/mode/provenance.ts`):
- `mode`: local or cloud
- `cloudCalled`: true only if a provider call actually happened
- `cloudConsentState`: not_required, granted, denied, not_asked
- `approvalRequired` / `approvalState`: for risky actions

Provenance is flattened to receipt metadata (string/number/boolean only) for the Tabularium ledger.

## Implementation Status

| Component | Status |
|-----------|--------|
| Mode resolver | IMPLEMENTED |
| Mode types/states | IMPLEMENTED |
| Provider registry | IMPLEMENTED (registry), NOT_IMPLEMENTED (cloud adapters) |
| Tool registry v2 | IMPLEMENTED (registry) |
| Capability matrix v3 | IMPLEMENTED |
| Provenance v2 | IMPLEMENTED |
| Escalation policy | IMPLEMENTED |
| Cloud chat adapter | NOT_IMPLEMENTED |
| Cloud tool execution | NOT_IMPLEMENTED |
| Cloud consent UI | NOT_IMPLEMENTED |
| Autonomous workflows | NOT_IMPLEMENTED |

## Files

- `src/lib/mode/types.ts` - Mode types and constant states
- `src/lib/mode/resolver.ts` - Central mode resolver
- `src/lib/mode/toolRegistry.ts` - Mode-aware tool registry
- `src/lib/mode/capabilityMatrix.ts` - Mode-aware capability matrix
- `src/lib/mode/provenance.ts` - Mode-aware response provenance
- `src/lib/mode/escalation.ts` - Cloud escalation policy
- `src/lib/mode/resolver.test.ts` - Comprehensive tests
- `src/lib/providers/cloudRegistry.ts` - Cloud provider registry
