// apps/api/src/http/routes/runtime.ts
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@zensquid/core";
import { isSafetyZone, type RuntimeState, type SafetyZone } from "../../runtime/state.js";

type Deps = {
  adminTokenOk: (req: any) => boolean;
  loadState: () => Promise<RuntimeState>;
  saveState: (s: RuntimeState) => Promise<void>;
  getState: () => RuntimeState;
  setState: (s: RuntimeState) => void;

  effectiveStrictLocal: (cfg: any) => { effective: boolean; source: "runtime" | "config" };
  effectiveSafetyZone: (cfg: any) => { effective: SafetyZone; source: "runtime" | "config" };
  getEffectivePolicy: (cfg: any) => Promise<any>;
};

export async function registerRuntimeRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  // load once at boot time (caller will call this before listen)
  // but this makes it safe if called without it too
  try {
    const s = await deps.loadState();
    deps.setState(s);
  } catch {}

  app.get("/runtime", async () => {
    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const effStrict = deps.effectiveStrictLocal(cfg);
    const effZone = deps.effectiveSafetyZone(cfg);

    return {
      ok: true,
      runtime: deps.getState(),
      effective: {
        strict_local_only: effStrict.effective,
        strict_local_only_source: effStrict.source,
        safety_zone: effZone.effective,
        safety_zone_source: effZone.source
      }
    };
  });

  app.post("/runtime/safety_zone", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const body = (req.body ?? {}) as any;
    const value = body?.value;

    const state = { ...deps.getState() };

    if (value === null) state.safety_zone = null;
    else if (isSafetyZone(value)) state.safety_zone = value;
    else {
      return reply.code(400).send({
        ok: false,
        error: 'Invalid body. Send JSON: { "value": "workspace" } | "diagnostics" | "forge" | "godmode" | null'
      });
    }

    deps.setState(state);
    await deps.saveState(state);
    return reply.send({ ok: true, runtime: state });
  });

  app.post("/budgets/strict_local_only", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const body = (req.body ?? {}) as any;
    const value = body?.value;

    const state = { ...deps.getState() };

    if (value === null) state.strict_local_only = null;
    else if (typeof value === "boolean") state.strict_local_only = value;
    else {
      return reply.code(400).send({
        ok: false,
        error: 'Invalid body. Send JSON: { "value": true } | { "value": false } | { "value": null }'
      });
    }

    deps.setState(state);
    await deps.saveState(state);
    return reply.send({ ok: true, runtime: state });
  });

  app.get("/runtime/effective_policy", async () => {
    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const effStrict = deps.effectiveStrictLocal(cfg);
    const eff = await deps.getEffectivePolicy(cfg);

    return {
      ok: true,
      runtime: deps.getState(),
      effective: {
        strict_local_only: effStrict.effective,
        strict_local_only_source: effStrict.source,
        safety_zone: eff.zone,
        safety_zone_source: eff.zone_source
      },
      policy: {
        policy_path: eff.policy_path,
        project_root: eff.project_root,
        global_denies: eff.global_denies,
        allow: eff.zone_allow,
        deny: eff.zone_deny,
        exec_allowlist: eff.exec_allowlist,
        exec_denylist: eff.exec_denylist
      }
    };
  });
}