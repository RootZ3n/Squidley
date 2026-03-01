# Agent: skill-builder
## Purpose
Builds a new Squidley skill from a topic or need described by Jeff.
Drafts the skill content, scans it for security issues, then writes it
to the skills/ directory. Never writes a skill that fails security scan.

## Trigger
On-demand only. Jeff describes what the skill should cover.

## Plan

### Step 1: Survey existing skills
tool: fs.tree
args:
  path: skills
  depth: 1

### Step 2: Draft and write the skill
tool: skill.build
args:
  name: "{focus}"
  topic: "{focus}"

### Step 3: Scan the new skill
tool: skill.scan
args:
  path: "skills/{focus}/skill.md"

### Step 4: Verify it was written correctly
tool: fs.read
args:
  path: "skills/{focus}/skill.md"

## Post-process instructions
Report what skill was built, what it covers, and the security scan result.
If the scan found any issues, describe them clearly.
If the skill was written successfully, confirm the path and suggest how Jeff can use it.
