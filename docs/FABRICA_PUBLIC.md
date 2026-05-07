# Fabrica in Public Squidley

Fabrica is Squidley's beginner workshop. In public v0.1, it is a narrow
single-file suggestion tool, not an autonomous coding system.

## What Fabrica Does

Fabrica lets you:

- enter an optional file name
- choose a simple file type or language
- paste one file, or leave the original content blank to start from scratch
- describe one small change
- ask a local model for a proposed complete single-file output

The result appears on the page for you to review.

## Public Limits

Fabrica public mode is intentionally limited:

- single-file suggestions only
- no repo-wide edits
- no multi-file changes
- no shell commands
- no tool execution
- no autonomous coding agent behavior
- no automatic file writes

You decide whether to copy or export the result. Squidley does not write it to
your file system.

## Local Model Use

Fabrica uses the configured Ollama-compatible local model server. It reads the
Fabrica model preference from Nous when one is saved. If no Fabrica preference
is saved, it falls back through local preferences/defaults.

No cloud fallback is used.

Before a Fabrica request reaches the local model, Prompt Gateway checks the
requested change and pasted source text for prompt-injection signals. Direct
attempts to make Fabrica act like an agent, run shell commands, use tools, write
files, or bypass the single-file limit are paused. Suspicious text inside pasted
source comments can still be treated as untrusted content with an added model
caution.

## Output Review

After generation, Fabrica shows the proposed output in a readable block. You can:

- copy the output
- export the output as a browser download
- save the output to Archivum as a note
- clear the workshop

Copy and export are explicit user actions. The app does not modify a repository
or write files automatically.

Saving to Archivum stores only the suggestion text and safe metadata with
`source: fabrica-suggestion`. It is saved as a note, not treated as an
executable file.

## Receipts

Tabularium records browser-local receipts for Fabrica generation start, success,
failure, copy, export, and save-to-Archivum actions. Receipts include
provider/model metadata when a local model is used, but they avoid storing the
full source or generated file content.

## Not Aedis

Fabrica is not Aedis, not a full coding agent, and not a private lab workflow.
It is a beginner-friendly public workshop for reviewing one local model
suggestion at a time.
