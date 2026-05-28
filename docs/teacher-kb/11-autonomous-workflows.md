# Autonomous Workflows

## What is an Autonomous Workflow?

An autonomous workflow is a multi-step task where Peh plans, executes
steps, and checks in with you at key points. You stay in control, but
Peh does the work.

**Current status: Autonomous workflows are not yet implemented.** They are
planned for Phase 5 of the release plan.

## How It Will Work

1. **Plan:** Peh breaks the task into steps and shows you the plan
2. **Approve:** You review the plan and approve it (or modify it)
3. **Execute:** Peh executes each step, using tools as needed
4. **Checkpoint:** At risky steps, Peh stops and asks approval
5. **Receipt:** Every step produces a receipt
6. **Report:** Peh shows you what happened at each step

## Approval Checkpoints

Autonomous does not mean unsupervised. At key points — especially before
risky actions like file writes or shell commands — Peh will pause and
ask your permission. You can approve, deny, or modify the plan.

## Teach While Doing

Peh will explain what she is doing at each step, so you learn how agent
workflows work by watching and participating.

## Check Your Understanding

- What happens at an approval checkpoint?
- How do receipts help you verify an autonomous workflow?
- Does "autonomous" mean Peh can do anything without asking?
