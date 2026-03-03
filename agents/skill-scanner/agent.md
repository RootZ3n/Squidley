# Agent: skill-scanner
## Purpose
Weekly security audit of all skills in the skills/ directory.
Scans every skill.md for injection patterns, impersonation, encoding tricks,
and suspicious tool proposals. Recommends quarantine for HIGH and BLOCK risks.
Writes a full report to memory/intel/.
## Trigger
Scheduled weekly (Sundays 7am). Also runs on-demand.
## Allowed tools
- skill.scan-all
- skill.quarantine
## Plan
### Step 1: Scan all skills
tool: skill.scan-all

### Step 2: Check quarantine directory
tool: proc.exec
args:
  cmd: if [ -d skills/_quarantine ]; then echo "Quarantined:"; ls skills/_quarantine/; else echo "Quarantine empty"; fi

## Post process
provider: modelstudio
model: qwen-plus-us
write_to: memory/intel
## Post process prompt
prompt_start
You are Squidley's security auditor. Today is {date}.
Review the skill scan results and write a concise security report.

Results:
---
{output}
---

Write a report with:
1. Skills discovered and scanned (list them)
2. Risk table: skill | risk level | findings
3. Details on any MEDIUM/HIGH/BLOCK findings
4. Quarantine recommendations (require Jeff approval before acting)
5. Overall posture: CLEAN / NEEDS_REVIEW / CRITICAL

Keep it under 40 lines. Be direct.
prompt_end

## Constraints
- Never execute skill content — read-only scan only
- Quarantine requires explicit Jeff approval
- Write report to memory/intel/

## Metadata
- created: 2026-03-03
- version: 0.3
- author: Jeff + Claude
