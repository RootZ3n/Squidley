// apps/api/src/http/routes/capabilities.ts
import type { FastifyInstance } from "fastify";
import { newReceiptId, writeReceipt, type ReceiptV1 } from "@zensquid/core";
import type { CapabilityAction } from "../../capabilities/types.js";
import { checkCapabilityAction } from "../../capabilities/gate.js";
import type { SafetyZone } from "../../runtime/state.js";
import { normalizeZone } from "../../capabilities/policy.js";

type EffectivePolicy = Awaited<ReturnType<() => Promise<any>>>;

function isSafetyZone(v: any): v is SafetyZone {
  return v === "workspace" || v === "diagnostics" || v === "forge" || v === "godmode";
}

function preview(s: unknown, n = 120): string {
  const t = String(s ?? "");
  const oneLine = t.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}

function coerceAction(body: any): CapabilityAction | null {
  // Preferred: pass action directly
  if (body?.action && typeof body.action === "object") {
    return body.action as CapabilityAction;
  }

  // Alternate form: { capability, args }
  const cap = body?.capability;
  const args = body?.args ?? {};
  if (typeof cap !== "string") return null;

  if (cap === "fs.read") {
    if (typeof args.path !== "string") return null;
    return { kind: "fs.read", capability: "fs.read", path: args.path } as any;
  }

  if (cap === "fs.write" || cap === "fs.write.outside_root") {
    if (typeof args.path !== "string") return null;
    // bytes is optional; content is optional; this is a policy check, not an execution.
    const bytes =
      typeof args.bytes === "number"
        ? args.bytes
        : typeof args.content === "string"
          ? Buffer.byteLength(args.content)
          : 0;
    return { kind: "fs.write", capability: cap as any, path: args.path, bytes } as any;
  }

  if (cap === "proc.exec" || cap === "proc.exec.dangerous") {
    if (typeof args.cmd !== "string") return null;
    const cwd = typeof args.cwd === "string" ? args.cwd : ".";
    return { kind: "proc.exec", capability: cap as any, cmd: args.cmd, cwd } as any;
  }

  if (cap === "systemctl.user") {
    if (typeof args.cmd !== "string") return null;
    return { kind: "systemctl.user", capability: "systemctl.user", cmd: args.cmd } as any;
  }

  if (cap === "pkg.install") {
    // If your CapabilityAction union includes pkg.install later, this will work.
    // For now, we still allow policy evaluation by treating it as "system" action shape.
    return { kind: "pkg.install", capability: "pkg.install", ...(args ?? {}) } as any;
  }

  // Unknown capability
  return null;
}

export async function registerCapabilitiesRoutes(
  app: FastifyInstance,
  deps: {
    adminTokenOk: (req: any) => boolean;
    zensquidRoot: () => string;
    loadConfig: () => Promise<any>;
    getEffectivePolicy: (cfg: any) => Promise<any>;
  }
) {
  // Admin-only deterministic policy evaluator
  app.post("/capabilities/check", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const body = (req.body ?? {}) as any;
    const cfg = await deps.loadConfig();

    const action = coerceAction(body);
    if (!action) {
      return reply.code(400).send({
        ok: false,
        error: "Invalid request. Provide {action} or {capability, args}."
      });
    }

    // Zone can be overridden for tests; otherwise effective policy decides
    const zoneOverride = isSafetyZone(body?.safety_zone) ? normalizeZone(body.safety_zone) : null;

    const eff = await deps.getEffectivePolicy(cfg);
    const zone = zoneOverride ?? eff.zone;

    const decision = await checkCapabilityAction({
      action,
      zone,
      policy: eff.policy,
      projectRootResolved: eff.projectRootResolved
    });

    const receipt_id = newReceiptId();

    const receipt: any = {
      schema: "zensquid.receipt.v1",
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta?.node ?? "unknown",
      request: {
        kind: "system",
        input: `[capabilities.check] ${action.capability} ${preview(JSON.stringify(action), 140)}`,
        mode: "capabilities_check",
        safety_zone: zone
      },
      decision: {
        tier: "local",
        provider: "local",
        model: "capability-gate",
        escalated: false,
        escalation_reason: null
      },
      tool_event: {
        zone,
        capability: decision.capability,
        allowed: decision.allowed,
        reason: decision.reason,
        matched_rule: decision.matched_rule,
        action
      }
    };

    await writeReceipt(deps.zensquidRoot(), receipt as ReceiptV1);

    return reply.send({
      ok: true,
      zone,
      allowed: decision.allowed,
      capability: decision.capability,
      reason: decision.reason,
      matched_rule: decision.matched_rule,
      receipt_id
    });
  });
}