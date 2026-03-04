# MODEL_STACK.md
> Squidley's model stack, routing logic, and budget guidelines.
> Read this before any routing decisions, model selection, or cost optimization work.
> Last updated: March 2026

---

## Core Routing Philosophy

- **Local-first** — all requests default to local models. Cloud is opt-in, never default.
- **No silent escalation** — if a model or provider changes, it is logged in Receipts. Always.
- **Best bang for the buck** — match capability to requirement. Don't under-route important tasks. Don't over-route routine ones.
- **Not shy when needed** — cost consciousness should never degrade output quality on high-stakes tasks.
- **Every decision logged** — provider, model, escalation status, and reason captured in Receipts for every interaction.

---

## Full Model Stack

### Local Models (Free — Ollama on ZenPop, RTX 4070)

| Model | Role | Use Cases |
|-------|------|-----------|
| qwen2.5:14b-instruct | Primary local workhorse | Daily chat, general tasks, most routine interactions |
| qwen2.5:7b-instruct | Lightweight local | Heartbeat, fast low-stakes tasks, health checks |
| qwen3-vl:8b | Vision local | VL feedback loop, ComfyUI image QA, screenshot evaluation |

### ModelStudio API (~$20/month)

| Model | Role | Use Cases |
|-------|------|-----------|
| Qwen3-plus | Primary cloud model | Elevated chat, general cloud tasks, most non-code cloud work |
| Qwen3-max | Heavy cloud | Complex agentic tool chains, multi-step agent loops, tasks requiring extra reasoning under tool load |

### Anthropic API (~$60/month)

| Model | API String | Role | Use Cases |
|-------|-----------|------|-----------|
| Claude Sonnet | claude-sonnet-4-6 | Build + reasoning | Build Tab, code generation, architecture decisions, complex reasoning |
| Claude Opus | claude-opus-4-6 | Highest tier — use sparingly | Security review, career narrative, cover letters, irreversible architectural decisions, anything where being wrong is expensive |

---

## Routing Lanes

```
Routine chat / quick questions
  → qwen2.5:14b-instruct (local)

Heartbeat / health checks / lightweight tasks
  → qwen2.5:7b-instruct (local)

Vision tasks / image QA / screenshot evaluation
  → qwen3-vl:8b (local)

Elevated chat / general cloud tasks
  → Qwen3-plus (ModelStudio)

Complex tool loops / multi-step agent chains
  → Qwen3-max (ModelStudio)

Code generation / Build Tab / complex reasoning
  → Claude Sonnet (Anthropic)

Security review / career docs / high-stakes decisions
  → Claude Opus (Anthropic)
```

---

## When to Escalate to Opus

Opus is expensive. Use it when the cost of a wrong answer exceeds the cost of the model. Specific triggers:

- **Security review** — architectural risk assessment, injection vector analysis, trust boundary audit
- **Career documents** — resume narrative, cover letters for target roles, interview prep
- **Reasoning chains that must hold across many steps** — architectural decisions with long downstream consequences
- **When Sonnet's answer feels slightly off but you can't articulate why** — trust that instinct and escalate
- **High stakes, low reversibility** — anything you'll live with for months
- **Holistic synthesis** — tasks requiring Zen's full background, all projects, complete context simultaneously

Opus budget assumption: ~10-15% of total Anthropic usage. If Opus usage is climbing above that, review whether tasks are being routed correctly.

---

## Cost Optimization Guidelines

### Prompt Caching
Build Tab and any session that sends the same system prompt or file context repeatedly should use Anthropic prompt caching. This is the single highest-leverage cost reduction available. Implement from day one — do not retrofit later.

### Token Awareness in Build Tab
Trim irrelevant file context before sending to Sonnet. Send only the files and sections relevant to the current task. Full codebase context on every message is expensive and usually unnecessary.

### Local Models for Cheap Work
qwen2.5:14b handles the vast majority of daily load. Cloud models should touch only what genuinely needs them. Receipts data will show actual usage patterns — use this to tune routing thresholds after the first month.

### Batch Similar Tasks
When multiple tasks could use Opus, batch them into a single well-structured session rather than separate calls. The comprehensive onboarding brief approach is the model — one dense, high-quality brief produces more value per token than multiple thin interactions.

---

## Monthly Budget Summary

| Provider | Budget | Primary Models |
|----------|--------|----------------|
| Ollama (local) | Free | qwen2.5:14b, qwen2.5:7b, qwen3-vl:8b |
| ModelStudio | ~$20/month | Qwen3-plus, Qwen3-max |
| Anthropic | ~$60/month | Claude Sonnet, Claude Opus |
| **Total** | **~$80/month** | Full multi-tier stack |

---

## Important Notes

### ModelStudio ToS
Qwen3-Coder via ModelStudio was evaluated and found to have ToS restrictions incompatible with Squidley's automated backend architecture. API access through ModelStudio for Qwen3-plus and Qwen3-max avoids these restrictions. Monitor ToS changes if adding new ModelStudio models.

### Receipts as Routing Feedback
The Receipts audit trail is not just a compliance feature — it is a routing optimization tool. After one month of real usage, analyze which models are actually handling which task types versus the intended routing. Adjust thresholds based on real data, not assumptions.

### Sonnet and Qwen3-max as Peers
Sonnet and Qwen3-max are roughly capability peers but with different strengths. Sonnet is stronger on code and structured reasoning. Qwen3-max is efficient under tool load and agentic chains. Real usage data from Receipts will reveal natural task affinity over time — let that data inform routing refinements.

---

*For operator context see: WHO_I_AM.md*
*For Squidley design principles see: SQUIDLEY_IDENTITY.md*
*For full ecosystem detail see: zen_lab_onboarding_brief.docx*
