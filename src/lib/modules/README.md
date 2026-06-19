# Modules Library Boundary

This folder owns the public module contract and registry.

Belongs here:

- module contract types
- public module registry metadata
- contract validation helpers for tests
- route/category/status declarations

Does not belong here:

- module page UI
- module storage implementations
- provider API calls
- large feature logic

Core should provide contracts and orchestration, not absorb module behavior.
