// apps/api/src/http/routes/autonomy.ts
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";

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
    const workspace =
      (typeof deps.workspace === "function" ? deps.workspace() : deps.zensquidRoot()) || deps.zensquidRoot();

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
}