# Tool Matrix — Peh

This document is the truth matrix for every tool-like ability a user might
expect Peh to perform. The machine-readable form is
[`docs/tool-matrix.public-peh.json`](tool-matrix.public-peh.json).

## Core principle

**A local model is not a tool by itself.**

A model can write text that says *"I wrote the file"*, *"I ran the
command"*, *"I searched the web"*. Those sentences are LLM output; they
are not evidence that anything actually happened. Peh ships
**zero action tools**, so any such claim from the model is a hallucination
and must be corrected by the application, not by trusting the model.

## Where the application catches hallucinations

[`src/lib/chat/honestyAnnotation.ts`](../src/lib/chat/honestyAnnotation.ts)
is a pure detector. It runs after every model reply in the chat handler
and stream route. When it detects a tool-action claim the build cannot
actually perform, it emits a user-visible correction:

- Non-streaming `/api/chat` → `ChatSuccessBody.honestyMessage` field
  alongside the unchanged `reply`.
- Streaming `/api/chat/stream` → `honesty` SSE event emitted between the
  last `delta` and the `done` event.
- Tabularium receipt → `responseMode: "local_model"` plus `hallucinatedActions`
  and `unavailableTools` in metadata.
- Colloquium UI → yellow "Honesty note" banner under the assistant
  message + permanent "answered by local model only · no tool used · no
  cloud used" provenance footer.

Tests:
- [`src/lib/chat/honestyAnnotation.test.ts`](../src/lib/chat/honestyAnnotation.test.ts)
  (21 unit tests, all hallucination patterns)
- [`src/lib/toolHonesty.test.ts`](../src/lib/toolHonesty.test.ts) (8
  end-to-end tests on the chat handler)

## Status legend

- **LOCAL_TOOL_READY** — Real local tool implemented, enabled, tested.
  Produces a real tool receipt on success.
- **LOCAL_MODEL_ONLY** — Answered by the local model's TEXT alone, no tool
  action. The model cannot claim a tool action; the honesty annotator
  overrides such claims.
- **LOCAL_PARTIAL** — Some local execution exists but is limited or
  backend-conditional.
- **LOCAL_BLOCKED** — Local path is reachable but explicitly disabled.
- **DISABLED** — Implementation exists elsewhere; disabled here.
- **NOT_IMPLEMENTED** — No backing route, no implementation, no fetch
  path, no execution surface.
- **CLOUD_REQUIRED_NOT_WIRED** — Cloud would be required; no cloud call
  path is wired.

## Headline counts

| Status | Count |
|---|---|
| LOCAL_TOOL_READY | 6 |
| LOCAL_MODEL_ONLY | 1 |
| LOCAL_PARTIAL | 3 |
| LOCAL_BLOCKED | 0 |
| DISABLED | 0 |
| NOT_IMPLEMENTED | 14 |
| CLOUD_REQUIRED_NOT_WIRED | 1 |
| MOCK_DEMO_ONLY | 0 |
| UNKNOWN | 0 |

## Tools that are real (LOCAL_TOOL_READY)

| Tool | Route | Receipt |
|---|---|---|
| `notes_storage` (Archivum) | `/archivum` (browser-only) | archivum.local-storage |
| `model_list` | `/api/local/models` | system listing |
| `model_health` | `/api/local/health` | system probe |
| `receipts_view` (Tabularium) | `/tabularium` (browser-only) | tabularium.local-view |
| `capability_discovery` (Nous) | `/nous` (browser-only) | n/a |
| `diagnostics` | `scripts/peh-pub-diagnostic.mjs` | dev tool |

These produce evidence of their action — a stored note, a returned model
list, a probe response, a logged receipt, a static read of the registry,
or a printed JSON report.

## Tools that are model-only (LOCAL_MODEL_ONLY)

| Tool | Route | Honest note |
|---|---|---|
| `code_edit_single_file` (Fabrica) | `/api/fabrica/suggest` | Fabrica produces a single-file SUGGESTION using the local model. It does NOT save the file or apply the change — the user copies the suggestion themselves. |

## Tools that are partial (LOCAL_PARTIAL)

| Tool | Why |
|---|---|
| `file_upload` (image bytes via Oculus) | Ollama only; image bytes flow through the local endpoint only. |
| `image_analysis` (Oculus) | Quality depends on local vision model; llama-cpp explicitly blocked. |
| `gauntlet` (heuristic local-model smoke) | Heuristic, not formal safety proof; TRY_VERIFY/NEEDS_CLOUD downgrade. |

## Tools that are NOT_IMPLEMENTED

These are tools a user might naturally ask for, where Peh's honesty
annotator overrides any model claim:

| Tool | What the user gets instead |
|---|---|
| `fs.read` | "Paste the relevant text and I can work with it." |
| `fs.write` | "I can draft the content, but this build cannot save it to disk." |
| `fs.delete` | "Nothing was removed." |
| `fs.move` | "Nothing was moved/renamed." |
| `document_parse` | "This build does not include a local PDF/DOCX parser." |
| `shell` | "I can suggest a command for you to run manually." |
| `code_execute` | "I can explain what the code would do." |
| `project_inspect` | "Paste a single file's text and I can suggest changes." |
| `local_search` | "Paste relevant text and I can answer from it." |
| `web_search` | "No web/search tool here; cloud is locked." |
| `browse` | "No browser tool; no URL was fetched." |
| `memory_write` | "Save notes manually via Archivum." |
| `send_email` | "Bug-report flow opens your email client; you send it." |
| `git_commit` | "I cannot touch git." |
| `package_install` | "I cannot install or remove packages." |

## Tools that are CLOUD_REQUIRED_NOT_WIRED

| Tool | What |
|---|---|
| `code_edit_multi_file` | Future Cloud Agent mode. No fetch path exists. |

## Cloud-blocking summary (tools section)

| Question | Answer |
|---|---|
| Can a local model fs.write through this build? | **No.** No fs.write tool exists. |
| If not, does Peh say so? | **Yes.** Annotator emits `honestyMessage` when the model implies it. |
| Can a local model run shell commands? | **No.** No shell tool exists. |
| If not, does Peh say so? | **Yes.** Annotator covers it. |
| Can a local model browse/search the web? | **No.** No browse/search tool. |
| If not, does Peh say so? | **Yes.** Annotator covers it. |
| Can a model hallucinate that it wrote/read/ran/searched something? | The model's *text* can. The application's response carries a clear honesty correction; the UI shows it; the receipt records it. The action did not happen. |
| Can tool success be claimed without a tool receipt? | **No.** Every success-claiming surface (Tabularium receipt, UI provenance footer, response `responseMode`) is set by the application based on real evidence — not by the model's text. |
| Can NOT_IMPLEMENTED tools appear ready? | **No.** The diagnostic verifies the tool matrix and capability matrix agree; UI footer says "no tool used"; module pages for locked features show locked-future copy. |
| Can cloud-required tools imply cloud was called? | **No.** `cloudUsed: false` and `cloudCalled: false` are type-level constants. |
| Can the user see whether an answer was model-only or tool-backed? | **Yes.** The Colloquium UI shows a permanent "answered by local model only · no tool used · no cloud used" provenance footer under every assistant message. |
