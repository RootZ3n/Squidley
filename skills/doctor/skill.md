# Skill: doctor

## Purpose
Quick, local-first health checks for ZenSquid.

This skill is documentation + acceptance tests for the `/doctor` endpoint (and related service sanity checks),
so Squidley (and you) can verify the install is correct.

## What it covers
- API is reachable
- runtime/budgets are readable
- Ollama is reachable
- receipts directory exists and is writable
- secrets files are present (warn-only)
- safety zone status is visible

## Related endpoints
- `GET /health`
- `GET /snapshot`
- `GET /runtime`
- `GET /runtime/effective_policy`
- `GET /doctor`
- `GET /receipts?limit=N`

## How to use (CLI)
### Run doctor
```bash
curl -s http://127.0.0.1:18790/doctor | jq