# Adaptive System Intelligence

Ratio is Peh's Adaptive System Intelligence layer.

Ratio decides what Peh should do with the model, provider, permissions,
unlock level, module policy, task risk, and Prompt Gateway risk available at
that moment. It is a first-class subsystem, not a helper hidden inside Nous.

## Product Principle

Guardrails are gears, not handicaps.

Ratio should let Peh use the strongest safe behavior available:

- explain when only a small or unknown local model is available
- suggest when local chat or coding models are enough
- use single-step or multi-step behavior only when capability and permissions support it
- reserve agentic behavior for future explicit Cloud Agent mode

## Inputs

Ratio decisions can consider:

- selected provider
- selected model
- known or inferred model capability
- local vs cloud provider type
- unlock level
- module policy
- task/action type
- Prompt Gateway risk
- workspace permission
- tool permission
- approval policy

## Model Capability Profiles

Ratio models capability with conservative tiers:

- intelligence: tiny, basic, standard, advanced, frontier
- context: small, medium, large, huge
- coding: none, basic, single-file, multi-file, agentic
- vision: none, basic, strong
- planning: none, basic, multi-step, agentic
- autonomy recommendation: explain-only, suggest, single-step, multi-step, agent

Unknown local models are treated conservatively. For example, an unknown Ollama
model may be allowed for simple chat, but it is not treated as agent-capable.

## Unlock Levels

Ratio uses these unlock levels:

- public-local
- local-plus
- cloud-connected
- cloud-assisted
- cloud-agent
- lab-power

Peh currently runs in `public-local`.

Cloud provider metadata exists, but no cloud calls, API keys, billing, auth, or
agent execution are active in this pass.

## Current Public Decisions

In public-local mode:

- Colloquium basic chat can use a local chat model.
- Fabrica single-file suggestions can use a local model.
- Oculus image analysis can run only with a likely local vision model.
- Velum, Archivum, Tabularium, Settings, Modules, and Nous do not need a model.
- Multi-file Fabrica builds are future Cloud Agent work.
- Legatus agent workflows are locked until future Cloud Agent mode.

## UI Notes Across Modules

Ratio decisions now appear throughout the public module UI, not only in Nous.
When an action is available, limited, locked, future, or blocked, the page should
show a short Ratio note explaining why.

Current examples:

- Colloquium shows basic chat as available and advanced planning as limited or
  locked by model/unlock level.
- Fabrica shows single-file suggestions as available while multi-file builds
  remain future Cloud Agent work.
- Oculus shows whether local image analysis has a likely vision-capable model.
- Archivum shows browser-local storage as available and summarize/retrieval as
  prepared for later.
- Velum and Tabularium show that their current public actions do not need a
  model.
- Modules uses Ratio-derived status notes so locked modules look intentionally
  prepared, not broken.

These notes link back to Nous for the larger system map.

Ratio action ownership is declared in the public module registry. New Ratio
actions should be added to Ratio policy first, then declared by the owning
module. This keeps adaptive behavior modular instead of spreading action strings
through unrelated pages.

## Receipts

Ratio includes helpers for safe Tabularium receipt metadata:

- capability decision made
- action limited by model
- action locked by unlock level
- model capability estimate changed

Receipt helpers store summaries and capability labels, not prompts, secrets, or
source text.

## What This Pass Does Not Add

This pass does not add:

- active cloud calls
- API key collection
- auth or billing
- real agents
- tools or shell execution
- backend database storage
- telemetry upload
- private lab behavior
