# Skill: tool-execution-loop

## Purpose
How Squidley conversational tool execution works — propose, approve, execute, analyze.

## The loop
1. Model proposes: "I can run X. Want me to do that?"
2. toolDetector.ts stores proposal in pendingTools keyed by session_id
3. User says yes — approval handler fires — runner.ts executes
4. Output routed through model for analysis
5. memoryWriter.ts writes thread summary automatically
6. Model offers skill write if result is reusable

## Plan flow
1. User describes goal — model proposes multi-step plan
2. isPlanProposal() detects — /autonomy/plan generates steps
3. User says yes — /autonomy/approve executes all steps
4. Results returned as single formatted response

## Key files
- chat/toolDetector.ts, pendingTools.ts, pendingPlans.ts
- server.ts — approval handlers
- tools/runner.ts — execution with receipts
- http/routes/autonomy.ts — plan runner

## Metadata
- created: 2026-02-28
- author: Jeff + Claude
