# Local Chat in Public Squidley

Public Squidley's Colloquium module talks to a **local, Ollama-compatible
chat server**. It does not call any cloud provider. There is no fallback,
no silent provider switch, and no remote telemetry. If your local server
is down, chat is down — that is the contract.

## What runs where

```
┌────────────┐       ┌──────────────────────┐       ┌──────────────────┐
│  Browser   │──POST▶│ /api/chat (Next.js)  │──POST▶│  Ollama @ :11434 │
│  Colloquium│◀──────│ src/lib/chat/handler │◀──────│  /api/chat        │
└────────────┘       └──────────────────────┘       └──────────────────┘
```

The Next.js route handler in `src/app/api/chat/route.ts` is a thin wrapper
around the pure handler in `src/lib/chat/handler.ts`. The handler reads
its endpoint and model from the configured local provider only. There is
no other provider in the codebase.

## Quick start

1. **Install Ollama** — <https://ollama.com/download> (macOS, Linux, Windows).
2. **Pull a model.** The default is `llama3.2`:
   ```bash
   ollama pull llama3.2
   ```
3. **Start the local server.** Ollama runs as a service after install; if
   not, start it explicitly:
   ```bash
   ollama serve
   ```
   It listens on `http://localhost:11434` by default.
4. **Run Squidley:**
   ```bash
   npm install
   npm run dev
   ```
   Open <http://localhost:3000>, complete or skip the tour, and send a
   message in Colloquium.

## Configuration

Configuration is read from environment variables on the **server only**.
No secrets are required.

| Variable | Default | What it does |
| --- | --- | --- |
| `SQUIDLEY_LOCAL_ENDPOINT` | `http://localhost:11434` | Base URL of the Ollama-compatible server. Trailing slashes are stripped. |
| `SQUIDLEY_LOCAL_MODEL` | `llama3.2` | Model name passed in each chat request. |

Examples:

```bash
# Point Squidley at a server on a different port
SQUIDLEY_LOCAL_ENDPOINT=http://127.0.0.1:9000 npm run dev

# Use a different model you've already pulled with Ollama
SQUIDLEY_LOCAL_MODEL=qwen2.5:3b npm run dev
```

The configured values are surfaced in chat receipts and message metrics so
you can verify which model actually answered.

## Compatibility

This pass targets Ollama's `/api/chat` endpoint. Any server that exposes
the same endpoint shape will work:

```
POST /api/chat
{ "model": "<name>", "messages": [...], "stream": false }
```

Streaming is not implemented in this pass; the request is sent with
`stream: false` and the full reply is returned in one JSON body. The code
in `src/lib/chat/handler.ts` is structured so a streaming path can be
added later without changing the public response shape.

## Local-only guarantee

The handler is small on purpose so the guarantee is auditable:

- It only ever calls `${config.endpoint}/api/chat`. There is no second
  fetch, no retry against a different host, and no environment-driven
  fallback.
- Every response (success or error) carries `cloudUsed: false` and
  `toolsUsed: false`.
- The Colloquium UI shows a green "Local-only" badge in the header at
  all times in this pass.

There are unit tests covering this in `src/lib/chat/handler.test.ts` —
see the "local-only guarantee" describe block.

## Receipts

Every send writes a receipt the user can see:

| Field | Source |
| --- | --- |
| `provider` | always `local` |
| `model` | configured default, or `model` field from the request |
| `status` | `running` → `succeeded` or `failed` |
| `startedAt` / `completedAt` | server clock (`Date.now()`) |
| `cloudUsed` | always `false` |
| `toolsUsed` | always `false` |
| `errorMessage` | beginner-friendly error when status is `failed` |

## Message metrics

Each assistant reply renders a small row of metrics under the bubble:

- response time (`Xms` / `Y.YYs`)
- character count of the reply
- token count, with a leading `~` when approximate
- model name
- `local` indicator

Token counts come from Ollama's `eval_count` when the upstream returns
it. When it doesn't, we fall back to a 4-chars-per-token approximation
and label it as such — we don't pretend precision we don't have.

## Troubleshooting

**Squidley says it can't reach the local server.**
The configured endpoint isn't reachable. Make sure Ollama is running
(`ollama serve`), and that the host and port match `SQUIDLEY_LOCAL_ENDPOINT`.

**Squidley says the model isn't installed.**
The local server is up, but the model name in the request isn't pulled
locally. Pull it: `ollama pull <model>`. Then retry, or change
`SQUIDLEY_LOCAL_MODEL` to something you already have.

**The server returned an error (HTTP 5xx).**
Something is wrong inside the local server itself — model is loading,
OOM, etc. Check the Ollama logs in the terminal running `ollama serve`.

**The reply is empty.**
The model returned no content. This usually means the model wasn't given
enough context, or the model itself is misconfigured. Try a different
model from your `ollama list`.

## What this pass intentionally does *not* do

- No streaming responses.
- No memory or RAG.
- No tool execution.
- No multi-agent routing.
- No cloud providers.
- No autonomous shell execution.
- No background agents.
- No telemetry.

These are deliberately out of scope. The point of this pass is to make
the Send button real, safely, and nothing more.
