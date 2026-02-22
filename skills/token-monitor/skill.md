# Token Monitor

Read-only skill that summarizes ZenSquid receipt usage/cost.

## Endpoints

### GET /skills/token-monitor/summary?limit=200
Aggregates receipts into:
- totals
- breakdown by provider
- breakdown by model (provider+model)
- breakdown by day (UTC YYYY-MM-DD)

### GET /skills/token-monitor/top?limit=20
Returns the top receipts by cost (or by tokens if cost missing).

## Notes
- Read-only (no writes, no exec).
- If a receipt is missing tokens/cost fields, it counts as 0.
- Designed to be resilient to schema changes by checking multiple likely locations.