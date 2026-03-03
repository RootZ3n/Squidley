<!-- scanner: known-safe internal skill -->
# Skill: memory

## Purpose
Store and retrieve user notes as plain markdown files under `/memory/`.

## Storage layout
/memory/
  builds/
  career/
  ideas/
  spell-academy/
  general/

## Operations
- list folders
- list notes in a folder
- read a note
- write/overwrite a note
- search notes (simple substring match)

## Safety
- Admin token required for write operations.
- Enforce capability policy for any file operations.
- Default deny outside project root.

## Acceptance tests
- Can write memory/builds/test.md
- Can read it back
- Can list folder contents
- Can search for a string across notes
