# Peh Teaching Knowledge Base

This directory contains Peh's teaching curriculum — beginner-friendly
lessons that explain AI, agents, tools, modes, and safety from scratch.

These lessons are designed for someone who has never used an AI tool before.

## Learning Path

Start with [00-learning-path.md](00-learning-path.md) for the recommended order.

## Lessons

| # | Topic | Concepts |
|---|-------|----------|
| 01 | What is AI? | AI, model, prompt, response, hallucination |
| 02 | Chatbot vs Agent | agent, tool call |
| 03 | Local Models | local model, Ollama, llama.cpp |
| 04 | Cloud Models | cloud model, provider, API key, cost |
| 05 | Tokens and Cost | token, context window, cost |
| 06 | Tool Calls | tool call, tool-backed action, model-only answer |
| 07 | Approvals and Risk | approval gate, risk tiers |
| 08 | Receipts | receipt, provenance, Tabularium |
| 09 | Local Mode | Local Mode, egress guard |
| 10 | Cloud Mode | Cloud Mode, consent |
| 11 | Autonomous Workflows | autonomous workflow, checkpoints |
| 12 | Safety | safety layers, prompt injection |
| 13 | Common Questions | FAQ |
| 14 | Glossary | all terms |

## Source of Truth

The canonical concept definitions live in `src/lib/teacher/concepts.ts`.
These markdown files are the human-readable curriculum. Both must stay in sync.
