# Modular Architecture

Peh uses a small-core, modular architecture.

Core should provide contracts and orchestration, not absorb module behavior.
Modules should own their own UI, storage, actions, tours, receipts, handoffs,
tests, and docs.

## Core Responsibilities

Core owns:

- app shell and route loading patterns
- module registry contracts
- provider registry contracts
- Ratio decision engine
- Prompt Gateway
- Tabularium receipt contracts
- shared UI primitives
- shared storage/versioning helpers
- common handoff contracts
- navigation contracts

Core should stay boring and small. It should define what a module must declare,
then let modules implement their own behavior behind that boundary.

## Module Responsibilities

Each module owns:

- page UI
- module-specific storage helpers and schema
- module-specific actions
- module-specific tours
- module-specific docs
- module-specific receipt action strings
- module-specific handoffs
- module-specific tests

## Forbidden Coupling Patterns

Avoid:

- adding module-specific behavior to app-wide files when a module helper can own it
- duplicating module metadata outside the registry
- putting cloud provider calls directly inside random module pages
- storing API keys in client storage without a documented security design
- letting a page invent receipt, Ratio, storage, or handoff conventions without declaring them
- expanding core into a large feature bucket
- making locked/future modules look active

## Module Contracts

Module metadata is defined by `PublicPehModuleDefinition` in
`src/lib/modules/contracts.ts`.

Each visible module declares identity, category, status, route, tour id, Ratio
actions, receipt actions, storage keys, handoff kinds, provider requirements,
docs, and public limitations where applicable.

`src/lib/modules/validateModuleContracts.ts` validates those declarations in
tests.

## Module Constants

Module constants belong with the owning module. Keep these out of page files
when they are reused or contract-sensitive:

- receipt action ids
- storage keys
- handoff kinds and `sessionStorage` keys
- module source ids
- export headers and bundle names
- module-specific status labels

Do not change persisted key values casually. If a key must change, add migration
logic and tests before updating the module contract.

## Adding a New Module

1. Add module-specific helpers under `src/lib/<module>/`.
2. Add the route under `src/app/<module>/` only when it is user-facing.
3. Add tour data under `src/lib/tour/<module>.ts` if the module has a tour.
4. Add module docs under `docs/`.
5. Add module metadata to `src/lib/modules/registry.ts`.
6. Declare Ratio actions, receipt actions, storage keys, handoffs, and provider requirements.
7. Add tests for the module helpers and registry contract.
8. Keep local/cloud and permission copy honest.

## Adding a New Provider

1. Add provider metadata to the provider registry.
2. Keep cloud providers locked unless explicit unlock work is included.
3. Add Ratio provider capability metadata.
4. Add docs that explain API style, auth expectations, and locked/default state.
5. Do not wire cloud calls inside module pages.

## Adding a Ratio Action

1. Add the action id to Ratio types.
2. Add or update the module policy.
3. Add UI decision helpers if a page needs a ready-to-render decision.
4. Declare the action in the module registry.
5. Add tests for allowed, limited, locked, and future behavior.

## Adding a Receipt Action

1. Define the action string in the owning module context.
2. Add a module-owned receipt builder in `src/lib/<module>/receipts.ts`.
3. Ensure receipt summaries avoid raw prompts, secrets, source code, generated code, and image data.
4. Return Tabularium-compatible receipt input; do not create a module-specific receipt store.
5. Declare the receipt action in the module registry.
6. Add tests for action ids, local/cloud/tool flags, related ids, safe metadata, and privacy.

Modules own receipt builders; Tabularium owns receipt storage and sanitization.
Nous owns model preference, provider map, and capability-estimate receipt
builders. Settings owns local control, reset, export, and storage-management
receipt builders.

A lightweight module-boundary test scans `src/app/**` for obvious inline
Tabularium payload construction such as `logTabulariumReceipt(..., { ... })`.
The intended flow is:

```text
module receipt builder -> Tabularium log/store helper -> UI display
```

If the test flags a false positive, narrow the test pattern rather than
removing the guardrail.

## Adding a Tour

1. Add structured tour data under `src/lib/tour/`.
2. Keep target ids owned by the module page.
3. Set `tourAvailable` and `tourId` in the module registry.
4. Add a small tour-data validity test.

## Adding a Handoff

1. Use `sessionStorage` for browser-local draft handoffs.
2. Version the payload and add an expiration.
3. Do not put sensitive text in the URL.
4. Consume handoffs once and clear storage.
5. Declare the handoff kind in the module registry.

## Cloud Unlock Later

Cloud Unlock should plug in through modules and contracts:

- provider config module
- unlock level store
- permissions policy module
- Ratio policy extension
- module activation metadata
- server-side provider adapters

It should not add direct cloud code inside random module pages. API keys should
not be stored in client-only storage unless that design is explicit,
documented, and reviewed.

Current public mode still has no active cloud calls, API key collection, agents,
tools, shell execution, backend database, or telemetry upload.
