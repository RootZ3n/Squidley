# Skill: git-workflow

## Purpose
Standard git workflow for Squidley lab — commit discipline, branch hygiene, checkpoint patterns.

## Workflow
- Daily checkpoint: git add -A && git commit -m "chore: checkpoint — <what>"
- Feature commit: feat/fix/chore prefix, bullet details in body
- Before new work: check git status, review git log, commit pending changes
- Branch: stay on feature branch until stable, merge to main after smoke passes
- Keep out of git: state/heartbeat/history.jsonl, config/secrets/*.env

## Metadata
- created: 2026-02-28
- author: Jeff + Claude
