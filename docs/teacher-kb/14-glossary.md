# Glossary

**AI (Artificial Intelligence):** Software that processes language, images, or data and produces useful responses.

**Agent:** An AI system that can plan, use tools, and take real actions — not just generate text.

**API Key:** A password that lets an app use a cloud provider's models. Tied to your account, usually costs money per use.

**Approval Gate:** A safety checkpoint where Squidley asks permission before doing something risky.

**Approval Token:** A short-lived, scoped permission Squidley uses to apply an approved action. Bound to a specific file (and, for tiny edits, to specific snippet hashes). Expires automatically; cannot be reused for a different file.

**Autonomous Workflow:** A multi-step task where the agent plans, executes, and checks in at key points.

**Capability Matrix:** A table showing what Squidley can and cannot do in each mode. See [docs/MODE_CAPABILITY_MATRIX.md](../MODE_CAPABILITY_MATRIX.md).

**Capability Tier:** One of `LOCAL_READY`, `LOCAL_LIMITED`, `LOCAL_PARTIAL`, `CLOUD_PLANNED`, `NOT_IMPLEMENTED`, `BLOCKED`. See the [Capability Taxonomy](../CAPABILITY_TAXONOMY.md).

**Cloud Mode:** Squidley's full-capability mode using cloud providers, tools, and autonomous workflows. Requires explicit opt-in.

**Cloud Model:** An AI model running on a company's server. Costs money, data leaves your machine.

**Context Window:** The maximum amount of text a model can read and remember at once.

**Cost:** Cloud providers charge per token. Local models are free.

**Deterministic:** Predictable. Given the same input, you get the same output, with no guessing. Used in Squidley for the parts that must behave consistently — approval gates, refusals, planning logic, receipts.

**Egress:** Data leaving your machine. Squidley's egress guard blocks non-local requests in Local Mode.

**Hallucination:** When a model confidently says something that is not true.

**Honesty Annotation / Honesty Correction:** Squidley's system for detecting and correcting false claims from the model. When the model says it did something this build cannot do, Squidley adds a correction note under the reply.

**Inspection (approval-gated file inspection):** Squidley reads one file at a time, only after you approve the exact path. Read-only, ≤256 KB, secrets redacted before they reach the model context. Bound to a short-lived approval token.

**llama.cpp / llama-server:** A program for running AI models locally using GGUF files. Alternative to Ollama.

**Local Mode:** Squidley's default mode where everything runs on your machine. Private, free, offline-capable.

**Local Model:** An AI model running on your own computer. Private and free.

**Model:** The trained program that reads input and generates a response.

**Model-Only Answer:** A response generated purely by text generation, with no tool action.

**Ollama:** A program that makes it easy to download and run AI models locally.

**Planning (Squidley's planner):** Squidley reads your goal and produces a structured plan with evidence labels (known, inferred, assumed, missing) and a risk level (safe, review, elevated, blocked). The planner does not execute — it just describes how Squidley would approach the task. Blocked plans return zero executable steps.

**Privacy:** Whether your text stays on your machine (local) or goes to a server (cloud).

**Prompt:** The text you send to a model.

**Prompt Injection:** An attack that hides instructions in text to trick a model.

**Provider:** A company that runs AI models on their servers (OpenAI, Anthropic, etc.).

**Provenance:** Information about where an answer came from and how it was produced.

**Ratio:** Squidley's decision engine that picks which capability handles a request and surfaces honest limitations when the model or mode cannot fully deliver.

**Reliability Layer:** A bounded wrapper for small local models. It plans a short sequence of safe compound tools (explain project structure, inspect one file, summarise an error, run a health check) with caps of 6 steps and 2 retries. It can suggest cloud escalation but cannot run it.

**Receipt:** A record of what Squidley actually did, stored for verification.

**Response:** The text a model writes back after reading your prompt.

**Risk Tiers:** Classification of tool actions by risk: low, medium, high.

**Safety:** The combination of guards, checks, and approval gates that keep you in control.

**Tabularium:** Squidley's receipt ledger where you can review everything she did.

**Tiny Edit:** A narrow, approval-gated edit that replaces exactly one snippet in one already-inspected file. Diff capped at 4 KB. Includes an in-memory backup and automatic rollback if verification fails after applying.

**Token:** A small piece of text (roughly a word) that models process. Used for pricing and limits.

**Tool Call:** When Squidley uses a real tool to take an action, not just generate text.

**Tool-Backed Action:** A response based on a real tool action, with a receipt as proof.

**Velum:** Squidley's deterministic text review tool. Runs heuristic checks (secrets, prompt-injection patterns, risky requests) before text reaches the model. Heuristic — useful but not a guarantee of safety.
