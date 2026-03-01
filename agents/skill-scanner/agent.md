# Agent: skill-scanner
## Purpose
Weekly security audit of all skills in the skills/ directory.
Scans each skill.md file for injection patterns, impersonation, encoding tricks,
and suspicious tool proposals. Quarantines HIGH and BLOCK risk skills automatically.
Writes a full report to memory/intel/.

## Trigger
Scheduled weekly (Sundays 7am). Also runs on-demand.

## Plan

### Step 1: List all skills
tool: proc.exec
args:
  cmd: find skills -name "skill.md" -not -path "skills/_quarantine/*" | sort

### Step 2: Scan doctor skill
tool: skill.scan
args:
  path: skills/doctor/skill.md

### Step 3: Scan git-workflow skill
tool: skill.scan
args:
  path: skills/git-workflow/skill.md

### Step 4: Scan token-monitor skill
tool: skill.scan
args:
  path: skills/token-monitor/skill.md

### Step 5: Scan memory-notes skill
tool: skill.scan
args:
  path: skills/memory-notes/skill.md

### Step 6: Scan squidley-architecture skill
tool: skill.scan
args:
  path: skills/squidley-architecture/skill.md

### Step 7: Scan tool-execution-loop skill
tool: skill.scan
args:
  path: skills/tool-execution-loop/skill.md

### Step 8: Scan memory skill
tool: skill.scan
args:
  path: skills/memory/skill.md

## Post-process instructions
Review all scan results. Write a security report with:
- Total skills scanned
- Risk summary table (skill name, risk level, finding count)
- Details of any MEDIUM, HIGH, or BLOCK findings
- Recommendations (quarantine, review, or approve)
- Overall security posture: CLEAN / NEEDS_REVIEW / CRITICAL

If any skill has BLOCK risk, note it prominently at the top.
If any skill has HIGH risk, recommend immediate review.
