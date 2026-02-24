// apps/api/src/server.ts
import Fastify from "fastify";
import corsPkg from "@fastify/cors";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import {
  buildChatSystemPrompt,
  // ✅ Squid Notes builder (Memory v2 injection + receipt metadata)
  buildSquidNotesContext,
  normalizeRelPath,
  memoryAbs,
  ensureMemoryRoot
} from "./chat/systemPrompt.js";

import {
  loadConfig,
  chooseTier,
  newReceiptId,
  writeReceipt,
  type ChatRequest,
  type ReceiptV1,
  type ProviderName
} from "@zensquid/core";

import { ollamaChat } from "@zensquid/provider-ollama";
import { modelstudioChat } from "@zensquid/provider-modelstudio";

import { loadCapabilityPolicy, normalizeZone, zonePolicy } from "./capabilities/policy.js";
import { checkCapabilityAction } from "./capabilities/gate.js";
import type { CapabilityAction } from "./capabilities/types.js";

import { makeRuntimePaths, type RuntimeState, type SafetyZone } from "./runtime/state.js";

// ✅ Model class / active model info
import { classifyModel } from "./runtime/modelClass.js";

import { registerSkillsRoutes } from "./http/routes/skills.js";
import { registerToolsRoutes } from "./http/routes/tools.js";
import { registerReceiptsRoutes } from "./http/routes/receipts.js";
import { registerDoctorRoutes } from "./http/routes/doctor.js";
import { registerRuntimeRoutes } from "./http/routes/runtime.js";
import { registerMemoryRoutes } from "./http/routes/memory.js";
import { registerTokenMonitorRoutes } from "./http/routes/token_monitor.js";
import { registerOnboardingRoutes } from "./http/routes/onboarding.js";
import { registerCapabilitiesRoutes } from "./http/routes/capabilities.js";
import { registerGuardRoutes, evaluateGuard } from "./http/routes/guard.js";
import { registerAutonomyRoutes } from "./http/routes/autonomy.js";

// ✅ Tool Runner (local-only allowlisted execution)
import { toolsRoutes } from "./routes/tools.js";

type RequestKind = "chat" | "heartbeat" | "tool" | "system";

const app = Fastify({ logger: true });
await app.register(corsPkg, { origin: true });

// ✅ Register Tool Runner routes AFTER app exists
await app.register(toolsRoutes);

app.get("/health", async () => ({ ok: true, name: "Squidley API" }));

await registerAutonomyRoutes(app, {
  zensquidRoot,
  adminTokenOk,
  allowlist: ["web.build", "web.pw", "git.status", "git.diff", "git.log", "rg.search", "diag.sleep"]
  // optional: workspace: () => zensquidRoot()
});

function zensquidRoot(): string {
  return process.env.ZENSQUID_ROOT ?? process.cwd();
}

function dataDir(): string {
  return path.resolve(zensquidRoot(), "data");
}

function receiptsDir(): string {
  return path.resolve(dataDir(), "receipts");
}

function memoryRoot(): string {
  return path.resolve(zensquidRoot(), "memory");
}

function soulFile(): string {
  return path.resolve(zensquidRoot(), "SOUL.md");
}

function identityFile(): string {
  return path.resolve(zensquidRoot(), "IDENTITY.md");
}

/**
 * Runtime state (loaded via runtimePaths)
 */
function isSafetyZone(v: unknown): v is SafetyZone {
  return v === "workspace" || v === "diagnostics" || v === "forge" || v === "godmode";
}

const runtimePaths = makeRuntimePaths(zensquidRoot);

let runtimeState: RuntimeState = { strict_local_only: null, safety_zone: null };
runtimeState = await runtimePaths.loadRuntimeState();

const getRuntimeState = () => runtimeState;
const setRuntimeState = (s: RuntimeState) => {
  runtimeState = s;
};

function adminTokenOk(req: any): boolean {
  const expected = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();
  if (expected.length < 12) return false;

  const got = String(req.headers?.["x-zensquid-admin-token"] ?? "");
  if (got.length !== expected.length) return false;

  // timingSafeEqual requires same-length buffers
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Onboarding completion cache (cheap + reliable)
 * This supports: strict-local-only is ONLY for onboarding by default.
 */
let _onboardingCache: { ts: number; completed: boolean } = { ts: 0, completed: false };
async function onboardingCompleted(): Promise<boolean> {
  const now = Date.now();
  if (now - _onboardingCache.ts < 2500) return _onboardingCache.completed;

  try {
    const p = path.resolve(runtimePaths.dataDir(), "onboarding.json");
    const raw = await readFile(p, "utf-8");
    const j = JSON.parse(raw) as any;
    const completed = Boolean(j?.completed);
    _onboardingCache = { ts: now, completed };
    return completed;
  } catch {
    _onboardingCache = { ts: now, completed: false };
    return false;
  }
}

type StrictSource = "runtime" | "config" | "runtime_onboarding_relaxed";

/**
 * ✅ Strict-local-only behavior:
 * - During onboarding: strict_local_only can be enforced by preset/runtime/config
 * - After onboarding complete: strict_local_only should default OFF unless user explicitly forces it later
 *
 * Escape hatch:
 * - Set ZENSQUID_AUTO_DISABLE_STRICT_AFTER_ONBOARDING=false to preserve old behavior.
 */
async function effectiveStrictLocal(cfg: any): Promise<{ effective: boolean; source: StrictSource }> {
  const autoRelax =
    String(process.env.ZENSQUID_AUTO_DISABLE_STRICT_AFTER_ONBOARDING ?? "true").trim().toLowerCase() === "true";

  const completed = await onboardingCompleted();

  if (typeof runtimeState.strict_local_only === "boolean") {
    // If onboarding is complete and strict was enabled via preset/runtime, relax by default.
    // Users can still explicitly turn it back on via runtime routes.
    if (autoRelax && completed && runtimeState.strict_local_only === true) {
      return { effective: false, source: "runtime_onboarding_relaxed" };
    }
    return { effective: runtimeState.strict_local_only, source: "runtime" };
  }

  // Config fallback (treat as onboarding default only, unless user intentionally sets it)
  const cfgStrict = Boolean((cfg as any)?.budgets?.strict_local_only);
  if (autoRelax && completed && cfgStrict) {
    return { effective: false, source: "runtime_onboarding_relaxed" };
  }

  return { effective: cfgStrict, source: "config" };
}

function effectiveSafetyZone(cfg: any): { effective: SafetyZone; source: "runtime" | "config" } {
  if (isSafetyZone(runtimeState.safety_zone)) {
    return { effective: runtimeState.safety_zone, source: "runtime" };
  }

  const fromCfg = (cfg as any)?.meta?.safety_zone;
  if (isSafetyZone(fromCfg)) return { effective: fromCfg, source: "config" };

  const localFirst = Boolean((cfg as any)?.meta?.local_first);
  return { effective: localFirst ? "workspace" : "diagnostics", source: "config" };
}

function preview(s: unknown, n = 100): string {
  const t = String(s ?? "");
  const oneLine = t.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}

function isLocalProvider(p: ProviderName) {
  return p === "ollama";
}

async function listReceiptFiles(): Promise<string[]> {
  const dir = receiptsDir();
  const files = await readdir(dir).catch(() => []);
  return files.filter((f) => f.endsWith(".json"));
}

/**
 * Capability helpers
 */
async function getEffectivePolicy(cfg: any) {
  const zoneEff = effectiveSafetyZone(cfg);
  const zone = normalizeZone(zoneEff.effective);
  const loaded = await loadCapabilityPolicy(zensquidRoot());
  const zp = zonePolicy(loaded.policy, zone);

  return {
    zone,
    zone_source: zoneEff.source,
    policy_path: loaded.policyPath,
    project_root: loaded.projectRootResolved,
    global_denies: loaded.policy.global_denies ?? [],
    zone_allow: zp.allow,
    zone_deny: zp.deny,
    exec_allowlist: zp.exec_allowlist,
    exec_denylist: zp.exec_denylist,
    policy: loaded.policy,
    projectRootResolved: loaded.projectRootResolved
  };
}

function withKind(kind: RequestKind, base: any) {
  return {
    ...base,
    request: {
      ...(base.request ?? {}),
      kind
    }
  };
}

async function gateOrDenyTool(args: {
  cfg: any;
  action: CapabilityAction;
  reply: any;
  receiptBase: Partial<ReceiptV1>;
  zoneOverride?: "workspace" | "diagnostics" | "forge" | "godmode" | null;
}) {
  const eff = await getEffectivePolicy(args.cfg);

  // ✅ if caller provided a zone override, use it; otherwise use effective zone
  const zone = (args.zoneOverride ?? null) ?? eff.zone;

  const decision = await checkCapabilityAction({
    action: args.action,
    zone,
    policy: eff.policy,
    projectRootResolved: eff.projectRootResolved
  });

  const receipt: any = {
    ...(args.receiptBase ?? {}),
    schema: "zensquid.receipt.v1",
    tool_event: {
      zone,
      capability: decision.capability,
      allowed: decision.allowed,
      reason: decision.reason,
      matched_rule: decision.matched_rule,
      action: args.action
    }
  };

  await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

  if (!decision.allowed) {
    return args.reply.code(403).send({
      ok: false,
      error: "Denied by capability gate",
      zone,
      capability: decision.capability,
      reason: decision.reason,
      matched_rule: decision.matched_rule,
      receipt_id: (args.receiptBase as any)?.receipt_id ?? null
    });
  }

  return null;
}

/**
 * Agent text loading (SOUL + IDENTITY)
 */
async function safeReadText(p: string, maxBytes = 200_000): Promise<string> {
  try {
    const st = await stat(p);
    if (!st.isFile()) return "";
    const raw = await readFile(p, "utf-8");
    if (st.size > maxBytes) return raw.slice(0, maxBytes) + "\n…(truncated)\n";
    return raw;
  } catch {
    return "";
  }
}

/**
 * Agent profile (used by UI)
 */
app.get("/agent/profile", async () => {
  const soul = await safeReadText(soulFile());
  const identity = await safeReadText(identityFile());
  const soulBytes = Buffer.byteLength(soul, "utf-8");
  const identityBytes = Buffer.byteLength(identity, "utf-8");

  return {
    ok: true,
    agent: {
      name: "Squidley",
      program: "ZenSquid"
    },
    files: {
      soul: { path: soulFile(), bytes: soulBytes },
      identity: { path: identityFile(), bytes: identityBytes }
    }
  };
});

/**
 * Snapshot (kept here for now)
 */
app.get("/snapshot", async () => {
  const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
  const effStrict = await effectiveStrictLocal(cfg);
  const effZone = effectiveSafetyZone(cfg);

  return {
    ok: true,
    node: cfg.meta.node,
    ollama_base: cfg.providers.ollama.base_url,
    tiers: cfg.tiers.map((t: any) => ({ name: t.name, provider: t.provider, model: t.model })),
    budgets: {
      ...cfg.budgets,
      strict_local_only: effStrict.effective,
      strict_local_only_source: effStrict.source
    },
    runtime: {
      safety_zone: effZone.effective,
      safety_zone_source: effZone.source
    },
    onboarding: {
      completed: await onboardingCompleted()
    }
  };
});

/**
 * Heartbeat (hard local)
 */
app.post("/heartbeat", async (req, reply) => {
  const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);

  const receipt_id = newReceiptId();
  const started = Date.now();

  const body = (req.body ?? {}) as any;
  const prompt =
    typeof body?.prompt === "string" && body.prompt.trim().length > 0 ? body.prompt.trim() : "Return exactly: OK";

  const hbModel = process.env.ZENSQUID_HEARTBEAT_MODEL ?? (cfg as any)?.heartbeat?.model ?? "qwen2.5:7b-instruct";

  const hbActiveModel = classifyModel("ollama", hbModel);

  const messages = [
    { role: "system", content: "You are a heartbeat check. Follow user instruction precisely." },
    { role: "user", content: prompt }
  ] as const;

  try {
    const out = await ollamaChat({
      baseUrl: cfg.providers.ollama.base_url,
      model: hbModel,
      messages: [...messages]
    });

    const ms = Date.now() - started;

    const receipt: any = withKind("heartbeat", {
      schema: "zensquid.receipt.v1",
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: { input: prompt, mode: "heartbeat" },
      decision: {
        tier: "heartbeat",
        provider: "ollama",
        model: hbModel,
        escalated: false,
        escalation_reason: null,
        active_model: hbActiveModel
      },
      meta: { ms }
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.send({
      ok: true,
      output: (out as any).output,
      provider: "ollama",
      model: hbModel,
      active_model: hbActiveModel,
      receipt_id,
      ms
    });
  } catch (e: any) {
    const ms = Date.now() - started;

    const receipt: any = withKind("heartbeat", {
      schema: "zensquid.receipt.v1",
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: { input: prompt, mode: "heartbeat" },
      decision: {
        tier: "heartbeat",
        provider: "ollama",
        model: hbModel,
        escalated: false,
        escalation_reason: null,
        active_model: hbActiveModel
      },
      error: { message: String(e?.message ?? e) },
      meta: { ms }
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.code(503).send({
      ok: false,
      error: "Heartbeat failed (ollama)",
      provider: "ollama",
      model: hbModel,
      active_model: hbActiveModel,
      receipt_id,
      ms
    });
  }
});

/**
 * Chat — uses Soul/Identity/Memory (+ optional skill context)
 */
function looksInfraOrTooling(input: string): boolean {
  const s = input.toLowerCase();
  return (
    s.includes("zensquid") ||
    s.includes("squidley") ||
    s.includes("openclaw") ||
    s.includes("receipt") ||
    s.includes("receipts") ||
    s.includes("snapshot") ||
    s.includes("doctor") ||
    s.includes("sanity") ||
    s.includes("systemctl") ||
    s.includes("journalctl") ||
    s.includes("curl ") ||
    s.includes("port ") ||
    s.includes("http://") ||
    s.includes("https://") ||
    s.includes("/health") ||
    s.includes("/runtime") ||
    s.includes("/skills") ||
    s.includes("/memory")
  );
}

function looksCodey(input: string): boolean {
  const s = input.toLowerCase();
  return (
    s.includes("diff --git") ||
    s.includes("--- a/") ||
    s.includes("+++ b/") ||
    s.includes("@@ ") ||
    s.includes("stack trace") ||
    s.includes("traceback") ||
    s.includes("tsconfig") ||
    s.includes("package.json") ||
    s.includes("systemd") ||
    s.includes("dockerfile") ||
    s.includes("error ts") ||
    s.includes("cannot find module") ||
    s.includes("module not found")
  );
}

app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat", async (req, reply) => {
  const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
  const body = (req.body ?? {}) as Partial<ChatRequest> & { selected_skill?: string | null };

  const input = typeof body.input === "string" ? body.input.trim() : "";
  const selectedSkill = typeof body.selected_skill === "string" ? body.selected_skill : null;

  if (!input) return reply.code(400).send({ error: "Missing input" });

  // ✅ Server-side guard enforcement (single source of truth)
  const g = evaluateGuard(input);
  if (g.blocked) {
    const receipt_id = newReceiptId();

    // NOTE: keep provider typed to known provider(s). This is just UI metadata.
    const guardModel = g.score === 999 ? "guard:prompt-injection" : "guard:intent-score";
    const active_model = classifyModel("ollama", guardModel);

    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1" as any,
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: {
        input,
        mode: body.mode ?? "auto",
        force_tier: body.force_tier,
        reason: body.reason,
        selected_skill: selectedSkill
      },
      decision: {
        tier: "guard",
        provider: "ollama",
        model: guardModel,
        escalated: false,
        escalation_reason: null,
        active_model
      },
      guard_event: {
        blocked: true,
        reason: g.reason ?? "guard:blocked",
        score: g.score,
        signals: g.signals,
        matched_pattern: g.matched_pattern ?? null
      }
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.code(400).send({
      error: "Potential prompt injection detected",
      reason: g.reason ?? "guard:blocked",
      receipt_id,
      active_model
    });
  }

  const now = new Date();

  const { system, meta } = await buildChatSystemPrompt({
    input,
    selected_skill: selectedSkill,
    now,
    mode: body.mode ?? "auto",
    force_tier: body.force_tier ?? null,
    reason: body.reason ?? null
  });

  // ✅ Squid Notes (Memory v2) injection block + receipt metadata
  const squidNotes = await buildSquidNotesContext({
    input,
    selected_skill: selectedSkill,
    now,
    mode: body.mode ?? "auto",
    force_tier: body.force_tier ?? null,
    reason: body.reason ?? null
  });

  const systemWithSquidNotes = squidNotes?.text?.trim?.()
    ? `${system}\n\n${squidNotes.text.trim()}`
    : system;

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

  // IMPORTANT: apply runtime override into cfg BEFORE tier selection
  const effStrict = await effectiveStrictLocal(cfg);
  (cfg as any).budgets = (cfg as any).budgets ?? {};
  (cfg as any).budgets.strict_local_only = effStrict.effective;

  const decision = chooseTier(cfg, normalized);
  const receipt_id = newReceiptId();

  const strictLocalOnly = effStrict.effective;

  const decisionActiveModel = classifyModel(decision.tier.provider, decision.tier.model);

  // Helper: store richer squid_notes metadata if available
  const squid_notes_for_receipt =
    squidNotes
      ? {
          // keep backwards compatible: array of {path, bytes?}
          injected: squidNotes.injected ?? [],
          total_tokens: squidNotes.total_tokens ?? 0,
          budget_tokens: squidNotes.budget_tokens ?? 0,
          // future-proof: if buildSquidNotesContext starts returning richer fields, we keep them too
          // (harmless if undefined today)
          max_items: (squidNotes as any).max_items ?? undefined,
          dropped: (squidNotes as any).dropped ?? undefined,
          injected_items: (squidNotes as any).injected_items ?? undefined
        }
      : null;

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
        escalation_reason: `blocked: strict_local_only enabled (source=${effStrict.source})`,
        active_model: decisionActiveModel
      },
      context: meta,
      squid_notes: squid_notes_for_receipt
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.code(403).send({
      error: "Strict local mode enabled: non-local providers are blocked",
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      active_model: decisionActiveModel,
      receipt_id,
      context: meta
    });
  }

  const needsReason = !isLocalProvider(decision.tier.provider);
  const hasReason = typeof normalized.reason === "string" && normalized.reason.trim().length > 0;

  if (needsReason && (cfg as any)?.budgets?.escalation_requires_reason && !hasReason) {
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
        escalation_reason: "blocked: missing required reason for non-local escalation",
        active_model: decisionActiveModel
      },
      context: meta,
      squid_notes: squid_notes_for_receipt
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.code(400).send({
      error: "Escalation reason required for non-local providers",
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      active_model: decisionActiveModel,
      receipt_id,
      context: meta
    });
  }

  const messages = [
    { role: "system", content: systemWithSquidNotes },
    { role: "user", content: normalized.input }
  ] as const;

  // ===============================
  // OLLAMA (local)
  // ===============================
  if (decision.tier.provider === "ollama") {
    const out = await ollamaChat({
      baseUrl: cfg.providers.ollama.base_url,
      model: decision.tier.model,
      messages: [...messages]
    });

    const pr: any = out.raw ?? {};
    const tokens_in = Number(pr?.prompt_eval_count ?? 0) || 0;
    const tokens_out = Number(pr?.eval_count ?? 0) || 0;
    const tokens_total = tokens_in + tokens_out;

    const usage =
      tokens_in > 0 || tokens_out > 0
        ? {
            schema: "zensquid.usage.v1",
            tokens_in,
            tokens_out,
            tokens_total,
            cost: 0
          }
        : null;

    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1",
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
        escalation_reason: decision.escalation_reason,
        active_model: decisionActiveModel
      },
      context: meta,
      squid_notes: squid_notes_for_receipt,
      usage,
      provider_response: out.raw
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.send({
      output: out.output,
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      active_model: decisionActiveModel,
      receipt_id,
      escalated: decision.escalated,
      escalation_reason: decision.escalation_reason,
      context: meta
    });
  }

  // ===============================
  // MODELSTUDIO (DashScope OpenAI-compatible)
  // ===============================
  if (decision.tier.provider === "modelstudio") {
    const apiKey =
      process.env.DASHSCOPE_API_KEY ??
      process.env.ZENSQUID_MODELSTUDIO_API_KEY ??
      process.env.MODELSTUDIO_API_KEY ??
      "";

    const baseUrl =
      (cfg as any)?.providers?.modelstudio?.base_url ??
      process.env.ZENSQUID_MODELSTUDIO_BASE_URL ??
      process.env.MODELSTUDIO_BASE_URL ??
      "https://dashscope-us.aliyuncs.com/compatible-mode/v1";

    if (!apiKey || apiKey.trim().length < 10) {
      const receipt: any = withKind("chat", {
        schema: "zensquid.receipt.v1",
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
          escalation_reason: "blocked: missing DASHSCOPE_API_KEY",
          active_model: decisionActiveModel
        },
        context: meta,
        squid_notes: squid_notes_for_receipt
      });

      await writeReceipt(zensquidRoot(), receipt);

      return reply.code(400).send({
        error: "Missing DASHSCOPE_API_KEY for modelstudio provider",
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        active_model: decisionActiveModel,
        receipt_id,
        context: meta
      });
    }

    const out = await modelstudioChat({
      baseUrl,
      model: decision.tier.model,
      messages: [...messages],
      apiKey
    });

    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1",
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
        escalation_reason: decision.escalation_reason,
        active_model: decisionActiveModel
      },
      context: meta,
      squid_notes: squid_notes_for_receipt,
      provider_response: out.raw
    });

    await writeReceipt(zensquidRoot(), receipt);

    return reply.send({
      output: out.content,
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      active_model: decisionActiveModel,
      receipt_id,
      escalated: decision.escalated,
      escalation_reason: decision.escalation_reason,
      context: meta
    });
  }

  // ===============================
  // OPENAI (lazy import)
  // ===============================
  if (decision.tier.provider === "openai") {
    const { openaiChat } = await import("@zensquid/provider-openai");

    const apiKey = process.env.ZENSQUID_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? undefined;
    const apiKeyFile = process.env.ZENSQUID_OPENAI_KEY_FILE ?? process.env.OPENAI_API_KEY_FILE ?? undefined;

    const out = await openaiChat({
      model: decision.tier.model,
      messages: [...messages],
      apiKey,
      apiKeyFile
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
        escalation_reason: decision.escalation_reason,
        active_model: decisionActiveModel
      },
      context: meta,
      squid_notes: squid_notes_for_receipt,
      provider_response: (out as any).raw
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.send({
      output: (out as any).output,
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      active_model: decisionActiveModel,
      receipt_id,
      escalated: decision.escalated,
      escalation_reason: decision.escalation_reason,
      context: meta
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
      escalation_reason: "provider not implemented yet",
      active_model: decisionActiveModel
    },
    context: meta,
    squid_notes: squid_notes_for_receipt
  });

  await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

  return reply.code(501).send({
    error: "Provider not implemented yet",
    tier: decision.tier.name,
    provider: decision.tier.provider,
    model: decision.tier.model,
    active_model: decisionActiveModel,
    receipt_id,
    context: meta
  });
});

const port = Number(process.env.ZENSQUID_PORT ?? "18790");

/**
 * Extracted route modules
 */
await registerSkillsRoutes(app, { zensquidRoot });

await registerToolsRoutes(app, {
  adminTokenOk,
  gateOrDenyTool,
  safeReadText
});

await registerReceiptsRoutes(app, {
  zensquidRoot,
  receiptsDir,
  preview,
  adminTokenOk
});

await registerDoctorRoutes(app, {
  receiptsDir,
  effectiveStrictLocal: async (cfg: any) => effectiveStrictLocal(cfg),
  effectiveSafetyZone
});

await registerRuntimeRoutes(app, {
  adminTokenOk,
  loadState: runtimePaths.loadRuntimeState,
  saveState: runtimePaths.saveRuntimeState,
  getState: getRuntimeState,
  setState: setRuntimeState,
  effectiveStrictLocal: async (cfg: any) => effectiveStrictLocal(cfg),
  effectiveSafetyZone,
  getEffectivePolicy,
  getOnboarding: async () => {
    try {
      const p = path.resolve(runtimePaths.dataDir(), "onboarding.json");
      const raw = await readFile(p, "utf-8");
      const j = JSON.parse(raw) as any;

      return { completed: Boolean(j?.completed) };
    } catch {
      return { completed: false };
    }
  }
});

await registerCapabilitiesRoutes(app, {
  adminTokenOk,
  zensquidRoot,
  loadConfig: async () => loadConfig(process.env.ZENSQUID_CONFIG),
  getEffectivePolicy
});

await registerMemoryRoutes(app, {
  zensquidRoot,
  adminTokenOk,
  ensureMemoryRoot,
  normalizeRelPath,
  memoryAbs,
  memoryRoot,
  safeReadText,
  gateOrDenyTool
});

await registerTokenMonitorRoutes(app, {
  receiptsDir
});

// ✅ New deterministic guard preflight for UI wiring
await registerGuardRoutes(app, {
  zensquidRoot
});

app.get("/debug/routes/list", async (req, reply) => {
  if (!adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

  const out = app
    .printRoutes({ commonPrefix: false })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return reply.type("text/plain").send(out.join("\n") + "\n");
});

await registerOnboardingRoutes(app, {
  adminTokenOk,
  dataDir: () => runtimePaths.dataDir(),
  applyPresetByName: async (name, opts) => {
    try {
      const req = opts?.req;

      const headers: Record<string, string> = {
        "content-type": "application/json"
      };

      const admin = req?.headers?.["x-zensquid-admin-token"];
      if (admin) headers["x-zensquid-admin-token"] = String(admin);

      const gpass = req?.headers?.["x-zensquid-godmode-password"];
      if (gpass) headers["x-zensquid-godmode-password"] = String(gpass);

      const confirm =
        (req?.body as any)?.confirm ??
        (req?.headers?.["x-zensquid-confirm"] as string | undefined) ??
        null;

      const payload: any = { name };
      if (confirm) payload.confirm = confirm;

      const res = await app.inject({
        method: "POST",
        url: "/runtime/preset",
        headers,
        payload
      });

      let json: any = null;
      try {
        // @ts-ignore
        json = typeof (res as any).json === "function" ? (res as any).json() : JSON.parse(res.payload);
      } catch {
        json = null;
      }

      if (json?.ok) {
        return { ok: true, preset: json.preset, runtime: json.runtime };
      }

      return {
        ok: false,
        error: json?.error ?? `runtime preset failed (status=${res.statusCode})`
      };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Failed to apply preset" };
    }
  }
});

// --- Bind / exposure guardrails -------------------------------------------
// Philosophy:
// - Remote-accessible is REQUIRED (local-first models, not local-only service).
// - BUT: do not accidentally expose to the public internet.
// - Default to LAN/Tailscale-friendly binds, while keeping an explicit escape hatch.

const bindHostRaw = String(process.env.ZENSQUID_BIND_HOST ?? process.env.ZENSQUID_HOST ?? "0.0.0.0").trim();

const allowPublicBind = String(process.env.ZENSQUID_ALLOW_PUBLIC_BIND ?? "false").trim().toLowerCase() === "true";

// "0.0.0.0" and "::" can be public depending on firewall/router. We allow them,
// but require UFW (or equivalent) to restrict exposure. If the user *wants* to
// intentionally expose to the public internet, they must set ALLOW_PUBLIC_BIND=true.
const isWildcard = bindHostRaw === "0.0.0.0" || bindHostRaw === "::";
const isLocalhost = bindHostRaw === "127.0.0.1" || bindHostRaw === "localhost" || bindHostRaw === "::1";

// If someone explicitly tries to bind to a non-private address, require explicit opt-in.
function isPrivateishHost(h: string) {
  // quick/cheap checks (good enough for guardrails)
  return (
    h.startsWith("192.168.") ||
    h.startsWith("10.") ||
    h.startsWith("172.16.") ||
    h.startsWith("172.17.") ||
    h.startsWith("172.18.") ||
    h.startsWith("172.19.") ||
    h.startsWith("172.2") || // covers 172.20-172.29
    h.startsWith("172.30.") ||
    h.startsWith("172.31.") ||
    h.startsWith("100.") // tailscale CGNAT range begins 100.64.0.0/10; this is a loose check
  );
}

// If they bind to a specific host that doesn't look private, require explicit public opt-in.
if (!isLocalhost && !isWildcard && !isPrivateishHost(bindHostRaw) && !allowPublicBind) {
  throw new Error(
    `Refusing to bind host="${bindHostRaw}" (looks public). ` +
      `Set ZENSQUID_ALLOW_PUBLIC_BIND=true if you REALLY intend internet exposure.`
  );
}

const host = bindHostRaw;
await app.listen({ port, host });