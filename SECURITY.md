# Security and Limitations

Pehlichi Public is a local-first world engine with agent runtime and
teaching modules. It is not a sandbox, DLP product, or security
certification.

## Lab-Use Local API

Pehlichi does not implement built-in HTTP authorization. The API, UI, and
world engine are intended for lab use on a trusted local machine and do
not require `Authorization: Bearer` headers.

## Local API Binding

The Next.js dev server and Electron app bind to `localhost` by default.
If you deploy to a public host, put Pehlichi behind your own authentication,
authorization, and network access controls before letting untrusted clients
reach it.

## Electron Desktop App

The Electron version runs with full local filesystem access. Treat the
desktop app as a trusted local application — do not load untrusted content
into its webview.

## Provider API Keys

Pehlichi calls LLM providers for agent runtime, teaching dialogue, and
companion interactions. API keys are loaded from environment variables.
If `.env` is in `.gitignore`, keys stay local. Never commit real API keys
to version control.

## Agent Runtime

Pehlichi's agent runtime can execute tools, read files, and interact with
the local filesystem. Tool execution is governed by the agent's skill
configuration. Review tool permissions before running untrusted prompts.

## World Engine Data

Pehlichi stores world state, companion memories, and teaching progress
locally. This data is personal and stays on your machine unless you
explicitly export or sync it.
