# Tool Calls

## What is a Tool Call?

A tool call is when Peh actually does something — like reading a file,
writing code, or searching the web — instead of just talking about it. The
model requests to use a tool, the application executes it, and a receipt proves
what happened.

## Model-Only vs Tool-Backed

There is a crucial difference:

**Model-only answer:** The model generates text based on its training. No files
were read, no web was searched, no actions were taken. The provenance says
"answered by local model only."

**Tool-backed action:** Peh used a real tool. A file was actually read, a
command was actually run, or a web page was actually fetched. The receipt
proves it.

## How Peh Handles Hallucinated Tool Claims

Sometimes a model will say "I wrote the file" when no file was written. This
is a hallucination. Peh's honesty annotator detects these false claims
and adds a correction:

> "Note: Peh does not have file-writing capability in this build. The
> model's claim was not backed by a real tool action."

The model's original text is preserved — Peh adds the correction, not
censorship.

## Current Status

In Local Mode, all answers are model-only. Tool execution is planned for
Cloud Mode (Phase 4). When tools are available, every tool action will produce
a receipt as proof.

## Check Your Understanding

- How can you tell a real tool call from a model just saying it did something?
- What proof exists that a tool-backed action actually happened?
- What does Peh do when the model claims to have written a file?
