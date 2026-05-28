# Cloud Mode

## What is Cloud Mode?

Cloud Mode is where Squidley becomes a fully capable agent. She can use
powerful cloud models, execute tools, and run autonomous workflows.

**Current status: Cloud Mode is not yet implemented.** The architecture exists
but no cloud adapters, tools, or workflows are functional.

## What Cloud Mode Will Add

- More powerful models (GPT-4, Claude, etc.)
- Tool execution (file read/write, web search, etc.)
- Autonomous multi-step workflows
- Cloud-powered vision and document analysis

## How to Enable Cloud Mode (When Available)

1. Set `SQUIDLEY_MODE=cloud`
2. Configure a provider API key
3. Squidley will guide you through the setup

## Consent Model

Before making any cloud call, Squidley will:
1. Show you what will be sent
2. Explain the cost
3. Ask your explicit consent
4. Record the decision in a receipt

You can deny any cloud call. Denying keeps your data local.

## Cost

Cloud calls cost money based on token usage. Squidley will warn you before
making paid calls. Local Mode is always free.

## Check Your Understanding

- What extra capabilities does Cloud Mode add?
- What steps are needed to enable Cloud Mode safely?
- Will Squidley make cloud calls without asking?
