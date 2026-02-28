# Agent: dashboard-builder

## Role
Build and update Squidley's token usage dashboard by reading receipt data and generating UI components.

## Goal
Read the receipts data, understand usage patterns, and write a Next.js React dashboard page
that shows: token usage by tier, cost estimates, model breakdown, and daily trends.

## Allowed tools
- fs.read
- rg.search

## Default plan
1. rg.search(receipt_id in state/receipts)

## Post process
provider: openai
model: gpt-4o-mini
write_to: apps/web/app/dashboard

## Post process prompt
prompt_start
You are building a token usage monitoring dashboard for Squidley, a local-first AI orchestration system.

Today's date is {date}.

Here is sample receipt data from the system (JSON files showing model usage):
---RECEIPT DATA---
{output}
---END RECEIPT DATA---

Write a complete Next.js React page component (TypeScript, .tsx) that:

1. Fetches receipt data from GET /api/receipts-proxy (you will create this) — actually, fetch from the API directly: the API runs at the URL stored in window.__SQUIDLEY_API_URL or fallback to http://127.0.0.1:18790. Fetch GET /receipts to get {ok, count, receipts[]}.

2. Displays a clean dashboard with:
   - Total requests today / this week / all time
   - Breakdown by tier (local, chat, plan, big_brain) as horizontal bars
   - Breakdown by provider (ollama, openai, modelstudio) with counts
   - Cost estimates (ollama=$0, openai gpt-5-mini=$0.00015/1k input tokens estimated, modelstudio=$0.0004/1k)
   - Escalation rate (% of non-local requests)
   - Recent activity feed (last 10 requests with tier, model, timestamp)

3. Design requirements:
   - Dark theme: background #0a0a0a, cards #141414, accent #00ff88, text #e0e0e0
   - Monospace font for numbers and model names
   - Simple CSS progress bars for tier breakdown (no external libs)
   - Auto-refreshes every 30 seconds
   - Shows local vs cloud split as the hero metric

4. Rules:
   - Default export named DashboardPage
   - Only useState and useEffect hooks
   - Handle loading and error states gracefully
   - Estimate token counts at 500 input + 300 output per chat request (we do not have real token data yet)

Output ONLY the raw TypeScript JSX code. No markdown, no explanation, no code fences.
Start directly with: "use client";
prompt_end

## Constraints
- Write only to apps/web/app/dashboard/
- Output must be valid TypeScript React
- No external chart libraries
- Must work with Next.js 15

## Metadata
- created: 2026-02-28
- version: 0.1
- author: Jeff + Claude
