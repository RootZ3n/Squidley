# Local Chat in Peh

Peh's Colloquium module talks to a **local model server**. Ollama
is validated end-to-end. The llama.cpp text path uses an OpenAI-compatible
local backend and has been tested through Ollama's compatible endpoint; a real
`llama-server` binary still needs manual validation. Colloquium does not call
any cloud provider. There is no fallback, no silent provider switch, and no
remote telemetry. If your local server is down, chat is down — that is the
contract.

## What runs where

```
┌────────────┐       ┌──────────────────────┐       ┌──────────────────┐
│  Browser   │──POST▶│ /api/chat/stream     │──POST▶│  Ollama @ :11434 │
│  Colloquium│◀──────│ src/lib/chat/stream  │◀──────│  /api/chat        │
└────────────┘       └──────────────────────┘       └──────────────────┘
```

Colloquium uses:

- `GET /api/local/health` to check the configured local server.
- `GET /api/local/models` to discover installed or loaded local models.
- `POST /api/chat/stream` to stream local replies token-by-token.

The older non-streaming `POST /api/chat` route remains local-only as an
internal fallback path. There is no cloud provider behind these chat routes;
they use the configured local Ollama backend or the configured
OpenAI-compatible local text backend.

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
4. **Run Peh:**
   ```bash
   npm install
   npm run dev
   ```
   Open <http://localhost:3000>, complete or skip the tour, and send a
   message in Colloquium. The header should show "Local model server ready."

## Configuration

Configuration is read from environment variables on the **server only**.
No secrets are required.

| Variable | Default | What it does |
| --- | --- | --- |
| `PEH_LOCAL_ENDPOINT` | `http://localhost:11434` | Base URL of the local model server. Trailing slashes are stripped. |
| `PEH_LOCAL_MODEL` | `llama3.2` | Model name passed in each chat request. |
| `PEH_LOCAL_BACKEND` | `auto` | `auto`, `ollama`, or `llama-cpp`. `llama-cpp` uses an OpenAI-compatible local text API. |

Examples:

```bash
# Point Peh at a server on a different port
PEH_LOCAL_ENDPOINT=http://127.0.0.1:9000 npm run dev

# Use a different model you've already pulled with Ollama
PEH_LOCAL_MODEL=qwen2.5:3b npm run dev
```

The configured values are surfaced in chat receipts and message metrics so
you can verify which model actually answered. If the configured default model
is installed, Colloquium selects it. Otherwise it selects the first model
returned by Ollama. If no models are installed, the selector is disabled and
Colloquium suggests pulling one.

## Health Check and Model Discovery

`GET /api/local/health` calls `${PEH_LOCAL_ENDPOINT}/api/tags` and returns
a beginner-readable payload:

```json
{
  "ok": true,
  "provider": "local",
  "endpoint": "http://localhost:11434",
  "modelCount": 1,
  "cloudUsed": false
}
```

If Ollama is unavailable, the route returns `ok: false`, an `errorCode`, and a
plain-language `reason`. Stack traces and raw connection errors are not exposed
to the browser.

`GET /api/local/models` also calls `/api/tags` and normalizes models into:

```json
{
  "name": "llama3.2:latest",
  "displayName": "llama3.2 latest",
  "size": 2019393189,
  "modifiedAt": "2026-04-01T00:00:00Z"
}
```

To install another local model:

```bash
ollama pull qwen2.5:3b
```

After the pull completes, use **Refresh models** in Colloquium. Peh calls
the local health and model discovery routes again without refreshing the whole
page. Refresh is disabled while a reply is actively streaming so it does not
interrupt the current response.

When models are refreshed, Colloquium keeps your selected model if it is still
installed. If that model disappeared, Peh selects the configured default
model when available, otherwise the first discovered model. If no models are
available, the selector is empty and Send stays disabled.

Colloquium also reads the browser-local Nous model preference for chat. When
that preference is used, Colloquium shows a small "Using your Nous preference"
note and a **Change in Nous** link. Changing the model directly in Colloquium
saves that choice as the new shared Colloquium preference.

## Compatibility

Ollama support targets `/api/tags` and `/api/chat` and is validated
end-to-end. The llama.cpp text path targets `/health`, `/v1/models`, and
`/v1/chat/completions` through an OpenAI-compatible local API; real
`llama-server` binary validation is still pending.

Any Ollama-compatible server that exposes the same endpoint shapes should work:

```
POST /api/chat
{ "model": "<name>", "messages": [...], "stream": true }
```

Peh converts Ollama's newline-delimited stream into a small
newline-delimited stream for the browser:

- `meta` includes `provider: local`, `cloudUsed: false`, `toolsUsed: false`,
  the selected model, and start time.
- `delta` includes incremental assistant text.
- `done` includes duration and token counts when Ollama reports them.
- `error` includes a beginner-readable local error.

## Local-only guarantee

The handler is small on purpose so the guarantee is auditable:

- It only calls the configured local endpoint for the selected backend:
  Ollama `/api/tags` and `/api/chat`, or llama.cpp/OpenAI-compatible
  `/health`, `/v1/models`, and `/v1/chat/completions`. There is no retry
  against a cloud host and no cloud fallback.
- Every response (success or error) carries `cloudUsed: false` and
  `toolsUsed: false`.
- The Colloquium UI shows a green "Local-only" badge in the header at
  all times in this pass.

There are unit tests covering this in `src/lib/chat/handler.test.ts`,
`src/lib/chat/stream.test.ts`, `src/lib/providers/ollama.test.ts`, and the
llama.cpp backend tests.

## Prompt Gateway

Before chat text is sent to the local model server, Prompt Gateway performs a
deterministic local check for prompt-injection signals. Low-risk text is sent
normally. Suspicious educational discussion can be sent with a model-facing
caution. Direct attempts to override instructions, reveal hidden prompts, use
tools or shell commands, exfiltrate data, or bypass local boundaries are paused
with a friendly message.

See [docs/PROMPT_GATEWAY.md](PROMPT_GATEWAY.md).

## Local Conversation Storage

Colloquium saves chat history and recent visible receipts in this browser using
versioned `localStorage`. It restores them on page load without sending any
messages or restarting interrupted streams. Use **Clear chat** to remove the
saved local chat for this browser, or **Export chat** to download a local `.txt`
copy.

See [`docs/LOCAL_CONVERSATIONS.md`](LOCAL_CONVERSATIONS.md) for details.

## Redacted Drafts from Velum

Use **Review in Velum** near the Colloquium input box to send the current draft
to Velum for local review before submitting it to your local model. The draft is
passed through browser `sessionStorage`, not the URL, and Velum waits for you to
click **Review text**.

Velum can hand a redacted preview to Colloquium as a draft. Colloquium consumes
that browser-local handoff once, fills the input box, and waits for you to click
**Send**. The original unredacted Velum text is not transferred.

## Receipts

Every send writes a receipt the user can see:

| Field | Source |
| --- | --- |
| `provider` | always `local` |
| `model` | selected discovered local model |
| `status` | `running` → `succeeded` or `failed` |
| `startedAt` / `completedAt` | browser and stream route clocks (`Date.now()`) |
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

**Peh says it can't reach the local server.**
The configured endpoint isn't reachable. Make sure Ollama is running
(`ollama serve`), and that the host and port match `PEH_LOCAL_ENDPOINT`.
In Colloquium, the local-only badge stays visible and Send remains disabled.
Start Ollama, then use **Refresh models**:

```bash
ollama serve
```

**No models appear in the selector.**
Ollama is reachable, but no local models are installed. Pull one, then use
**Refresh models**:

```bash
ollama pull llama3.2
```

Peh will not fall back to a cloud model while you do this.

**A model I pulled is not appearing.**
First check that Ollama sees it:

```bash
ollama list
```

If it appears there, use **Refresh models** in Colloquium. If it still does not
appear, confirm Peh is pointed at the same endpoint as Ollama:

```bash
PEH_LOCAL_ENDPOINT=http://localhost:11434 npm run dev
```

If you want Peh to prefer a specific installed model on startup, set:

```bash
PEH_LOCAL_MODEL=qwen2.5:3b npm run dev
```

**Peh says the model isn't installed.**
The local server is up, but the model name in the request isn't pulled
locally. Pull it: `ollama pull <model>`. Then retry, or change
`PEH_LOCAL_MODEL` to something you already have.

**The server returned an error (HTTP 5xx).**
Something is wrong inside the local server itself — model is loading,
OOM, etc. Check the Ollama logs in the terminal running `ollama serve`.

**The reply is empty.**
The model returned no content. This usually means the model wasn't given
enough context, or the model itself is misconfigured. Try a different
model from your `ollama list`.

## What this pass intentionally does *not* do

- No memory or RAG.
- No tool execution.
- No multi-agent routing.
- No cloud providers.
- No autonomous shell execution.
- No background agents.
- No telemetry.

These are deliberately out of scope. The point of this pass is to make local
chat feel responsive and beginner-friendly without weakening the local-only
contract.
