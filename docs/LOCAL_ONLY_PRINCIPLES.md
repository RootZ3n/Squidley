# Local-Only Principles

Public Squidley is **local-first**. The user should be able to install
the app, open it, and use the core modules without creating an account,
reaching a cloud API, or trusting an external service.

## What "local-only" guarantees

In local-only mode, by default:

1. **No outbound LLM calls.** Conversations are sent only to local
   providers configured on the user's machine.
2. **No outbound telemetry.** No analytics pings, no error reporting
   to third parties.
3. **No silent uploads.** Images, files, and notes do not leave the
   device unless the user explicitly performs a "send" action through
   a Velum-aware flow.
4. **Receipts are visible.** Every model run shows up in the receipts
   panel. If a request would touch the network, the receipt and the
   header badge change so the user can see the difference.

## What it does *not* mean

- It does not mean Squidley is air-gapped. The OS can still reach the
  network for things outside Squidley's control (DNS, OS updates).
- It does not mean encrypted-at-rest. Local storage is local-disk
  storage; users responsible for full-disk encryption use OS-level
  tools.
- It does not mean cloud features are forbidden forever — they are
  opt-in via Cloud Unlock modules and clearly labeled.

## Module obligations

Every module marked `localOnlySupported: true` in the registry must:

- Function with a local provider.
- Surface a clear failure state when no local provider is available
  (rather than silently calling a cloud fallback).
- Treat any cloud capability as a separate, named feature gated behind
  Cloud Unlock.

## UI obligations

- The **local-only badge** is part of the standard header for any module
  page that involves a model call.
- The badge must change visibly the moment a cloud connection is in
  use. There is no quiet mixed-mode.
- Tour copy must explain the badge before any model call happens, so
  the user understands the contract before relying on it.

## Default posture

When in doubt, the default is local. New modules must justify why they
need the network, not why they avoid it.

## Implementation in Colloquium

Colloquium's chat is wired to a local-only adapter — see
[`LOCAL_CHAT.md`](LOCAL_CHAT.md). The adapter contacts only the
configured local model endpoint, with no cloud fallback, and exposes
`cloudUsed: false` / `toolsUsed: false` on every receipt. Ollama is validated
end-to-end; the llama.cpp/OpenAI-compatible text path is implemented while real
`llama-server` binary validation is pending.
