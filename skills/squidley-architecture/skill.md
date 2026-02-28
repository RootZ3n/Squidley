# Skill: squidley-architecture

## Purpose
Squidley core architecture — file layout, services, and how components connect.

## Service layout
- API: apps/api/src/server.ts — Fastify port 18790
- Web UI: apps/web/app/page.tsx — Next.js port 3001
- Remote: apps/remote/

## Key modules
- chat/systemPrompt.ts — builds system prompt per request
- chat/toolDetector.ts — detects tool proposals and approvals
- chat/pendingTools.ts — session store for tool approvals
- chat/pendingPlans.ts — session store for plan approvals
- chat/memoryWriter.ts — auto-writes thread JSON after analysis
- chat/contextBuilder.ts — workspace snapshot injection
- tools/runner.ts — executes tools with receipts
- tools/allowlist.ts — allowed tools config
- http/routes/autonomy.ts — plan generation and execution

## Data directories
- memory/threads/ — conversation threads
- skills/ — skill markdown files
- data/receipts/ — execution receipts
- config/ — zensquid.config.json, secrets/api.env

## Metadata
- created: 2026-02-28
- author: Jeff + Claude
