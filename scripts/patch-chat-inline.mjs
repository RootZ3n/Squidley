// scripts/patch-chat-inline.mjs
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const serverPath = path.join(repoRoot, "apps/api/src/server.ts");

let src = fs.readFileSync(serverPath, "utf8");

function fail(msg) {
  throw new Error(msg);
}

const head =
  `app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat", async (req, reply) => {`;

const start = src.indexOf(head);
if (start < 0) fail("Could not find /chat route head (expected exact signature).");

let i = start + head.length;
let depth = 1;
while (i < src.length && depth > 0) {
  const ch = src[i];
  if (ch === "{") depth++;
  else if (ch === "}") depth--;
  i++;
}
if (depth !== 0) fail("Brace scan failed: could not find end of /chat handler.");

const end = i;

// Replace the entire handler body with a known-good inline implementation
const replacement = `${head}

  const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
  const body = (req.body ?? {}) as Partial<ChatRequest> & { selected_skill?: string | null };

  const input = typeof body.input === "string" ? body.input.trim() : "";
  const selectedSkill = typeof body.selected_skill === "string" ? body.selected_skill : null;

  if (!input) return reply.code(400).send({ error: "Missing input" });

  // Build dynamic system prompt from SOUL/IDENTITY + optional selected skill + relevant memory snippets.
  // NOTE: buildChatSystemPrompt is expected to exist in this file (you already have it wired elsewhere).
  const system = await buildChatSystemPrompt({
    input,
    selected_skill: selectedSkill
  });

  const normalized: ChatRequest = {
    input,
    mode: body.mode ?? "auto",
    force_tier: body.force_tier,
    reason: body.reason
  };

  if (normalized.mode === "auto" && looksInfraOrTooling(normalized.input)) {
    normalized.mode = "force_tier";
    normalized.force_tier = "local";
  }

  if (normalized.mode === "auto" && looksCodey(normalized.input)) {
    normalized.mode = "force_tier";
    normalized.force_tier = "coder";
  }

  const decision = chooseTier(cfg, normalized);
  const receipt_id = newReceiptId();

  const effStrict = effectiveStrictLocal(cfg);
  const strictLocalOnly = effStrict.effective;

  if (strictLocalOnly && decision.tier.provider !== "ollama") {
    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1" as any,
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: {
        input: normalized.input,
        mode: normalized.mode ?? "auto",
        force_tier: normalized.force_tier,
        reason: normalized.reason,
        selected_skill: selectedSkill
      },
      decision: {
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        escalated: true,
        escalation_reason: \`blocked: strict_local_only enabled (source=\${effStrict.source})\`
      }
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.code(403).send({
      error: "Strict local mode enabled: non-local providers are blocked",
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      receipt_id
    });
  }

  const needsReason = !isLocalProvider(decision.tier.provider);
  const hasReason = typeof normalized.reason === "string" && normalized.reason.trim().length > 0;

  if (needsReason && cfg.budgets.escalation_requires_reason && !hasReason) {
    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1" as any,
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: {
        input: normalized.input,
        mode: normalized.mode ?? "auto",
        force_tier: normalized.force_tier,
        reason: normalized.reason,
        selected_skill: selectedSkill
      },
      decision: {
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        escalated: true,
        escalation_reason: "blocked: missing required reason for non-local escalation"
      }
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.code(400).send({
      error: "Escalation reason required for non-local providers",
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      receipt_id
    });
  }

  const messages = [
    { role: "system", content: system },
    { role: "user", content: normalized.input }
  ] as const;

  if (decision.tier.provider === "ollama") {
    const ollama = await ollamaChat({
      baseUrl: cfg.providers.ollama.base_url,
      model: decision.tier.model,
      messages: [...messages]
    });

    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1" as any,
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: {
        input: normalized.input,
        mode: normalized.mode ?? "auto",
        force_tier: normalized.force_tier,
        reason: normalized.reason,
        selected_skill: selectedSkill
      },
      decision: {
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        escalated: decision.escalated,
        escalation_reason: decision.escalation_reason
      },
      provider_response: (ollama as any).raw
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.send({
      output: (ollama as any).output,
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      receipt_id,
      escalated: decision.escalated,
      escalation_reason: decision.escalation_reason
    });
  }

  if (decision.tier.provider === "openai") {
    const { openaiChat } = await import("@zensquid/provider-openai");

    const out = await openaiChat({
      model: decision.tier.model,
      messages: [...messages]
    });

    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1" as any,
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: {
        input: normalized.input,
        mode: normalized.mode ?? "auto",
        force_tier: normalized.force_tier,
        reason: normalized.reason,
        selected_skill: selectedSkill
      },
      decision: {
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        escalated: decision.escalated,
        escalation_reason: decision.escalation_reason
      },
      provider_response: (out as any).raw
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.send({
      output: (out as any).output,
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      receipt_id,
      escalated: decision.escalated,
      escalation_reason: decision.escalation_reason
    });
  }

  const receipt: any = withKind("chat", {
    schema: "zensquid.receipt.v1" as any,
    receipt_id,
    created_at: new Date().toISOString(),
    node: cfg.meta.node,
    request: {
      input: normalized.input,
      mode: normalized.mode ?? "auto",
      force_tier: normalized.force_tier,
      reason: normalized.reason,
      selected_skill: selectedSkill
    },
    decision: {
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      escalated: decision.escalated,
      escalation_reason: "provider not implemented yet"
    }
  });

  await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

  return reply.code(501).send({
    error: "Provider not implemented yet",
    tier: decision.tier.name,
    provider: decision.tier.provider,
    model: decision.tier.model,
    receipt_id
  });
});
`;

src = src.slice(0, start) + replacement + src.slice(end);
fs.writeFileSync(serverPath, src, "utf8");

console.log("Patched /chat: removed runChat dependency and inlined chat flow using dynamic SOUL/IDENTITY/skill/memory system prompt.");
