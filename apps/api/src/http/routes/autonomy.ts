// apps/api/src/http/routes/autonomy.ts
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { runAgent, listAgents } from "../../chat/agentRunner.js";

// ── Plan store (in-memory, 30min TTL) ────────────────────────────────────────
type StoredPlan = {
  plan_id: string;
  goal: string;
  steps: RunStep[];
  created_at: number;
  expires_at: number;
};

const planStore = new Map<string, StoredPlan>();
const PLAN_TTL_MS = 30 * 60 * 1000;

function storePlan(goal: string, steps: RunStep[]): StoredPlan {
  // purge expired
  const now = Date.now();
  for (const [id, p] of planStore) {
    if (p.expires_at < now) planStore.delete(id);
  }
  const plan_id = crypto.randomBytes(6).toString("base64url");
  const plan: StoredPlan = {
    plan_id,
    goal,
    steps,
    created_at: now,
    expires_at: now + PLAN_TTL_MS,
  };
  planStore.set(plan_id, plan);
  return plan;
}

function getPlan(plan_id: string): StoredPlan | null {
  const p = planStore.get(plan_id);
  if (!p) return null;
  if (p.expires_at < Date.now()) {
    planStore.delete(plan_id);
    return null;
  }
  return p;
}

type PolicyV1 = {
  schema: "zensquid.autonomy.policy.v1";
  mode_default: "auto" | "manual";
  stop_on_fail_default: boolean;
  notes: string[];
  allowlist: Array<{ id: string }>;
};

type RunStep = {
  tool: string;
  args?: Record<string, any>;
};

type RunBody = {
  goal?: string;
  mode?: "auto" | "manual";
  stop_on_fail?: boolean;
  steps?: RunStep[];
};

type StepResult = {
  ok: boolean;
  tool: string;
  args: Record<string, any>;
  statusCode?: number;
  error?: string;
  receipt_id?: string | null;
  output?: any;
};

type Deps = {
  zensquidRoot: () => string;
  adminTokenOk: (req: any) => boolean;

  // Required: list of tool IDs allowed to run under autonomy
  allowlist: string[];

  // Optional: allow overriding workspace used for /tools/run
  workspace?: () => string;
};

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function newRunId(): string {
  return crypto.randomBytes(6).toString("base64url");
}

function uniq(list: string[]): string[] {
  return Array.from(new Set(list));
}

export async function registerAutonomyRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const allow = uniq((deps.allowlist ?? []).map((s) => str(s)).filter(Boolean));

  const policy: PolicyV1 = {
    schema: "zensquid.autonomy.policy.v1",
    mode_default: "auto",
    stop_on_fail_default: true,
    notes: [
      "Controlled autonomy v0: you provide explicit steps; no agent planning yet.",
      "Admin token required for POST /autonomy/run.",
      "Only allowlisted tools may run. Everything else is denied.",
      "Execution uses internal Fastify inject to /tools/run (no direct shell)."
    ],
    allowlist: allow.map((id) => ({ id }))
  };

  app.get("/autonomy/policy", async () => {
    return { ok: true, policy };
  });

  // ── POST /autonomy/plan — generate a plan from a goal ──────────────────────
  app.post<{ Body: { goal?: string; ollama_url?: string; model?: string } }>(
    "/autonomy/plan",
    async (req, reply) => {
      if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "unauthorized" });

      const goal = str(req.body?.goal);
      if (!goal) return reply.code(400).send({ ok: false, error: "goal required" });

      const ollamaUrl = str(req.body?.ollama_url) || "http://127.0.0.1:11434";
      const model = str(req.body?.model) || "qwen2.5:14b-instruct";

      // Build a planner prompt
      const toolList = allow.map((id) => `- ${id}`).join("\n");
      const plannerPrompt = [
        "You are a planning assistant. Given a goal, output a JSON array of steps to accomplish it.",
        "Each step has: { \"tool\": \"<tool_id>\", \"args\": { ... } }",
        "Only use tools from this list:",
        toolList,
        "",
        "Rules:",
        "- Output ONLY valid JSON array. No markdown, no explanation.",
        "- Maximum 6 steps.",
        "- Use git.status first if the goal involves checking repo state.",
        "- Use rg.search with { \"query\": \"<term>\", \"path\": \".\" } for code searches.",
        "- For git.log use {} args (no args needed).",
        "- For git.diff use {} args for unstaged diff.",
        "- Keep args minimal and safe.",
        "",
        `Goal: ${goal}`,
        "",
        "Respond with JSON array only:"
      ].join("\n");

      try {
        // Call ollama directly for planning
        const ollamaResp = await fetch(`${ollamaUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [{ role: "user", content: plannerPrompt }],
          }),
        });

        if (!ollamaResp.ok) {
          return reply.code(502).send({ ok: false, error: `ollama error: ${ollamaResp.status}` });
        }

        const ollamaJson: any = await ollamaResp.json();
        const raw = String(ollamaJson?.message?.content ?? "").trim();

        // Parse the JSON array — strip markdown fences if present
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        let steps: RunStep[];
        try {
          const parsed = JSON.parse(cleaned);
          if (!Array.isArray(parsed)) throw new Error("not an array");
          steps = parsed.slice(0, 6).map((s: any) => ({
            tool: str(s?.tool),
            args: s?.args && typeof s.args === "object" ? s.args : {},
          })).filter((s) => s.tool && allow.includes(s.tool));
        } catch {
          return reply.code(422).send({
            ok: false,
            error: "planner returned invalid JSON",
            raw,
          });
        }

        if (steps.length === 0) {
          return reply.code(422).send({ ok: false, error: "planner produced no valid steps", raw });
        }

        const plan = storePlan(goal, steps);

        return reply.send({
          ok: true,
          plan_id: plan.plan_id,
          goal,
          steps,
          expires_in_ms: PLAN_TTL_MS,
          message: `Plan ready. Approve with POST /autonomy/approve { plan_id: "${plan.plan_id}" }`,
        });
      } catch (e: any) {
        return reply.code(500).send({ ok: false, error: String(e?.message ?? e) });
      }
    }
  );

  // ── POST /autonomy/approve — execute an approved plan ─────────────────────
  app.post<{ Body: { plan_id?: string; stop_on_fail?: boolean } }>(
    "/autonomy/approve",
    async (req, reply) => {
      if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "unauthorized" });

      const plan_id = str(req.body?.plan_id);
      if (!plan_id) return reply.code(400).send({ ok: false, error: "plan_id required" });

      const plan = getPlan(plan_id);
      if (!plan) return reply.code(404).send({ ok: false, error: "plan not found or expired" });

      planStore.delete(plan_id);

      // Delegate to the existing /autonomy/run logic by injecting
      const adminHeader = str(req.headers?.["x-zensquid-admin-token"]);
      const stopOnFail = typeof req.body?.stop_on_fail === "boolean" ? req.body.stop_on_fail : true;
      // Use workspace name "squidley" — runTool maps this to ZENSQUID_ROOT
      const workspace = "squidley";

      const run_id = newRunId();
      const started_at = new Date().toISOString();
      const results: StepResult[] = [];
      let halted = false;

      for (const step of plan.steps) {
        const tool = str(step.tool);
        const args = step.args ?? {};

        if (!allow.includes(tool)) {
          results.push({ ok: false, tool, args, statusCode: 403, error: `not allowlisted: ${tool}`, receipt_id: null });
          halted = true;
          break;
        }

        try {
          const res = await app.inject({
            method: "POST",
            url: "/tools/run",
            headers: {
              "content-type": "application/json",
              "x-zensquid-admin-token": adminHeader,
            },
            payload: { workspace, tool_id: tool, args },
          });

          let json: any = null;
          try {
            json = typeof (res as any).json === "function" ? (res as any).json() : JSON.parse(res.payload);
          } catch { json = null; }

          const ok = Boolean(json?.ok);
          results.push({
            ok, tool, args,
            statusCode: res.statusCode,
            error: ok ? undefined : String(json?.error ?? `status=${res.statusCode}`),
            receipt_id: json?.receipt_id ?? null,
            output: json,
          });

          if (!ok && stopOnFail) { halted = true; break; }
        } catch (e: any) {
          results.push({ ok: false, tool, args, statusCode: 500, error: String(e?.message ?? e), receipt_id: null });
          if (stopOnFail) { halted = true; break; }
        }
      }

      const finished_at = new Date().toISOString();
      const pass = results.filter((r) => r.ok).length;
      const fail = results.filter((r) => !r.ok).length;

      return reply.send({
        ok: fail === 0,
        summary: {
          ok: fail === 0, run_id, goal: plan.goal,
          started_at, finished_at, halted,
          steps_total: plan.steps.length,
          steps_ran: results.length,
          pass, fail,
        },
        results,
      });
    }
  );

  app.post<{ Body: RunBody }>("/autonomy/run", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "unauthorized" });

    const body = (req.body ?? {}) as RunBody;

    const goal = str(body.goal) || "autonomy run";
    const stopOnFail = typeof body.stop_on_fail === "boolean" ? body.stop_on_fail : policy.stop_on_fail_default;

    const steps = Array.isArray(body.steps) ? body.steps : [];
    if (steps.length === 0) {
      return reply.code(400).send({ ok: false, error: "steps[] required" });
    }

    // Workspace for tools/run
    // Use workspace name "squidley" — runTool maps this to ZENSQUID_ROOT
    const workspace = "squidley";

    const run_id = newRunId();
    const started_at = new Date().toISOString();

    const results: StepResult[] = [];

    // Forward the caller's admin token to /tools/run (since it is also admin-gated)
    const adminHeader = str(req.headers?.["x-zensquid-admin-token"]);

    let halted = false;

    for (const step of steps) {
      const tool = str(step?.tool);
      const args = (step?.args && typeof step.args === "object" ? step.args : {}) as Record<string, any>;

      if (!tool) {
        results.push({
          ok: false,
          tool: "",
          args: {},
          statusCode: 400,
          error: "step.tool missing",
          receipt_id: null
        });
        halted = true;
        break;
      }

      if (!allow.includes(tool)) {
        results.push({
          ok: false,
          tool,
          args,
          statusCode: 403,
          error: `tool not allowlisted for autonomy: ${tool}`,
          receipt_id: null
        });
        halted = true;
        break;
      }

      try {
        // ✅ CRITICAL: tools/run requires workspace + tool_id
        const res = await app.inject({
          method: "POST",
          url: "/tools/run",
          headers: {
            "content-type": "application/json",
            "x-zensquid-admin-token": adminHeader
          },
          payload: {
            workspace,
            tool_id: tool,
            args
          }
        });

        let json: any = null;
        try {
          // @ts-ignore
          json = typeof (res as any).json === "function" ? (res as any).json() : JSON.parse(res.payload);
        } catch {
          json = null;
        }

        const ok = Boolean(json?.ok);

        results.push({
          ok,
          tool,
          args,
          statusCode: res.statusCode,
          error: ok ? undefined : String(json?.error ?? `status=${res.statusCode}`),
          receipt_id: json?.receipt_id ?? null,
          output: json
        });

        if (!ok && stopOnFail) {
          halted = true;
          break;
        }
      } catch (e: any) {
        results.push({
          ok: false,
          tool,
          args,
          statusCode: 500,
          error: String(e?.message ?? e),
          receipt_id: null
        });
        if (stopOnFail) {
          halted = true;
          break;
        }
      }
    }

    const finished_at = new Date().toISOString();
    const pass = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;

    const summary = {
      ok: fail === 0,
      run_id,
      goal,
      started_at,
      finished_at,
      halted,
      steps_total: steps.length,
      steps_ran: results.length,
      pass,
      fail
    };

    return reply.send({
      ok: summary.ok,
      summary,
      results
    });
  });
  // ── GET /autonomy/agents — list available agents ──────────────────────────
  app.get("/autonomy/agents", async (_req, reply) => {
    const agents = await listAgents();
    return reply.send({ ok: true, agents });
  });

  // ── POST /autonomy/agent/run — spin up an agent ───────────────────────────
  app.post<{ Body: { agent?: string; focus?: string; ollama_url?: string; model?: string } }>(
    "/autonomy/agent/run",
    async (req, reply) => {
      if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "unauthorized" });

      const agentName = String(req.body?.agent ?? "").trim();
      if (!agentName) return reply.code(400).send({ ok: false, error: "agent name required" });

      const focus = String(req.body?.focus ?? "").trim() || undefined;
      const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();

      const result = await runAgent({
        agentName,
        focus,
        app,
        adminToken,
        ollamaUrl: req.body?.ollama_url,
        model: req.body?.model,
      });

      return reply.code(result.ok ? 200 : 500).send({
        ok: result.ok,
        agent: result.agent,
        run_id: result.run_id,
        thread_id: result.thread_id,
        steps_ran: result.steps_ran,
        pass: result.pass,
        fail: result.fail,
        summary: result.summary,
        error: result.error,
      });
    }
  );

}