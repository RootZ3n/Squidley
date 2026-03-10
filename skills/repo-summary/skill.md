# Skill: repo-summary

## Purpose
Help Squidley produce a concise summary of the current local repository by inspecting its structure and key metadata files.

## When to Use
Use this skill when the user asks for:
- a summary of the current repository
- the main apps, packages, or folders in the repo
- an overview of project structure
- a quick explanation of what the repo contains

## Scope
- Work on the current local repository only
- Prefer read-only inspection
- Do not clone remote repositories unless the user explicitly asks
- Do not modify files

## Recommended Inspection Steps
1. List the top-level files and folders in the repository
   - `ls -la`
   - `find . -maxdepth 2 -type d | sort`

2. Inspect project metadata files when present
   - `package.json`
   - `pnpm-workspace.yaml`
   - `tsconfig.json`
   - `README.md`
   - other obvious workspace/config files

3. Identify major application and package directories
   - apps/
   - packages/
   - skills/
   - ops/
   - scripts/
   - data/ or state/ if relevant

4. If helpful, inspect package names and scripts from package.json files

## Output Format
Return a short human-readable summary with:
- repository purpose
- main apps
- main packages
- important supporting folders
- notable tooling or framework clues
- brief overall impression of what the repo does

## Example Summary Shape
- Repo purpose: ...
- Main apps: ...
- Main packages: ...
- Important folders: ...
- Tooling: ...
- Notes: ...

## Guardrails
- Keep the summary concise
- Prefer the current local repo over remote history
- Do not rely on git clone for this task
- Do not make changes to the repository