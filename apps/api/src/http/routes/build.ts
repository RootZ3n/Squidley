// apps/api/src/http/routes/build.ts
// Tenticode Pipeline Engine v2
// - Model-agnostic: each stage resolves tier from config with fallback chain
// - Anchor-based patches: no fragile old_str matching on large files
// - Structured objects flow between stages, models just fill templates

import type { FastifyInstance } from "fastify";
import { loadConfig, newReceiptId, writeReceipt, type ReceiptV1 } from "@zensquid/core";
import { ollamaChat } from "@zensquid/provider-ollama";
import { modelstudioChat } from "@zensquid/provider-modelstudio";
import { runTool } from "../../tools/runner.js";
import crypto from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StageStatus = "pending" | "running" | "ok" | "fail" | "skipped";

export type StageResult = {
  stage: string;
  status: StageStatus;
  model?: string;
  output?: string;
  error?: string;
  receipt_id?: string;
  started_at: string;
  finished_at?: string;
};

export type RepoEvidence = {
  tree?: string;
  search_hits?: string;
};

export type BuildPatch = {
  task_id: string;
  file: string;
  // anchor-based: find this function/line and insert after/before/replace
  anchor?: string;
  anchor_position?: "after" | "before" | "replace_line";
  // fallback exact match (optional, for small files)
  old_str?: string;
  new_str: string;
  reason: string;
  is_new_file?: boolean;
};

export type BuildTask = {
  id: string;
  description: string;
  target_files: string[];
  priority: number;
  patch?: BuildPatch;
};

export type BuildPlan = {
  goal: string;
  tasks: BuildTask[];
  approach: string;
  risks: string[];
};

export type ReviewIssue = {
  severity: "critical" | "major" | "minor";
  file?: string;
  description: string;
};

export type ReviewReport = {
  passed: boolean;
  issues: ReviewIssue[];
  suggestions: string[];
  confidence: number;
};

export type VerifyResult = {
  passed: boolean;
  lint_output?: string;
  errors: string[];
};

export type BuildRun = {
  run_id: string;
  goal: string;
  created_at: string;
  updated_at: string;
  stage: string;
  stages: StageResult[];
  evidence?: RepoEvidence;
  plan?: BuildPlan;
  patches?: BuildPatch[];
  review?: ReviewReport;
  verify?: VerifyResult;
  applied?: boolean;
  repair_count: number;
  max_repairs: number;
};

// ── In-memory store ───────────────────────────────────────────────────────────

const runs = new Map<string, BuildRun>();

function getOrFail(run_id: string): BuildRun {
  const run = runs.get(run_id);
  if (!run) throw new Error(`Run not found: ${run_id}`);
  return run;
}

function pushStage(run: BuildRun, result: StageResult) {
  const existing = run.stages.findIndex(s => s.stage === result.stage);
  if (existing >= 0) run.stages[existing] = result;
  else run.stages.push(result);
  run.stage = result.stage;
  run.updated_at = new Date().toISOString();
}

async function writeStageReceipt(root: string, run: BuildRun, stage: StageResult, node: string): Promise<string> {
  const receipt_id = newReceiptId();
  const receipt: any = {
    schema: "zensquid.receipt.v1",
    receipt_id,
    created_at: stage.started_at,
    node,
    request: { input: `[build:${stage.stage}] ${run.goal}`, kind: "tool" },
    decision: { tier: "build", provider: "pipeline", model: stage.model ?? "pipeline", escalated: false, escalation_reason: null },
    build_event: { run_id: run.run_id, stage: stage.stage, status: stage.status, error: stage.error ?? null }
  };
  await writeReceipt(root, receipt as ReceiptV1);
  return receipt_id;
}

// ── Model-agnostic tier resolver ──────────────────────────────────────────────

type TierInfo = { provider: string; model: string; name: string };

function resolveTier(cfg: any, tierName: string, fallbackName?: string): TierInfo {
  const tiers: any[] = cfg.tiers ?? [];
  const find = (name: string) => tiers.find((t: any) =>
    t.name.toLowerCase() === name.toLowerCase()
  );
  const tier = find(tierName) ?? (fallbackName ? find(fallbackName) : null) ?? tiers[0];
  if (!tier) throw new Error(`No tier found: ${tierName}`);
  return { provider: tier.provider, model: tier.model, name: tier.name };
}

function getApiKey(cfg: any, provider: string): string {
  const provCfg = cfg.providers?.[provider] ?? {};
  const envKey = String(provCfg.env_key ?? "").trim();
  if (envKey) return (process.env[envKey] ?? "").trim();
  // fallback common names
  if (provider === "anthropic") return (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (provider === "modelstudio") return (process.env.DASHSCOPE_API_KEY ?? "").trim();
  if (provider === "openai") return (process.env.OPENAI_API_KEY ?? "").trim();
  return "";
}

async function callTier(cfg: any, tierName: string, fallbackName: string, messages: { role: string; content: string }[], system?: string, maxTokens?: number): Promise<string> {
  const tier = resolveTier(cfg, tierName, fallbackName);
  const { provider, model } = tier;

  console.log(`[build] calling tier=${tier.name} provider=${provider} model=${model}`);

  if (provider === "ollama") {
    const out = await ollamaChat({
      baseUrl: cfg.providers.ollama.base_url,
      model,
      messages: system ? [{ role: "system", content: system }, ...messages] : messages as any,
    });
    return (out as any).output ?? (out as any).content ?? "";
  }

  if (provider === "anthropic") {
    const { anthropicChat } = await import("@zensquid/provider-anthropic");
    const apiKey = getApiKey(cfg, "anthropic");
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
    const out = await anthropicChat({ apiKey, model, system, messages: messages as any, ...(maxTokens ? { maxTokens } : {}) });
    return out.output ?? "";
  }

  if (provider === "modelstudio" || provider === "openai") {
    const apiKey = getApiKey(cfg, provider);
    if (!apiKey) throw new Error(`Missing API key for ${provider}`);
    const provCfg = cfg.providers?.[provider] ?? {};
    const allMessages = system ? [{ role: "system", content: system }, ...messages] : messages;
    const out = await modelstudioChat({
      baseUrl: provCfg.base_url ?? "https://dashscope-us.aliyuncs.com/compatible-mode",
      apiKey,
      model,
      messages: allMessages as any,
    });
    return (out as any).output ?? (out as any).content ?? "";
  }

  throw new Error(`Unknown provider: ${provider}`);
}

function getPipelineTier(cfg: any, stage: "plan" | "patch" | "review"): { tier: string; fallback: string } {
  const bp = cfg.build_pipeline ?? {};
  return {
    plan:   { tier: bp.plan_tier   ?? "claude-sonnet", fallback: bp.plan_fallback   ?? "plan" },
    patch:  { tier: bp.patch_tier  ?? "coder",         fallback: bp.patch_fallback  ?? "build" },
    review: { tier: bp.review_tier ?? "claude-sonnet", fallback: bp.review_fallback ?? "chat" },
  }[stage];
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractJson(raw: string): any {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`No JSON in output: ${s.slice(0, 300)}`);
  return JSON.parse(s.slice(start, end + 1));
}

// ── Anchor-based patch applier ────────────────────────────────────────────────

function applyAnchorPatch(content: string, patch: BuildPatch): string {
  if (patch.is_new_file) return patch.new_str;

  // Prefer anchor-based insertion
  if (patch.anchor) {
    const lines = content.split("\n");
    const anchorIdx = lines.findIndex(l => l.includes(patch.anchor!));
    if (anchorIdx >= 0) {
      if (patch.anchor_position === "before") {
        lines.splice(anchorIdx, 0, patch.new_str);
      } else if (patch.anchor_position === "replace_line") {
        lines.splice(anchorIdx, 1, patch.new_str);
      } else {
        // default: after
        lines.splice(anchorIdx + 1, 0, patch.new_str);
      }
      return lines.join("\n");
    }
  }

  // Fallback: old_str replacement
  if (patch.old_str && content.includes(patch.old_str)) {
    return content.replace(patch.old_str, patch.new_str);
  }

  // Append to end as last resort
  console.warn(`[build:apply] anchor/old_str not found for ${patch.file}, appending`);
  return content + "\n" + patch.new_str;
}

// ── Stage implementations ─────────────────────────────────────────────────────

async function stageInspect(run: BuildRun, cfg: any, adminToken: string, zensquidRoot: string): Promise<StageResult> {
  const started_at = new Date().toISOString();
  try {
    const evidence: RepoEvidence = {};

    for (const dir of ["apps/api/src", "apps/web/app"]) {
      try {
        const r = await runTool({ workspace: "squidley", tool_id: "fs.tree", args: { path: dir }, admin_token: adminToken });
        if (r.ok) evidence.tree = (evidence.tree ?? "") + `\n=== ${dir} ===\n${r.stdout}`;
      } catch {}
    }

    const keywords = run.goal.split(/\s+/).filter((w: string) => w.length > 4).slice(0, 3);
    for (const kw of keywords) {
      try {
        const r = await runTool({ workspace: "squidley", tool_id: "rg.search", args: [kw, "."], admin_token: adminToken });
        if (r.ok && r.stdout) evidence.search_hits = (evidence.search_hits ?? "") + `\n=== rg:${kw} ===\n${r.stdout.slice(0, 800)}`;
      } catch {}
    }

    run.evidence = evidence;
    const result: StageResult = {
      stage: "inspect", status: "ok", model: "fs.tree+rg.search",
      output: `Tree: ${evidence.tree?.length ?? 0} chars · Search: ${evidence.search_hits?.length ?? 0} chars`,
      started_at, finished_at: new Date().toISOString(),
    };
    result.receipt_id = await writeStageReceipt(zensquidRoot, run, result, cfg.meta.node);
    return result;
  } catch (e: any) {
    return { stage: "inspect", status: "fail", error: String(e?.message ?? e), started_at, finished_at: new Date().toISOString() };
  }
}

async function stagePlan(run: BuildRun, cfg: any, adminToken: string, zensquidRoot: string): Promise<StageResult> {
  const started_at = new Date().toISOString();
  const { tier, fallback } = getPipelineTier(cfg, "plan");
  const resolvedTier = resolveTier(cfg, tier, fallback);

  try {
    // Read targeted context from key files
    let serverImports = "";
    let serverRegistrations = "";
    try {
      const r = await runTool({ workspace: "squidley", tool_id: "fs.read", args: ["apps/api/src/server.ts"], admin_token: adminToken });
      if (r.ok && r.stdout) {
        const lines = r.stdout.split("\n");
        serverImports = lines.filter((l: string) => l.startsWith("import ")).slice(0, 25).join("\n");
        serverRegistrations = lines.filter((l: string) => l.includes("await register") || l.includes("registerBuild")).slice(0, 20).join("\n");
      }
    } catch {}

    const evidenceSummary = [
      run.evidence?.tree ? `REPO TREE:\n${run.evidence.tree.slice(0, 1500)}` : "",
      serverImports ? `SERVER.TS IMPORTS (exact, use these as anchors):\n${serverImports}` : "",
      serverRegistrations ? `SERVER.TS REGISTRATIONS (exact, use these as anchors):\n${serverRegistrations}` : "",
      run.evidence?.search_hits ? `SEARCH HITS:\n${run.evidence.search_hits.slice(0, 800)}` : "",
    ].filter(Boolean).join("\n\n");

    const prompt = `You are a build planner for a Fastify TypeScript API. Analyze the goal and repo evidence, then produce a precise build plan. Do NOT write code in new_str — leave it empty string, code is generated in the patch stage.

GOAL: ${run.goal}

REPO CONTEXT:
${evidenceSummary}

RULES:
- Route files MUST export a named function: export async function registerXxxRoutes(app: FastifyInstance): Promise<void>
- server.ts MUST import this function and call it: await registerXxxRoutes(app);
- For server.ts patches, use anchor-based insertion pointing to an EXACT existing import or registration line
- anchor_position "after" means insert the new line immediately after the anchor line
- is_new_file: true for files that do not exist yet
- Leave new_str as empty string "" — full code is generated in the dedicated patch stage
- ANCHOR must be set: use "new file" for new files, or an exact existing line for edits

Return ONLY this JSON:
{
  "goal": "<goal>",
  "approach": "<1-2 sentences>",
  "risks": ["<risk>"],
  "tasks": [
    {
      "id": "task-1",
      "description": "<what to do>",
      "target_files": ["<path>"],
      "priority": 1,
      "patch": {
        "task_id": "task-1",
        "file": "<path>",
        "is_new_file": false,
        "anchor": "<exact existing line to insert near, e.g. import { registerBuildRoutes }",
        "anchor_position": "after",
        "old_str": "",
        "new_str": "",
        "reason": "<why>"
      }
    }
  ]
}`;

    const raw = await callTier(cfg, tier, fallback, [{ role: "user", content: prompt }],
      "You are a precise build planner. Return only valid JSON, no markdown, no explanation.", 4096);
    const plan: BuildPlan = extractJson(raw);

    // Extract patches from tasks
    run.plan = plan;
    run.patches = plan.tasks.map(t => t.patch).filter(Boolean) as BuildPatch[];

    const result: StageResult = {
      stage: "plan", status: "ok", model: resolvedTier.model,
      output: `${plan.tasks.length} task(s) · ${run.patches.length} patch(es) · ${resolvedTier.name}`,
      started_at, finished_at: new Date().toISOString(),
    };
    result.receipt_id = await writeStageReceipt(zensquidRoot, run, result, cfg.meta.node);
    return result;
  } catch (e: any) {
    return { stage: "plan", status: "fail", error: String(e?.message ?? e), started_at, finished_at: new Date().toISOString() };
  }
}

async function stagePatch(run: BuildRun, cfg: any, adminToken: string, zensquidRoot: string, repairNotes?: string): Promise<StageResult> {
  const started_at = new Date().toISOString();
  const { tier, fallback } = getPipelineTier(cfg, "patch");
  const resolvedTier = resolveTier(cfg, tier, fallback);

  try {
    if (!run.plan?.tasks?.length) throw new Error("No plan to patch from");

    // If no repair notes AND all patches have non-empty new_str, pass through
    const needsCodeGen = run.patches?.some(p => !p.new_str || p.new_str.trim() === "");
    if (!repairNotes && run.patches?.length && !needsCodeGen) {
      const result: StageResult = {
        stage: "patch", status: "ok", model: "plan-embedded",
        output: `${run.patches.length} patch(es) from plan (no codegen needed)`,
        started_at, finished_at: new Date().toISOString(),
      };
      result.receipt_id = await writeStageReceipt(zensquidRoot, run, result, cfg.meta.node);
      return result;
    }

    // Codegen + repair: generate new_str for each task
    const patches: BuildPatch[] = [];
    for (const task of run.plan.tasks.slice(0, 5)) {
      let fileContent = "";
      if (task.target_files[0] && !task.patch?.is_new_file) {
        try {
          const r = await runTool({ workspace: "squidley", tool_id: "fs.read", args: [task.target_files[0]], admin_token: adminToken });
          if (r.ok && r.stdout) {
            const full = r.stdout;
            if (task.target_files[0].includes("server.ts")) {
              const lines = full.split("\n");
              const imp = lines.filter((l: string) => l.startsWith("import ")).slice(0, 25).join("\n");
              const reg = lines.filter((l: string) => l.includes("await register")).slice(0, 15).join("\n");
              fileContent = `IMPORTS:\n${imp}\n\nREGISTRATIONS:\n${reg}`;
            } else {
              fileContent = full.slice(0, 2000);
            }
          }
        } catch {}
      }

      const isRepair = !!repairNotes;
      const prompt = `You are a precise TypeScript code generator.
GOAL: ${run.goal}
TASK: ${task.description}
FILE: ${task.target_files[0] ?? "unknown"}
IS NEW FILE: ${task.patch?.is_new_file ? "yes - write the complete file from scratch" : "no - write only the code to insert"}
${isRepair ? "REPAIR NOTES (fix ALL of these):\n" + repairNotes : ""}
${fileContent ? "CURRENT FILE CONTEXT:\n" + fileContent : ""}
RULES:
- Write ONLY what the goal and task describe. Do not add unrelated functionality.
- For HTTP route files only: export async function registerXxxRoutes(app: FastifyInstance)
- For all other files: use whatever exports the task requires
- Never use default exports
- anchor: use "new file" for new files, or an EXACT existing line for edits
Return ONLY valid JSON:
{
  "task_id": "${task.id}",
  "file": "${task.target_files[0] ?? ""}",
  "is_new_file": ${task.patch?.is_new_file ? "true" : "false"},
  "anchor": "${task.patch?.is_new_file ? "new file" : ""}",
  "anchor_position": "after",
  "old_str": "",
  "new_str": "<complete code>",
  "reason": "<why>"
}`;

      try {
        const raw = await callTier(cfg, tier, fallback, [{ role: "user", content: prompt }],
          "You are a precise code patcher. Return only valid JSON. CRITICAL: new_str must be 100% complete, never truncated.", 8192);
        patches.push(extractJson(raw));
      } catch (e: any) {
        console.warn(`[build:patch] task ${task.id} failed:`, e?.message);
      }
    }

    run.patches = patches;
    const result: StageResult = {
      stage: "patch", status: patches.length > 0 ? "ok" : "fail", model: resolvedTier.model,
      output: `${patches.length} patch(es) generated (repair mode)`,
      started_at, finished_at: new Date().toISOString(),
    };
    result.receipt_id = await writeStageReceipt(zensquidRoot, run, result, cfg.meta.node);
    return result;
  } catch (e: any) {
    return { stage: "patch", status: "fail", error: String(e?.message ?? e), started_at, finished_at: new Date().toISOString() };
  }
}

async function stageReview(run: BuildRun, cfg: any, adminToken: string, zensquidRoot: string): Promise<StageResult> {
  const started_at = new Date().toISOString();
  const { tier, fallback } = getPipelineTier(cfg, "review");
  const resolvedTier = resolveTier(cfg, tier, fallback);

  try {
    if (!run.patches?.length) throw new Error("No patches to review");

    const patchSummary = run.patches.map(p =>
      `FILE: ${p.file}${p.is_new_file ? " (NEW FILE)" : ""}\nANCHOR: ${p.anchor ?? "n/a"} (${p.anchor_position ?? "after"})\nNEW CODE:\n${p.new_str ?? ""}\nREASON: ${p.reason}`
    ).join("\n\n---\n\n");

    const prompt = `Review these code patches for a Fastify TypeScript API.

GOAL: ${run.goal}

PATCHES:
${patchSummary}

Check for:
1. Correct named exports (registerXxxRoutes pattern)
2. Route actually registered in server.ts (imported AND called)
3. Correct TypeScript types
4. No duplicate or conflicting changes

Return ONLY this JSON:
{
  "passed": true,
  "confidence": 0.95,
  "issues": [
    { "severity": "critical", "file": "<file>", "description": "<issue>" }
  ],
  "suggestions": ["<suggestion>"]
}`;

    const raw = await callTier(cfg, tier, fallback, [{ role: "user", content: prompt }],
      "You are a meticulous code reviewer. Return only valid JSON.");
    const review: ReviewReport = extractJson(raw);
    run.review = review;

    const result: StageResult = {
      stage: "review", status: review.passed ? "ok" : "fail", model: resolvedTier.model,
      output: `${review.passed ? "✓ Passed" : "✗ Failed"} · ${(review.confidence * 100).toFixed(0)}% · ${review.issues.length} issue(s)`,
      started_at, finished_at: new Date().toISOString(),
    };
    result.receipt_id = await writeStageReceipt(zensquidRoot, run, result, cfg.meta.node);
    return result;
  } catch (e: any) {
    return { stage: "review", status: "fail", error: String(e?.message ?? e), started_at, finished_at: new Date().toISOString() };
  }
}

async function stageVerify(run: BuildRun, cfg: any, adminToken: string, zensquidRoot: string): Promise<StageResult> {
  const started_at = new Date().toISOString();
  try {
    const errors: string[] = [];
    let lintOutput = "";
    try {
      const r = await runTool({ workspace: "squidley", tool_id: "lint.check", args: [], admin_token: adminToken });
      lintOutput = r.stdout ?? "";
      if (!r.ok) errors.push(`Lint: ${r.stderr?.slice(0, 300)}`);
    } catch (e: any) { errors.push(`Lint error: ${String(e?.message)}`); }

    const verify: VerifyResult = { passed: errors.length === 0, lint_output: lintOutput, errors };
    run.verify = verify;

    const result: StageResult = {
      stage: "verify", status: verify.passed ? "ok" : "fail", model: "lint.check",
      output: verify.passed ? "All checks passed" : `${errors.length} error(s)`,
      started_at, finished_at: new Date().toISOString(),
    };
    result.receipt_id = await writeStageReceipt(zensquidRoot, run, result, cfg.meta.node);
    return result;
  } catch (e: any) {
    return { stage: "verify", status: "fail", error: String(e?.message ?? e), started_at, finished_at: new Date().toISOString() };
  }
}

async function stageApply(run: BuildRun, cfg: any, adminToken: string, zensquidRoot: string): Promise<StageResult> {
  const started_at = new Date().toISOString();
  try {
    if (!run.patches?.length) throw new Error("No patches to apply");
    let applied = 0;
    const errors: string[] = [];

    for (const patch of run.patches) {
      if (!patch.file || !patch.new_str) continue;
      try {
        if (patch.is_new_file) {
          const r = await runTool({ workspace: "squidley", tool_id: "fs.write", args: [patch.file, patch.new_str], admin_token: adminToken });
          if (r.ok) applied++; else errors.push(`fs.write failed: ${patch.file}: ${r.stderr?.slice(0, 100)}`);
        } else {
          // Read current content, apply anchor patch, write back
          const readR = await runTool({ workspace: "squidley", tool_id: "fs.read", args: [patch.file], admin_token: adminToken });
          if (!readR.ok) { errors.push(`Cannot read ${patch.file}`); continue; }
          const updated = applyAnchorPatch(readR.stdout ?? "", patch);
          const writeR = await runTool({ workspace: "squidley", tool_id: "fs.write", args: [patch.file, updated], admin_token: adminToken });
          if (writeR.ok) applied++; else errors.push(`fs.write failed: ${patch.file}`);
        }
      } catch (e: any) { errors.push(`${patch.file}: ${String(e?.message)}`); }
    }

    run.applied = errors.length === 0;
    const result: StageResult = {
      stage: "apply", status: errors.length === 0 ? "ok" : "fail", model: "anchor-patcher",
      output: `Applied ${applied}/${run.patches.length}${errors.length ? ` · ${errors.length} error(s)` : ""}`,
      started_at, finished_at: new Date().toISOString(),
    };
    result.receipt_id = await writeStageReceipt(zensquidRoot, run, result, cfg.meta.node);
    return result;
  } catch (e: any) {
    return { stage: "apply", status: "fail", error: String(e?.message ?? e), started_at, finished_at: new Date().toISOString() };
  }
}

// ── Route registration ────────────────────────────────────────────────────────

export async function registerBuildRoutes(
  app: FastifyInstance,
  deps: { zensquidRoot: () => string; adminTokenOk: (req: any) => boolean }
): Promise<void> {

  app.post("/build/start", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    const body = (req.body ?? {}) as any;
    const goal = typeof body.goal === "string" ? body.goal.trim() : "";
    if (!goal) return reply.code(400).send({ ok: false, error: "Missing goal" });
    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
    const run_id = "bld-" + crypto.randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const run: BuildRun = { run_id, goal, created_at: now, updated_at: now, stage: "inspect", stages: [], repair_count: 0, max_repairs: 3 };
    runs.set(run_id, run);
    const result = await stageInspect(run, cfg, adminToken, deps.zensquidRoot());
    pushStage(run, result);
    return reply.send({ ok: true, run_id, stage: "inspect", result });
  });

  app.post("/build/plan/:run_id", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    const { run_id } = req.params as any;
    try {
      const run = getOrFail(run_id);
      const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
      const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
      const result = await stagePlan(run, cfg, adminToken, deps.zensquidRoot());
      pushStage(run, result);
      return reply.send({ ok: result.status === "ok", run_id, stage: "plan", result, plan: run.plan, patches: run.patches });
    } catch (e: any) { return reply.code(404).send({ ok: false, error: e.message }); }
  });

  app.post("/build/patch/:run_id", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    const { run_id } = req.params as any;
    try {
      const run = getOrFail(run_id);
      const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
      const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
      const result = await stagePatch(run, cfg, adminToken, deps.zensquidRoot());
      pushStage(run, result);
      return reply.send({ ok: result.status === "ok", run_id, stage: "patch", result, patches: run.patches });
    } catch (e: any) { return reply.code(404).send({ ok: false, error: e.message }); }
  });

  app.post("/build/review/:run_id", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    const { run_id } = req.params as any;
    try {
      const run = getOrFail(run_id);
      const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
      const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
      const result = await stageReview(run, cfg, adminToken, deps.zensquidRoot());
      pushStage(run, result);
      return reply.send({ ok: result.status === "ok", run_id, stage: "review", result, review: run.review });
    } catch (e: any) { return reply.code(404).send({ ok: false, error: e.message }); }
  });

  app.post("/build/verify/:run_id", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    const { run_id } = req.params as any;
    try {
      const run = getOrFail(run_id);
      const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
      const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
      const result = await stageVerify(run, cfg, adminToken, deps.zensquidRoot());
      pushStage(run, result);
      return reply.send({ ok: result.status === "ok", run_id, stage: "verify", result, verify: run.verify });
    } catch (e: any) { return reply.code(404).send({ ok: false, error: e.message }); }
  });

  app.post("/build/apply/:run_id", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    const { run_id } = req.params as any;
    try {
      const run = getOrFail(run_id);
      const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
      const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
      const result = await stageApply(run, cfg, adminToken, deps.zensquidRoot());
      pushStage(run, result);
      return reply.send({ ok: result.status === "ok", run_id, stage: "apply", result });
    } catch (e: any) { return reply.code(404).send({ ok: false, error: e.message }); }
  });

  app.post("/build/repair/:run_id", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    const { run_id } = req.params as any;
    try {
      const run = getOrFail(run_id);
      if (run.repair_count >= run.max_repairs)
        return reply.code(400).send({ ok: false, error: `Max repairs (${run.max_repairs}) reached` });
      run.repair_count++;
      const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
      const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();

      const repairNotes = (run.review?.issues ?? []).map((iss: any) =>
        typeof iss === "string" ? iss : `[${iss.severity ?? "issue"}] ${iss.file ? iss.file + ": " : ""}${iss.description ?? ""}`
      ).join("\n");

      const patchResult = await stagePatch(run, cfg, adminToken, deps.zensquidRoot(), repairNotes);
      pushStage(run, { ...patchResult, stage: `patch:repair-${run.repair_count}` });
      const reviewResult = await stageReview(run, cfg, adminToken, deps.zensquidRoot());
      pushStage(run, { ...reviewResult, stage: `review:repair-${run.repair_count}` });

      return reply.send({ ok: reviewResult.status === "ok", run_id, repair_count: run.repair_count, patch: patchResult, review: reviewResult, patches: run.patches });
    } catch (e: any) { return reply.code(404).send({ ok: false, error: e.message }); }
  });

  app.get("/build/status/:run_id", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    const { run_id } = req.params as any;
    try { return reply.send({ ok: true, run: getOrFail(run_id) }); }
    catch (e: any) { return reply.code(404).send({ ok: false, error: e.message }); }
  });

  app.get("/build/runs", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
    const list = Array.from(runs.values())
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 20)
      .map(r => ({ run_id: r.run_id, goal: r.goal, stage: r.stage, created_at: r.created_at, repair_count: r.repair_count, applied: r.applied ?? false }));
    return reply.send({ ok: true, runs: list });
  });
}
