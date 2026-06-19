# Local Mode

## What is Local Mode?

Local Mode is Peh's default. Everything runs on your machine. Your text
never leaves your device. There is no cost and no API key needed.

## What Works in Local Mode

- Chat with a local model (Ollama or llama-server)
- Single-file code suggestions
- Image analysis (Ollama vision, limited)
- Note storage (browser-local)
- Receipt ledger
- System diagnostics and health checks

## What Does Not Work (Yet)

- File read/write — no tool execution surface
- Shell commands — not available
- Web search — no search provider
- Multi-file editing — requires Cloud Mode
- Agent workflows — requires Cloud Mode

These are planned capabilities. Local Mode is the starting classroom, not the
ceiling.

## The Egress Guard

In Local Mode, Peh's egress guard blocks all non-local network requests.
Only localhost and private IP addresses are allowed. Cloud URLs are rejected.
This is how Peh guarantees nothing leaves your machine.

## API Keys Do Not Change Local Mode

If you set cloud API keys (like OPENAI_API_KEY), Local Mode does not change.
The keys are ignored. Cloud Mode requires explicit opt-in.

## Check Your Understanding

- What can Peh do in Local Mode?
- Why can't Peh write files in Local Mode?
- What does the egress guard do?
