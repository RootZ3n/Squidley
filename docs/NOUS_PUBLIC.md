# Nous in Public Squidley

Nous is Squidley's system and model map. It helps beginners see which modules
exist, what each one does, and whether a module uses a model.

## What Nous Shows

The `/nous` page shows:

- public modules such as Colloquium, Oculus, Velum, Archivum, Tabularium, and Nous
- whether each module uses a model
- the model role, such as chat, vision, build, or none
- the current local provider and selected local model where relevant
- whether the module is active, local-only, locked, or prepared for later

Nous itself does not call a model.

## Adaptive System Intelligence

Nous now shows **Ratio**, Squidley's Adaptive System Intelligence layer. Ratio
explains how Squidley changes behavior based on:

- selected local model
- provider type
- unlock level
- model capability estimate
- module policy
- Prompt Gateway risk
- workspace/tool/approval permissions

In the current public version, the unlock level is `public-local`. Ratio shows
what Squidley can do now, what is limited by local model strength, what modules
need no model, and what remains locked for future Cloud Agent mode.

Ratio is also visible on individual module pages. Colloquium, Fabrica, Oculus,
Archivum, Velum, Tabularium, and Modules show small Ratio notes near relevant
actions so a disabled or limited feature explains its source: model capability,
unlock level, future wiring, permission, approval, or Prompt Gateway posture.
Those notes link back to Nous for the full map.

See [docs/ADAPTIVE_SYSTEM_INTELLIGENCE.md](ADAPTIVE_SYSTEM_INTELLIGENCE.md).

## Local Model Assignments

Nous can save browser-local model preferences for modules that support local
models:

- Colloquium chat model
- Oculus vision model
- Fabrica build model for local single-file suggestions

Preferences are stored in localStorage under:

```text
squidley.nous.modelPreferences.v1
```

Changing the Colloquium or Oculus model affects those pages too. Page-level
model selectors also save back to the same local preference store.

Colloquium, Oculus, and Fabrica use these shared preferences. If you change the
model directly on one of those pages, that page saves the new choice as the
shared preference for that module.

## Provider Registry

Public Squidley includes provider metadata for:

- Ollama-compatible local server
- llama.cpp / `llama-server` OpenAI-compatible local text server
- OpenRouter
- OpenAI
- Anthropic
- Google Gemini

Ollama is the validated default local provider. The llama.cpp text path is
implemented through an OpenAI-compatible local backend, but a real
`llama-server` binary still needs manual validation. Cloud providers are
prepared as metadata only and are locked by default.

## Cloud Unlock Status

In this public pass:

- no cloud provider calls are made
- no cloud fallback is active
- no API keys are collected
- no account, billing, or authentication flow exists
- provider metadata does not enable cloud access

The cloud provider section is a future foundation, not a working cloud unlock.

## Receipts

Tabularium records local receipts when model preferences are changed or reset.
Receipts do not store API keys or sensitive provider configuration.

## Local-Only Privacy

Nous stores only small browser-local preferences. Clearing browser storage may
remove those preferences. Public Squidley continues to use local-only behavior
unless a future explicit cloud unlock is added.
