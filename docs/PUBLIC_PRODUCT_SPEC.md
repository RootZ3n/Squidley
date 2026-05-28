# Peh — Product Specification

## What this repo is

This repository is the **public Peh product**. It is a fresh,
standalone codebase whose purpose is to ship a beginner-friendly,
local-first AI companion to a wide audience.

It is **not** Peh V1. It is **not** Peh V2. Peh V2 exists
only as a *lessons-learned* reference (see
[`LESSONS_FROM_SQUIDLEY_V2.md`](LESSONS_FROM_SQUIDLEY_V2.md)). Private
lab assumptions, machine names, hardcoded paths, debug panels,
experimental internals, and full autonomous lab systems do **not** belong
in this codebase.

## Audience

Peh is built for users who:

- Are new to local AI tooling.
- Want a calm, guided introduction rather than a power-user dashboard.
- Care about keeping data on their device by default.

Peh itself is the teacher. The first run shows a Welcome screen
with the mascot and two options — **Start Tour** and **Skip Tour** — and
the Companion Tour Mode walks new users through each module from
*inside* the system, beginning with Colloquium.

## Core principles

1. **Beginner-friendly.** Plain language, no jargon, no hidden state.
   Every interactive region of the screen is something Peh can
   explain on demand.
2. **Local-first.** Core modules must work without a cloud account.
   The local-only badge in the header tells the user, at a glance, that
   nothing is leaving the device.
3. **Safe-by-default.** No autonomous shell execution. No silent
   background agents. No auto-installed system services.
4. **Companion-guided.** New users do not need to read external docs to
   understand the app — the app teaches itself.
5. **Cleanly separated from the lab.** No private routes, no
   lab-specific module names (Aedis, Crucible, Krakzen, Verum, etc.),
   no debug panels or autonomous systems from V2.

## Public modules

See [`MODULE_MATRIX.md`](MODULE_MATRIX.md) for the full table.

- **Core (local-first)** — Colloquium, Fabrica, Archivum, More Input,
  Velum, Archelon, Oculus, Tabularium, Nous.
- **Cloud unlock** — Legatus, Probatio, Imperium, Imaginanium. Visible
  in the gallery so users know they exist; gated in local-only public
  mode.

### Fabrica in public mode

Fabrica is intentionally limited in public Peh:

- Single-file build/edit tasks only.
- **Not** a full coding agent.
- **No** multi-file autonomous repo work.
- **No** background shell execution.

This boundary is part of the safe-by-default promise. If we ever
expand Fabrica's scope in public, it gets its own design review and
its own tour step.

## First-run experience

1. User lands on `/` (Welcome).
2. Sees the Peh mascot and two buttons.
3. Picks Start Tour or Skip Tour.
4. The choice is persisted in `localStorage`:
   - `peh.firstRun.completed = "true"`
   - `peh.tourMode = "on" | "off"`
5. The user is routed to `/colloquium`. If tour mode is `on`, the
   Companion Tour Panel mounts and walks them through the Colloquium
   page step by step.

The first tour step **must** establish the Latin meaning of
"Colloquium." That is a hard product requirement — it sets the
expectation that Peh will teach the language of the system, not
just its buttons.

## Out of scope (for the foundation)

- Cloud auth and billing.
- Real LLM connections (local or remote). The chat thread is sample
  data until a provider layer is added.
- Multi-user features.
- Lab-only modules and lab-only routes.

## Roadmap pointers

The next reasonable layers, in rough order:

1. A local provider adapter (e.g., a thin client for a local model
   server) wired into Colloquium.
2. Tours for Fabrica and Archivum.
3. A Velum review step for items leaving the device.
4. A real mascot drop-in (replacing the placeholder SVG).
