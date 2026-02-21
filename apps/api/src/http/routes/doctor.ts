// apps/api/src/http/routes/doctor.ts
import type { FastifyInstance } from "fastify";
import { mkdir } from "node:fs/promises";

import { loadConfig } from "@zensquid/core";

type Deps = {
  receiptsDir: () => string;
  effectiveStrictLocal: (cfg: any) => { effective: boolean; source: "runtime" | "config" };
  effectiveSafetyZone: (cfg: any) => { effective: any; source: "runtime" | "config" };
};

export async function registerDoctorRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  /**
   * Doctor
   */
  app.get("/doctor", async (_req, reply) => {
    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const effStrict = deps.effectiveStrictLocal(cfg);
    const effZone = deps.effectiveSafetyZone(cfg);

    const checks: Array<{ id: string; status: "pass" | "warn" | "fail"; detail: string }> = [];
    const pass = (id: string, detail: string) => checks.push({ id, status: "pass", detail });
    const warn = (id: string, detail: string) => checks.push({ id, status: "warn", detail });
    const fail = (id: string, detail: string) => checks.push({ id, status: "fail", detail });

    if (cfg?.meta?.node) pass("config.node", `node=${cfg.meta.node}`);
    else fail("config.node", "cfg.meta.node missing");

    pass("budgets.strict_local_only", `effective=${effStrict.effective} (source=${effStrict.source})`);
    pass("runtime.safety_zone", `effective=${effZone.effective} (source=${effZone.source})`);

    if (effZone.effective === "godmode") warn("runtime.safety_zone.risk", "godmode enabled");
    else if (effZone.effective === "forge") warn("runtime.safety_zone.risk", "forge enabled");
    else pass("runtime.safety_zone.risk", "zone is conservative");

    try {
      await mkdir(deps.receiptsDir(), { recursive: true });
      pass("receipts.dir", `ok (${deps.receiptsDir()})`);
    } catch (e: any) {
      fail("receipts.dir", `cannot create/read (${deps.receiptsDir()}): ${String(e?.message ?? e)}`);
    }

    try {
      const r = await fetch(`${cfg.providers.ollama.base_url.replace(/\/+$/, "")}/api/tags`);
      if (!r.ok) fail("ollama.reachable", `HTTP ${r.status} from /api/tags`);
      else pass("ollama.reachable", `ok (${cfg.providers.ollama.base_url})`);
    } catch (e: any) {
      fail("ollama.reachable", `error: ${String(e?.message ?? e)}`);
    }

    const summary = {
      pass: checks.filter((c) => c.status === "pass").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length
    };

    const ok = summary.fail === 0;
    return reply.send({ ok, summary, checks });
  });
}