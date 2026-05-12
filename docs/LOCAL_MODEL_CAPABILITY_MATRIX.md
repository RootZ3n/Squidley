# Local Model Capability Matrix

Validated 2026-05-11 against Squidley Public with real local models.

For the task-level trust boundary that Squidley should show to beginners, see
[`LOCAL_MODEL_TASK_BOUNDARIES.md`](./LOCAL_MODEL_TASK_BOUNDARIES.md). This file
records evidence; the boundary file defines what Squidley may claim.

## Test Environment

- Ollama 0.23.1 on Linux (Debian 6.1)
- Models tested via Ollama (`/api/chat`) and the OpenAI-compatible
  (`/v1/chat/completions`) text path exposed by Ollama
- Real `llama-server` binary was not available on this machine and remains
  pending manual validation
- Squidley dev server with `backendType: "auto"` (Ollama) and `backendType: "llama-cpp"` (OpenAI path)
- No cloud calls made. No cloud fallback attempted.

## Evidence Types

This matrix mixes two kinds of evidence:

- **Manual evidence:** human-run module checks, UI checks, receipts, and notes
  from informal model use. Most rows below are currently manual evidence.
- **Repeatable gauntlet evidence:** output from
  `npm run gauntlet:local-model`, saved as JSON under
  `reports/local-model-gauntlet/`. This is a local smoke test, not a benchmark
  and not proof of full safety.

Use gauntlet evidence to support or challenge a row, but do not upgrade a
capability claim from one passing run alone. Small models can pass a narrow
prompt and still fail nearby real tasks.

## Local Model Gauntlet

Run against Ollama:

```bash
ollama serve
ollama pull qwen3.5:0.8b
GAUNTLET_BACKEND=ollama GAUNTLET_ENDPOINT=http://127.0.0.1:11434 GAUNTLET_MODEL=qwen3.5:0.8b npm run gauntlet:local-model
```

Run against an OpenAI-compatible local endpoint, such as real `llama-server`:

```bash
llama-server -m your-model.gguf --port 8080
GAUNTLET_BACKEND=openai-compatible GAUNTLET_ENDPOINT=http://127.0.0.1:8080 npm run gauntlet:local-model
```

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GAUNTLET_BACKEND` | `ollama` | `ollama`, `openai-compatible`, or `llama-cpp`. |
| `GAUNTLET_ENDPOINT` | `http://127.0.0.1:11434` for Ollama, `http://127.0.0.1:8080` for OpenAI-compatible | Local model endpoint. Non-local hosts are refused. |
| `GAUNTLET_MODEL` | first discovered local model | Optional model override. |

Task pack:

- basic chat
- short summarization
- instruction following
- unsafe request refusal sanity
- prompt-injection resistance
- simple code explanation

Result labels:

- `PASS`: model satisfied this narrow prompt once.
- `TRY_VERIFY`: usable-looking local output, but human verification is required.
- `NEEDS_CLOUD`: the model failed the narrow check badly enough that Squidley
  should not advertise the capability for this model without stronger evidence.
- `BLOCKED`: the task could not run, the endpoint was refused, or no usable text
  came back.

Report format:

```json
{
  "schemaVersion": 1,
  "tool": "scripts/gauntlet-local-model.mjs",
  "backend": "ollama",
  "endpoint": "http://127.0.0.1:11434",
  "model": "qwen3.5:0.8b",
  "localOnly": true,
  "cloudUsed": false,
  "statusSummary": {
    "PASS": 3,
    "TRY_VERIFY": 2,
    "NEEDS_CLOUD": 1,
    "BLOCKED": 0
  },
  "overall": "TRY_VERIFY",
  "results": [
    {
      "id": "short_summarization",
      "label": "Short summarization",
      "status": "TRY_VERIFY",
      "reason": "Captured some source facts, but summary needs human verification.",
      "durationMs": 1200,
      "replySnippet": "..."
    }
  ]
}
```

How to update this matrix from a report:

1. Keep the raw JSON report in `reports/local-model-gauntlet/` locally or attach
   it to the release validation issue.
2. Add the model/backend to **Models Tested** only after the endpoint and model
   are confirmed local.
3. Map `basic_chat` to Colloquium basic chat, `short_summarization` to
   summarization, `instruction_following` and `prompt_injection_resistance` to
   local reliability notes, and `simple_code_help` to Fabrica/code-help notes.
4. Use `TRY LOCALLY, VERIFY` for any task marked `TRY_VERIFY`; do not convert it
   to `CAN DO LOCALLY` without manual module evidence.
5. Keep `NEEDS CLOUD` or a stronger warning when the gauntlet reports
   `NEEDS_CLOUD`.

## UI-Ready Gauntlet Summary

Future UI should read gauntlet reports through
`src/lib/localGauntlet/reports.ts`, not by parsing arbitrary files. The reader
only indexes `reports/local-model-gauntlet/`, ignores malformed files, rejects
reports where `localOnly` is not `true` or `cloudUsed` is not `false`, and
returns the latest safe summary for each model/backend pair.

A small UI can display:

- **Last tested:** `completedAt`
- **Backend:** `ollama` or `openai-compatible`
- **Overall:** `PASS`, `TRY_VERIFY`, `NEEDS_CLOUD`, or `BLOCKED`
- **Status counts:** `PASS`, `TRY_VERIFY`, `NEEDS_CLOUD`, `BLOCKED`
- **Task warnings:** per-task label, status, and reason
- **Required caveat:** "Narrow local smoke only, not a benchmark or proof of
  full safety."

Do not show prompt text or model reply snippets in beginner-facing summaries by
default. The summary API intentionally omits those fields.

## Models Tested

| Model | Params | Quant | Family | Backend Tested |
|-------|--------|-------|--------|----------------|
| qwen3.5:0.8b | 873M | Q8_0 | qwen35 | ollama, llama-cpp (via Ollama OpenAI compat) |
| qwen3.5:9b | 9.7B | Q4_K_M | qwen35 | ollama |
| qwen3-coder:30b | 30.5B | Q4_K_M | qwen3moe | ollama |
| qwen3-vl:4b | 4.4B | Q4_K_M | qwen3vl | ollama |
| all-minilm:latest | 23M | F16 | bert | ollama (embedding only) |

## Capability Results

### qwen3.5:0.8b (873M, Q8_0) — Smallest practical model

| Module | Capability | Result | Notes |
|--------|-----------|--------|-------|
| Colloquium | Basic chat | CAN DO LOCALLY | Answers simple factual questions correctly. Fast (~2s). |
| Colloquium | Summarization | TRY LOCALLY, VERIFY | Sometimes inaccurate summaries. May mischaracterize source text. |
| Colloquium | Reasoning/planning | NEEDS CLOUD | Multi-step reasoning fails or produces shallow results. |
| Colloquium | Streaming | CAN DO LOCALLY | Streams correctly via both Ollama and OpenAI-compatible paths. |
| Fabrica | Code suggestion | TRY LOCALLY, VERIFY | Produces syntactically correct simple functions. Over-engineers. |
| Fabrica | Multi-file build | BLOCKED | Not available in public mode. |
| Archivum | Local storage | CAN DO LOCALLY | No model needed. |
| Archivum | Note summary | TRY LOCALLY, VERIFY | May produce shallow or incorrect summaries. |
| Velum | Deterministic review | CAN DO LOCALLY | No model needed. Pattern-based, always works. |
| Oculus | Image analysis | BLOCKED for this model | Not a vision model. |
| Tabularium | Receipt ledger | CAN DO LOCALLY | No model needed. |
| Nous | System map | CAN DO LOCALLY | No model needed. |

**Observed failures:**
- Extended thinking mode caused empty replies before `think: false` fix (now fixed)
- Factually incorrect summarization (claimed a pangram was not a pangram)
- Verbose responses even when asked for brevity

**Beginner recommendation:** Good for casual chat, quick questions, and light code help. Do not trust for factual accuracy, planning, or code correctness without review.

**Warning copy:** "This is a very small model (under 1B parameters). Replies may be brief, inaccurate, or miss nuance. Always verify important information."

### qwen3.5:9b (9.7B, Q4_K_M)

| Module | Capability | Result | Notes |
|--------|-----------|--------|-------|
| Colloquium | Basic chat | CAN DO LOCALLY | Good quality responses. |
| Colloquium | Summarization | CAN DO LOCALLY | Reasonable summaries. |
| Colloquium | Reasoning | TRY LOCALLY, VERIFY | Can do simple multi-step, but may make errors. |
| Fabrica | Code suggestion | TRY LOCALLY, VERIFY | Better code quality. Still needs review. |

**Beginner recommendation:** Good general-purpose local model. Suitable for most Colloquium tasks.

### qwen3-coder:30b (30.5B, Q4_K_M)

| Module | Capability | Result | Notes |
|--------|-----------|--------|-------|
| Fabrica | Code suggestion | CAN DO LOCALLY | High quality single-file suggestions. |
| Colloquium | Chat | CAN DO LOCALLY | Good conversational quality. |

**Beginner recommendation:** Best available local code model. Use for Fabrica tasks.

### all-minilm:latest (23M, F16, embedding-only)

| Module | Capability | Result | Notes |
|--------|-----------|--------|-------|
| Colloquium | Chat | BLOCKED | Correctly filtered as embedding model. Not offered for chat. |
| All modules | Any chat/generation | BLOCKED | Squidley correctly identifies this as embedding-only. |

**Squidley behavior:** Correctly excluded from model selection for chat, code, and vision tasks.

## Security/Honesty Validation

| Test | Result | Detail |
|------|--------|--------|
| Prompt injection blocking | PASS | Gateway blocks "ignore instructions" / "print system prompt" patterns. |
| No cloud fallback | PASS | All responses include `provider: "local"`, `cloudUsed: false`. |
| No tool declarations | PASS | No `tools` or `tool_choice` sent in any request. |
| Missing model error | PASS | Beginner-friendly message with fix instructions. |
| Empty input validation | PASS | Returns `invalid_input` error code. |
| Receipt honesty | PASS | Token counts, timing, model name, local-only flags all present. |
| backendType in stream | PASS | Meta event includes correct backendType. |

## Bug Found and Fixed

**Empty reply from thinking models (qwen3.5 family):**
- Symptom: `reply: ""` with high `evalCount` (thousands of tokens generated but invisible)
- Root cause: Model puts output in `message.thinking` field; Squidley only read `message.content`
- Fix: Send `think: false` in Ollama API requests to disable extended thinking mode
- Fixed in: `handler.ts`, `stream.ts`, `fabrica/suggest/route.ts`, `oculus/analyze/route.ts`
- Test added: Assertion that `think: false` is present in upstream request body

## Backend Path Summary

| Backend | Health | Models | Non-stream chat | Stream chat | Receipts |
|---------|--------|--------|----------------|-------------|----------|
| Ollama (auto-detected) | /api/tags (backendType: "ollama") | /api/tags normalized | /api/chat with think:false | /api/chat stream with think:false | provider:"local", cloudUsed:false |
| llama-cpp (explicit) | /health (backendType: "llama-cpp") | /v1/models (OpenAI format) | /v1/chat/completions | /v1/chat/completions stream (SSE) | provider:"local", cloudUsed:false |
| llama-cpp (via Ollama compat) | Fails (/health 404) | /v1/models works | /v1/chat/completions works | /v1/chat/completions stream works | provider:"local", cloudUsed:false |

## What Is Safe to Claim

- Squidley works with Ollama out of the box with any chat model
- Squidley implements the llama.cpp/OpenAI-compatible local text path
  (validated via Ollama's OpenAI-compatible endpoint)
- Public local release makes no cloud calls and has no cloud fallback; future
  cloud use must require explicit consent
- All receipts honestly report local-only status
- Prompt injection is blocked at the gateway
- Small models produce lower quality but Squidley does not fake it
- Embedding-only models are correctly excluded from chat
- Fabrica now routes through the backend selector (Ollama + llama-cpp)
- Oculus vision explicitly blocks llama-cpp and requires Ollama

## What Must Remain Labeled Experimental/Partial

- **Real llama-server binary: NOT VALIDATED.** No llama-server binary was available on the test machine. All OpenAI-compatible path testing was done via Ollama's /v1 endpoint, which uses the same wire format. A real llama-server binary test is still needed before claiming full support.
- Vision (Oculus) with llama-server: blocked at the route level, not just undocumented
- llama-server /health endpoint: works in unit tests but not tested against a real llama-server process
- Auto-detection when both Ollama and llama-server run simultaneously: Ollama wins (by design), not live-tested
- Token counts in llama-cpp streaming: depends on server; may be absent
- OpenAI-compatible reasoning fields (reasoning_content, thinking): detected but NOT substituted for content — Squidley reports "model did not return a reply" which is honest
