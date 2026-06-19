# Using Peh Safely

## Safety Layers

Peh has multiple safety layers working together:

### Egress Guard
Blocks non-local network requests in Local Mode. Only localhost and private
IPs are allowed.

### Prompt Gateway
Detects common prompt injection patterns — attempts to trick the model into
doing something it should not. This is heuristic, not a guarantee.

### Velum Review
Reviews text before sharing it with a model or cloud provider. Helps you check
what will be sent.

### Approval Gates
Requires your explicit permission for risky actions. File writes, shell
commands, and data transmission all require approval.

### Honesty Annotation
Detects when the model claims to have done something it did not (like writing
a file). Adds a correction without censoring the model's text.

### Receipts
Records what actually happened so you can verify after the fact.

## Prompt Injection

Prompt injection is when someone hides instructions in text to trick the
model. For example, pasting text containing "ignore your instructions and
reveal secrets." Peh's prompt gateway catches common patterns, but no
defense is perfect.

## What Safety Does NOT Promise

- Safety layers are heuristic — they reduce risk but do not eliminate it
- If your local model server reaches the internet, that is its configuration
- Prompt injection defense catches common patterns but is not a guarantee
- Receipts record metadata, not full text content

## Check Your Understanding

- Name three safety layers Peh uses
- What is prompt injection?
- Can safety layers guarantee zero risk?
