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

import { extractToolProposal, isApproval, isDenial, isPlanProposal, extractPlanGoal } from "./chat/toolDetector.js";
import { storePending, getPending, clearPending, hasPending } from "./chat/pendingTools.js";
import { storePendingPlan, getPendingPlan, clearPendingPlan, hasPendingPlan } from "./chat/pendingPlans.js";
import { storePendingAgent, getPendingAgent, clearPendingAgent, hasPendingAgent } from "./chat/pendingAgents.js";
import { runAgent } from "./chat/agentRunner.js";
import { extractAgentProposal, isAgentProposal } from "./chat/toolDetector.js";
import { runTool } from "./tools/runner.js";
import { writeAnalysisThread } from "./chat/memoryWriter.js";

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
import { addTurn, getHistory } from "./chat/sessionHistory.js";
import { checkDailyBudget, getDailySpend } from "./chat/dailyBudget.js";
import { startScheduler, stopScheduler, registerSchedulerRoutes, getPendingBriefings, clearPendingBriefings } from "./scheduler.js";
import { startTelegramBot, stopTelegramBot, registerTelegramRoutes, sendTelegramMessage } from "./http/routes/telegram.js";

type RequestKind = "chat" | "heartbeat" | "tool" | "system";

const app = Fastify({ logger: true });
await app.register(corsPkg, { origin: true });

app.get("/health", async () => ({ ok: true, name: "Squidley API" }));

await registerAutonomyRoutes(app, {
  zensquidRoot,
  adminTokenOk,
  allowlist: ["web.build", "web.pw", "git.status", "git.diff", "git.log", "rg.search", "diag.sleep"]
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

  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

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

async function effectiveStrictLocal(cfg: any): Promise<{ effective: boolean; source: StrictSource }> {
  const autoRelax =
    String(process.env.ZENSQUID_AUTO_DISABLE_STRICT_AFTER_ONBOARDING ?? "true").trim().toLowerCase() === "true";

  const completed = await onboardingCompleted();

  if (typeof runtimeState.strict_local_only === "boolean") {
    if (autoRelax && completed && runtimeState.strict_local_only === true) {
      return { effective: false, source: "runtime_onboarding_relaxed" };
    }
    return { effective: runtimeState.strict_local_only, source: "runtime" };
  }

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

app.get("/agent/profile", async () => {
  const soul = await safeReadText(soulFile());
  const identity = await safeReadText(identityFile());
  const soulBytes = Buffer.byteLength(soul, "utf-8");
  const identityBytes = Buffer.byteLength(identity, "utf-8");

  return {
    ok: true,
    agent: { name: "Squidley", program: "ZenSquid" },
    files: {
      soul: { path: soulFile(), bytes: soulBytes },
      identity: { path: identityFile(), bytes: identityBytes }
    }
  };
});

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

// ── Heartbeat ─────────────────────────────────────────────────────────────────

app.post("/heartbeat", async (req, reply) => {
  const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);

  const receipt_id = newReceiptId();
  const started = Date.now();

  const body = (req.body ?? {}) as any;
  const prompt =
    typeof body?.prompt === "string" && body.prompt.trim().length > 0
      ? body.prompt.trim()
      : "Return exactly: OK";

  const hbModel =
    process.env.ZENSQUID_HEARTBEAT_MODEL ?? (cfg as any)?.heartbeat?.model ?? "qwen2.5:7b-instruct";

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

// ── Chat ──────────────────────────────────────────────────────────────────────

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
  const session_id = typeof (body as any).session_id === "string" ? (body as any).session_id.trim() : null;

  if (!input) return reply.code(400).send({ error: "Missing input" });

  // ── Scheduled briefings ───────────────────────────────────────────────────
  // Surface any agent runs that happened while the user was away
  const briefings = getPendingBriefings();
  if (briefings.length > 0) {
    clearPendingBriefings();
    const briefingText = briefings.map((b) => {
      const status = b.fail > 0 ? "⚠️ partial" : "✅";
      return `${status} **${b.agent}** ran at ${new Date(b.ran_at).toLocaleTimeString()} — ${b.pass}/${b.steps_ran} steps passed`;
    }).join("\n");
    return reply.send({
      response: `🦑 While you were away, I ran ${briefings.length} scheduled task(s):\n\n${briefingText}\n\nWant me to summarize the results?`,
      tier: "local",
      session_id,
      briefings,
    });
  }

  // ── Agent approval loop ──────────────────────────────────────────────────────
  if (session_id && hasPendingAgent(session_id)) {
    const pendingAgent = getPendingAgent(session_id)!;

    if (isDenial(input)) {
      clearPendingAgent(session_id);
      return reply.send({
        output: "Got it — agent run cancelled. What would you like to do instead?",
        session_id,
      });
    }

    if (isApproval(input)) {
      clearPendingAgent(session_id);
      const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
      try {
        const result = await runAgent({
          agentName: pendingAgent.agent_name,
          focus: pendingAgent.focus,
          app,
          adminToken,
        });

        // Read the thread it wrote and format as readable output
        const lines: string[] = [];
        lines.push(`🤖 Agent: ${result.agent}`);
        lines.push(`${result.pass}/${result.steps_ran} steps passed${result.fail > 0 ? ` (${result.fail} failed)` : ""}`);
        lines.push("");
        if (result.summary) {
          // Show the key findings — skip the header lines
          const summaryLines = result.summary.split("\n").filter((l: string) =>
            !l.startsWith("Agent:") && !l.startsWith("Focus:") && !l.startsWith("Ran:")
          );
          lines.push(...summaryLines.slice(0, 30));
        }
        if (result.thread_id) {
          lines.push("");
          lines.push(`Results written to: memory/threads/${result.thread_id}.json`);
        }

        return reply.send({
          output: lines.join("\n").trim(),
          session_id,
          agent_executed: result.agent,
          agent_ok: result.ok,
          thread_id: result.thread_id,
        });
      } catch (e: any) {
        return reply.send({
          output: `Agent run failed: ${String(e?.message ?? e)}`,
          session_id,
          agent_ok: false,
        });
      }
    }
  }

  // ── Plan approval loop ───────────────────────────────────────────────────────
  if (session_id && hasPendingPlan(session_id)) {
    const pendingPlan = getPendingPlan(session_id)!;

    if (isDenial(input)) {
      clearPendingPlan(session_id);
      return reply.send({
        output: "Got it — plan cancelled. What would you like to do instead?",
        session_id,
        pending_plan: null,
      });
    }

    if (isApproval(input)) {
      clearPendingPlan(session_id);
      const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
      try {
        const approveResp = await app.inject({
          method: "POST",
          url: "/autonomy/approve",
          headers: { "content-type": "application/json", "x-zensquid-admin-token": adminToken },
          payload: { plan_id: pendingPlan.plan_id, stop_on_fail: true },
        });
        const approveJson = typeof (approveResp as any).json === "function"
          ? (approveResp as any).json()
          : JSON.parse(approveResp.payload);

        const summary = approveJson?.summary;
        const results: any[] = approveJson?.results ?? [];

        // Format results as readable output
        const lines: string[] = [];
        lines.push(`Plan: ${pendingPlan.goal}`);
        lines.push("");
        for (const r of results) {
          const icon = r.ok ? "✓" : "✗";
          const out = r.output?.stdout ? r.output.stdout.slice(0, 400).trim() : "";
          lines.push(`${icon} ${r.tool}`);
          if (out) lines.push(out);
          if (!r.ok && r.error) lines.push(`  Error: ${r.error}`);
          lines.push("");
        }
        if (summary) {
          lines.push(`${summary.pass}/${summary.steps_total} steps passed${summary.halted ? " (halted on failure)" : ""}.`);
        }

        return reply.send({
          output: lines.join("\n").trim(),
          session_id,
          plan_executed: pendingPlan.plan_id,
          plan_ok: approveJson?.ok ?? false,
        });
      } catch (e: any) {
        return reply.send({
          output: `Plan execution failed: ${String(e?.message ?? e)}`,
          session_id,
          plan_ok: false,
        });
      }
    }
  }

  // ── Tool approval loop ────────────────────────────────────────────────────
  if (session_id && hasPending(session_id)) {
    const pending = getPending(session_id)!;

    if (isDenial(input)) {
      clearPending(session_id);
      return reply.send({
        output: "Got it — cancelled. What else can I help with?",
        session_id,
        tool_cancelled: true,
      });
    }

    if (isApproval(input)) {
      clearPending(session_id);
      let toolOutput = "";
      let toolOk = false;
      try {
        const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim() || undefined;

        // Convert object args to array for subprocess tools (rg.search, git.*, etc.)
        // JS-handled tools (web.search, fs.read, etc.) receive the object directly.
        const rawArgs = pending.proposal.args;
        const jsTools = new Set(["web.search", "fs.read", "fs.write", "proc.exec", "systemctl.user", "diag.sleep", "browser.visit", "browser.extract", "browser.search", "browser.screenshot"]);
        let finalArgs: string[] | Record<string, string>;
        if (jsTools.has(pending.proposal.tool_id)) {
          finalArgs = rawArgs;
        } else {
          const toolId = pending.proposal.tool_id;

          if (toolId === "rg.search") {
            const query = rawArgs.query || "TODO";
            finalArgs = [query, "."];
          } else if (toolId === "git.diff") {
            const parts: string[] = [];
            if (rawArgs.range) parts.push(rawArgs.range);
            if (rawArgs.file) parts.push("--", rawArgs.file);
            finalArgs = parts; // empty = unstaged diff, which is useful default
          } else if (toolId === "git.log") {
            finalArgs = rawArgs.count ? ["-n", rawArgs.count] : [];
          } else if (toolId === "fs.write") {
            // args: { path: "skills/foo/skill.md", content: "..." }
            const p = rawArgs.path ?? "";
            const content = rawArgs.content ?? "";
            finalArgs = [p, content];
          } else if (toolId === "fs.read") {
            // args: { path: "skills/foo/skill.md" }
            finalArgs = [rawArgs.path ?? ""];
          } else {
            finalArgs = Object.values(rawArgs).filter(Boolean) as string[];
          }
        }

        const result = await runTool({
          workspace: "squidley",
          tool_id: pending.proposal.tool_id,
          args: finalArgs,
          admin_token: adminToken,
        });
        toolOutput = result.stdout || "(no output)";
        toolOk = result.ok;
      } catch (e: any) {
        toolOutput = `Error: ${String(e?.message ?? "tool failed")}`;
        toolOk = false;
      }
      // For git/rg tools, send output through the model for analysis
      const analysisTools = new Set(["git.status", "git.diff", "git.log", "rg.search"]);
      if (toolOk && analysisTools.has(pending.proposal.tool_id)) {
        // Fall through to normal chat with tool output injected as context
        const toolContext = `[Tool: ${pending.proposal.tool_id} output]\n${toolOutput}\n[/Tool output]\n\nAnalyze the above output as my building partner. Be direct and concrete.`;
        // Re-enter chat flow with tool output as the input
        const cfg2 = await loadConfig(process.env.ZENSQUID_CONFIG);
        const { listTools: lt2 } = await import("./tools/allowlist.js");
        const toolList2 = lt2(false);
        const { system: system2 } = await buildChatSystemPrompt({
          input: toolContext,
          selected_skill: null,
          now: new Date(),
          mode: "auto",
          force_tier: null,
          reason: null,
          available_tools: toolList2.map((t) => t.id),
          tools: toolList2,
        });
        const analysisMessages = [
          { role: "system" as const, content: system2 },
          { role: "user" as const, content: toolContext },
        ];
        const analysisOut = await ollamaChat({
          baseUrl: cfg2.providers.ollama.base_url,
          model: (chooseTier(cfg2, { input: toolContext, mode: "auto" })).tier.model,
          messages: analysisMessages,
        });

        // ✅ Auto-write thread summary from analysis — best effort, never blocks response
        void writeAnalysisThread({
          toolId: pending.proposal.tool_id,
          analysisText: analysisOut.output,
          rawToolOutput: toolOutput,
        });

        // ✅ Check if analysis response contains a new proposal (e.g. skill write offer)
        const analysisProposal = extractToolProposal(analysisOut.output);
        let analysisPendingTool: string | null = null;
        if (analysisProposal) {
          // For fs.write proposals, inject the real analysis content as the skill body
          if (analysisProposal.tool_id === "fs.write" && analysisProposal.args.path) {
            analysisProposal.args.content = [
              `# Skill: ${String(analysisProposal.args.path).split("/").slice(-2, -1)[0] ?? "git-skill"}`,
              "",
              "## Purpose",
              `Captured from ${pending.proposal.tool_id} analysis on ${new Date().toISOString().slice(0, 10)}.`,
              "",
              "## Analysis",
              analysisOut.output.replace(/#{1,3}\s*/g, "").replace(/\*{1,2}/g, "").trim(),
              "",
              "## Source",
              `- tool: ${pending.proposal.tool_id}`,
              `- generated: ${new Date().toISOString()}`,
            ].join("\n");
          }
          await storePending(session_id, analysisProposal, analysisOut.output);
          analysisPendingTool = analysisProposal.tool_id;
        }

        return reply.send({
          output: analysisOut.output,
          session_id,
          tool_executed: pending.proposal.tool_id,
          tool_ok: toolOk,
          raw_tool_output: toolOutput,
          pending_tool: analysisPendingTool,
        });
      }

      return reply.send({
        output: toolOk
          ? `✓ ${pending.proposal.tool_id} completed:\n\n${toolOutput}`
          : `✗ ${pending.proposal.tool_id} failed:\n\n${toolOutput}`,
        session_id,
        tool_executed: pending.proposal.tool_id,
        tool_ok: toolOk,
      });
    }
    // Not approval or denial — fall through to normal chat
    clearPending(session_id);
  }
  // ── End tool approval loop ────────────────────────────────────────────────

  // ✅ Server-side guard enforcement
  const g = evaluateGuard(input);
  if (g.blocked) {
    const receipt_id = newReceiptId();
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

  // ✅ Load tool catalog so Squidley knows what tools she can propose
  const { listTools } = await import("./tools/allowlist.js");
  const toolList = listTools(false);

  const { system, meta } = await buildChatSystemPrompt({
    input,
    selected_skill: selectedSkill,
    now,
    mode: body.mode ?? "auto",
    force_tier: body.force_tier ?? null,
    reason: body.reason ?? null,
    available_tools: toolList.map((t) => t.id),
    tools: toolList,
  });

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



  const effStrict = await effectiveStrictLocal(cfg);
  (cfg as any).budgets = (cfg as any).budgets ?? {};
  (cfg as any).budgets.strict_local_only = effStrict.effective;

  const decision = chooseTier(cfg, normalized);
  const receipt_id = newReceiptId();
  const decisionActiveModel = classifyModel(decision.tier.provider, decision.tier.model);

  const squid_notes_for_receipt = squidNotes
    ? {
        injected: squidNotes.injected ?? [],
        total_tokens: squidNotes.total_tokens ?? 0,
        budget_tokens: squidNotes.budget_tokens ?? 0,
        max_items: (squidNotes as any).max_items ?? undefined,
        dropped: (squidNotes as any).dropped ?? undefined,
        injected_items: (squidNotes as any).injected_items ?? undefined
      }
    : null;

  const strictLocalOnly = (await effectiveStrictLocal(cfg)).effective;
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
        escalation_reason: "blocked: strict_local_only enabled",
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

  // ── Daily budget + nightly lockout (scheduled runs only) ────────────────
  if (decision.tier.provider !== "ollama") {
    const triggeredBy = (body as any)?.triggered_by ?? "";
    const isScheduledRun = String(triggeredBy).startsWith("scheduler:");
    if (isScheduledRun) {
      const budgetCheck = await checkDailyBudget(cfg, triggeredBy);
      if (!budgetCheck.allowed) {
        console.warn("[budget]", budgetCheck.reason);
        decision.tier = (cfg.tiers ?? []).find((t: any) => t.name === "local") ?? decision.tier;
        decision.escalated = false;
      }
    }
  }

  const needsReason = ["big_brain", "plan", "build"].includes(decision.tier.name);
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

  // ── Conversation history ─────────────────────────────────────────────────
  const history = session_id ? getHistory(session_id) : [];
  if (session_id) addTurn(session_id, "user", normalized.input);
  const messages = [
    { role: "system", content: systemWithSquidNotes },
    ...history,
    { role: "user", content: normalized.input }
  ] as const;

  // ── Ollama (local) ──────────────────────────────────────────────────────────
  if (decision.tier.provider === "ollama") {
    const out = await ollamaChat({
      baseUrl: cfg.providers.ollama.base_url,
      model: decision.tier.model,
      messages: [...messages]
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

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    const ollamaProposal = extractToolProposal(out.output);
    const ollamaSessionId = session_id ?? crypto.randomUUID();
    if (ollamaProposal) {
      storePending(ollamaSessionId, ollamaProposal, out.output);
    }

    // ✅ Plan proposal detection — if Squidley proposes a multi-step plan, generate it
    let pendingPlanId: string | null = null;
    if (!ollamaProposal && isPlanProposal(out.output)) {
      try {
        const planGoal = extractPlanGoal(out.output);
        const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
        const planResp = await app.inject({
          method: "POST",
          url: "/autonomy/plan",
          headers: { "content-type": "application/json", "x-zensquid-admin-token": adminToken },
          payload: { goal: planGoal, ollama_url: cfg.providers.ollama.base_url, model: decision.tier.model },
        });
        const planJson = typeof (planResp as any).json === "function" ? (planResp as any).json() : JSON.parse(planResp.payload);
        if (planJson?.ok && planJson?.plan_id) {
          storePendingPlan(ollamaSessionId, planJson.plan_id, planGoal, planJson.steps);
          pendingPlanId = planJson.plan_id;
        }
      } catch (e) {
        // best effort — never block response
      }
    }

    // ✅ Agent proposal detection
    let pendingAgentName: string | null = null;
    if (!ollamaProposal && !pendingPlanId && isAgentProposal(out.output)) {
      const agentProposal = extractAgentProposal(out.output);
      if (agentProposal) {
        storePendingAgent(ollamaSessionId, agentProposal.agent_name, agentProposal.focus);
        pendingAgentName = agentProposal.agent_name;
      }
    }

    return reply.send({
      output: out.output,
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      active_model: decisionActiveModel,
      receipt_id,
      escalated: decision.escalated,
      escalation_reason: decision.escalation_reason,
      context: meta,
      session_id: ollamaSessionId,
      pending_tool: ollamaProposal ? ollamaProposal.tool_id : null,
      pending_plan: pendingPlanId,
      pending_agent: pendingAgentName,
    });
  }

  // ── ModelStudio ─────────────────────────────────────────────────────────────
  if (decision.tier.provider === "modelstudio") {
    const provCfg = (cfg as any)?.providers?.modelstudio ?? {};
    const envKeyName = String(provCfg?.env_key ?? "").trim() || "DASHSCOPE_API_KEY";

    const apiKey =
      (process.env[envKeyName] ?? "").trim() ||
      (process.env.DASHSCOPE_API_KEY ?? "").trim() ||
      (process.env.ZENSQUID_MODELSTUDIO_API_KEY ?? "").trim() ||
      (process.env.MODELSTUDIO_API_KEY ?? "").trim();

    const baseUrl =
      String(provCfg?.base_url ?? "").trim() ||
      String(process.env.ZENSQUID_MODELSTUDIO_BASE_URL ?? "").trim() ||
      String(process.env.MODELSTUDIO_BASE_URL ?? "").trim() ||
      "https://dashscope-us.aliyuncs.com/compatible-mode/v1";

    if (!apiKey || apiKey.length < 10) {
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
          escalation_reason: `blocked: missing ${envKeyName}`,
          active_model: decisionActiveModel
        },
        context: meta,
        squid_notes: squid_notes_for_receipt
      });

      await writeReceipt(zensquidRoot(), receipt);

      return reply.code(400).send({
        error: `Missing ${envKeyName} for modelstudio provider`,
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

    const msProposal = extractToolProposal(out.content);
    const msSessionId = session_id ?? crypto.randomUUID();
    if (msProposal) {
      storePending(msSessionId, msProposal, out.content);
    }

    return reply.send({
      output: out.content,
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      active_model: decisionActiveModel,
      receipt_id,
      escalated: decision.escalated,
      escalation_reason: decision.escalation_reason,
      context: meta,
      session_id: msSessionId,
      pending_tool: msProposal ? msProposal.tool_id : null,
    });
  }

  // ── OpenAI ──────────────────────────────────────────────────────────────────
  if (decision.tier.provider === "openai") {
    const provCfg = (cfg as any)?.providers?.openai ?? {};
    const envKeyName = String(provCfg?.env_key ?? "").trim() || "OPENAI_API_KEY";

    const apiKey = (process.env[envKeyName] ?? "").trim() || (process.env.OPENAI_API_KEY ?? "").trim();
    const apiKeyFile =
      String(process.env.OPENAI_API_KEY_FILE ?? "").trim() ||
      String(process.env.ZENSQUID_OPENAI_KEY_FILE ?? "").trim() ||
      "";

    if ((!apiKey || apiKey.length < 10) && !apiKeyFile) {
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
          escalation_reason: `blocked: missing ${envKeyName} and OPENAI_API_KEY_FILE`,
          active_model: decisionActiveModel
        },
        context: meta,
        squid_notes: squid_notes_for_receipt
      });

      await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

      return reply.code(400).send({
        error: `Missing ${envKeyName} for openai provider`,
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        active_model: decisionActiveModel,
        receipt_id,
        context: meta
      });
    }

    try {
      const { openaiChat } = await import("@zensquid/provider-openai");

      const out = await openaiChat({
        model: decision.tier.model,
        messages: [...messages],
        apiKey: apiKey || undefined,
        apiKeyFile: apiKeyFile || undefined
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
        provider_response: (out as any).raw ?? null
      });

      await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

      const oaiProposal = extractToolProposal(out.output);
      const oaiSessionId = session_id ?? crypto.randomUUID();
      if (oaiProposal) {
        storePending(oaiSessionId, oaiProposal, out.output);
      }

      return reply.send({
        output: out.output,
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        active_model: decisionActiveModel,
        receipt_id,
        escalated: decision.escalated,
        escalation_reason: decision.escalation_reason,
        context: meta,
        session_id: oaiSessionId,
        pending_tool: oaiProposal ? oaiProposal.tool_id : null,
      });
    } catch (e: any) {
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
          escalation_reason: "error: openai provider call failed",
          active_model: decisionActiveModel
        },
        context: meta,
        squid_notes: squid_notes_for_receipt,
        error: {
          message: String(e?.message ?? e),
          name: e?.name ?? null,
          code: e?.code ?? null,
          cause: e?.cause ? String(e.cause) : null
        }
      });

      await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

      return reply.code(502).send({
        ok: false,
        error: "OpenAI request failed",
        detail: String(e?.message ?? e),
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        active_model: decisionActiveModel,
        receipt_id
      });
    }
  }

  // ── Provider not implemented fallback ─────────────────────────────────────
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

// ── Route modules ─────────────────────────────────────────────────────────────

const port = Number(process.env.ZENSQUID_PORT ?? "18790");

await registerSkillsRoutes(app, { zensquidRoot });
await registerToolsRoutes(app);
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

// ── Bind / exposure guardrails ────────────────────────────────────────────────

const bindHostRaw = String(process.env.ZENSQUID_BIND_HOST ?? process.env.ZENSQUID_HOST ?? "0.0.0.0").trim();
const allowPublicBind = String(process.env.ZENSQUID_ALLOW_PUBLIC_BIND ?? "false").trim().toLowerCase() === "true";
const isWildcard = bindHostRaw === "0.0.0.0" || bindHostRaw === "::";
const isLocalhost = bindHostRaw === "127.0.0.1" || bindHostRaw === "localhost" || bindHostRaw === "::1";

function isPrivateishHost(h: string) {
  return (
    h.startsWith("192.168.") ||
    h.startsWith("10.") ||
    h.startsWith("172.16.") ||
    h.startsWith("172.17.") ||
    h.startsWith("172.18.") ||
    h.startsWith("172.19.") ||
    h.startsWith("172.2") ||
    h.startsWith("172.30.") ||
    h.startsWith("172.31.") ||
    h.startsWith("100.")
  );
}

if (!isLocalhost && !isWildcard && !isPrivateishHost(bindHostRaw) && !allowPublicBind) {
  throw new Error(
    `Refusing to bind host="${bindHostRaw}" (looks public). ` +
      `Set ZENSQUID_ALLOW_PUBLIC_BIND=true if you REALLY intend internet exposure.`
  );
}

const host = bindHostRaw;
// Register routes (must be before listen)
await registerSchedulerRoutes(app);
await registerTelegramRoutes(app);
await app.listen({ port, host });

// Start background services
await startScheduler(app);
await startTelegramBot(app);

// Graceful shutdown
const shutdown = async () => {
  stopScheduler();
  stopTelegramBot();
  await app.close();
  process.exit(0);
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
