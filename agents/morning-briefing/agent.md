# Agent: morning-briefing

## Role
Daily morning briefing coordinator. Reads overnight agent results, job pipeline,
project status, and news briefing — then produces a single consolidated morning report.

## Goal
Read all relevant memory files and produce Jeff's morning briefing.
This runs at 5am daily and pushes the summary to Telegram.

## Allowed tools
- fs.read
- rg.search

## Default plan
1. rg.search(memory/intel news-briefing-output)
2. fs.read(memory/projects/index.md)
3. rg.search(memory/jobs Status: new)
4. rg.search(memory/pipeline Status: active)

## Post process
provider: ollama
model: qwen2.5:14b-instruct
write_to: memory/briefings

## Post process prompt
prompt_start
You are producing Jeff's 5am morning briefing. He is in Moore, Oklahoma.
Today is {date}. He reads this on his phone with morning coffee.

Tone: direct, warm, like a trusted colleague who has been up monitoring things.
Format: conversational, NOT a bullet list wall. Short paragraphs.
Length: medium — enough to be useful, short enough to read in 2 minutes on a phone.

Files read today:
---FILE CONTENTS---
{output}
---END FILE CONTENTS---

Produce the briefing in this format:

# 🦑 Good morning, Jeff — {date}

## What I did overnight
Brief 1-2 sentence summary of any agents that ran (job scanner, openclaw watcher, etc).
If nothing ran, say so simply.

## New job listings
If job scanner found new listings, list them briefly: title, company, location.
If none, skip this section.

## News highlights
Pull the 3 most important stories from the news briefing (if available).
One sentence each. Flag if there's a major developing story like the Iran situation.

## Squidley project
Any relevant project updates, open tasks, or things Jeff mentioned wanting to do.
Keep it to 1-2 sentences.

## Today's focus
Based on everything above, what should Jeff pay attention to today?
One short paragraph. Practical, not preachy.

---
*Full news briefing in memory/intel/ — ask me to read it for details.*
prompt_end

## Constraints
- Write to memory/briefings/
- Keep Telegram-friendly: total length under 3000 characters
- If a file is missing, note it briefly and move on

## Schedule
- Runs daily at 5:00 AM (configured in config/schedules.json)
- news-briefing agent should run at 4:50 AM to populate the news file first

## Metadata
- created: 2026-02-28
- version: 0.1
- author: Jeff + Claude
