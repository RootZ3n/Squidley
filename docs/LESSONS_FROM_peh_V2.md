# Lessons from Peh V2

> **This repo is the fresh public Peh product.** Peh V2 is
> only a *lessons-learned reference*. None of V2's private code,
> machine names, paths, debug panels, or autonomous lab systems are
> ported here.

This document is intentionally short and concrete. It captures only
the lessons that should shape the public build — not the details of how
V2 worked internally.

## What we are keeping in spirit

- **A named, latinate module vocabulary.** Module names like Colloquium,
  Fabrica, Velum carry meaning. Public Peh keeps the naming style
  but reserves only the modules that make sense for a public,
  beginner-first product.
- **A visible companion presence.** A persistent Peh voice that
  can explain the screen the user is on. In V2 this leaned advanced;
  in public it must be calm and beginner-first.
- **Receipts and visible activity.** Users should always be able to see
  what just happened — model, time, tools used.
- **A privacy curtain (Velum).** The idea that things must be marked
  before they can leave the device is preserved as a first-class
  module.

## What we are explicitly dropping

- **Lab-specific modules** (e.g., Aedis, Crucible, Krakzen, Verum). They
  do not appear in the public registry, the public UI, or any public
  documentation.
- **Hardcoded private paths and machine names.** Public Peh
  contains no references to specific user machines, private repo
  layouts, or operator-only directories.
- **Autonomous lab systems.** No background agents that act without an
  explicit user step. No autonomous shell execution. No multi-file
  unattended repo work.
- **Debug panels and experimental internals.** Anything whose audience
  was "the operator running V2" stays out of the public app.
- **Full-power Fabrica.** V2 Fabrica was capable of multi-file
  autonomous work. Public Fabrica is single-file, basic-build only.

## Behavioural lessons

- **Teach the system from inside the system.** New users should not
  have to read external docs to use the core. The Welcome screen and
  Companion Tour Mode are how this lesson is encoded in the codebase.
- **One source of truth for modules.** All UI lists, gating logic, and
  tour wiring should derive from
  [`src/lib/modules/registry.ts`](../src/lib/modules/registry.ts).
- **Local mode must be visible.** Hidden mode-switches confused users.
  The header badge is non-negotiable.
- **Default to less.** It is easier to add a feature behind a toggle
  later than to remove a default that users came to depend on.

## What this means for new contributors

If a feature in V2 was useful, ask: *would a brand-new user, on their
first day, benefit from this — and could they understand it from the
UI alone?* If not, it does not belong in public Peh yet.
