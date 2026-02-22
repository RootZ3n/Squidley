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

  // ✅ onboarding gate (per-PC)
  // expected to read /data/onboarding.json (or equivalent) on THIS machine
  getOnboarding: () => Promise<{ completed: boolean }>;
};

type PresetName = "beginner" | "normal" | "diagnostics" | "forge" | "godmode" | "local_lockdown" | "reset";

type Preset = {
  name: PresetName;
  label: string;
  description: string;
  // what to apply into runtime.json (null means clear override)
  apply: {
    safety_zone: SafetyZone | null;
    strict_local_only: boolean | null;
  };
  // extra requirements for dangerous presets
  requires?: {
    godmode_password?: boolean;
    confirm_phrase?: string;
  };
};

function godmodePasswordOk(req: any, body: any): boolean {
  const expected = String(process.env.ZENSQUID_GODMODE_PASSWORD ?? "").trim();
  if (!expected) return false; // if not set, godmode is effectively disabled
  const header = String(req.headers?.["x-zensquid-godmode-password"] ?? "").trim();
  const b = String(body?.godmode_password ?? "").trim();
  return header === expected || b === expected;
}

export async function registerRuntimeRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  // Load once at boot time (caller will call this before listen),
  // but this makes it safe if called without it too.
  try {
    const s = await deps.loadState();
    deps.setState(s);
  } catch {}

  const PRESETS: Preset[] = [
    {
      name: "beginner",
      label: "Beginner (safe + local-only)",
      description: "Conservative zone + strict local only. No cloud escalation.",
      apply: { safety_zone: "workspace", strict_local_only: true }
    },
    {
      name: "normal",
      label: "Normal (safe defaults)",
      description: "Workspace zone. Cloud eligible (still gated by your escalation rules).",
      apply: { safety_zone: "workspace", strict_local_only: false }
    },
    {
      name: "diagnostics",
      label: "Diagnostics (read-only leaning)",
      description: "Diagnostics zone for controlled inspection flows (policy-dependent).",
      apply: { safety_zone: "diagnostics", strict_local_only: false }
    },
    {
      name: "forge",
      label: "Forge (developer mode)",
      description: "Forge zone. Still respects capability policy. Local-only not forced.",
      apply: { safety_zone: "forge", strict_local_only: false }
    },
    {
      name: "godmode",
      label: "Godmode (dangerous)",
      description:
        "Godmode zone. Requires separate password + explicit confirmation. Use only when you intentionally want maximum capability.",
      apply: { safety_zone: "godmode", strict_local_only: false },
      requires: {
        godmode_password: true,
        confirm_phrase: "I UNDERSTAND GODMODE"
      }
    },
    {
      name: "local_lockdown",
      label: "Local Lockdown (keep zone, force local-only)",
      description: "Forces strict local only but does not change the safety zone.",
      apply: { safety_zone: null, strict_local_only: true }
    },
    {
      name: "reset",
      label: "Reset (back to config defaults)",
      description: "Clears runtime overrides and uses config defaults again.",
      apply: { safety_zone: null, strict_local_only: null }
    }
  ];

  // ✅ helper: onboarding status (default = not completed)
  async function onboardingCompleted(): Promise<boolean> {
    try {
      const o = await deps.getOnboarding();
      return Boolean(o?.completed);
    } catch {
      return false;
    }
  }

  // ✅ helper: enforce onboarding gate for presets
  function presetAllowedBeforeOnboarding(name: PresetName): boolean {
    // Before onboarding is complete, user can:
    // - stay in beginner (safe default)
    // - local_lockdown (even safer)
    // - reset (clear overrides back to config; server should still enforce beginner until onboard completes)
    return name === "beginner" || name === "local_lockdown" || name === "reset";
  }

  // ✅ helper: block bypass routes (manual toggles)
  function zoneAllowedBeforeOnboarding(zone: SafetyZone | null): boolean {
    // allow workspace/diagnostics/null before onboarding
    // block forge/godmode before onboarding
    if (zone === null) return true;
    return zone === "workspace" || zone === "diagnostics";
  }

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

  // Expose preset catalog for UI + CLI
  app.get("/runtime/presets", async () => {
    return { ok: true, presets: PRESETS };
  });

  // Apply a preset by name
  app.post("/runtime/preset", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const body = (req.body ?? {}) as any;
    const name = String(body?.name ?? "").trim() as PresetName;

    const preset = PRESETS.find((p) => p.name === name);
    if (!preset) {
      return reply.code(400).send({
        ok: false,
        error: `Unknown preset. Use GET /runtime/presets`,
        name
      });
    }

    // ✅ Onboarding gate: don't let users jump into advanced modes
    const onboarded = await onboardingCompleted();
    if (!onboarded && !presetAllowedBeforeOnboarding(preset.name)) {
      return reply.code(403).send({
        ok: false,
        error: `Finish onboarding before using preset "${preset.name}".`,
        allowed_before_onboarding: ["beginner", "local_lockdown", "reset"]
      });
    }

    // Guard godmode (still enforced even after onboarding)
    if (preset.name === "godmode") {
      const confirm = String(body?.confirm ?? "").trim();
      const requiredPhrase = preset.requires?.confirm_phrase ?? "I UNDERSTAND GODMODE";

      if (confirm !== requiredPhrase) {
        return reply.code(400).send({
          ok: false,
          error: `Godmode requires confirm phrase.`,
          required: requiredPhrase
        });
      }

      if (!godmodePasswordOk(req, body)) {
        return reply.code(401).send({
          ok: false,
          error:
            "Godmode password required. Set ZENSQUID_GODMODE_PASSWORD and send x-zensquid-godmode-password header (or godmode_password in body)."
        });
      }
    }

    const state = { ...deps.getState() };

    // Apply values (null means clear override)
    state.safety_zone = preset.apply.safety_zone;
    state.strict_local_only = preset.apply.strict_local_only;

    deps.setState(state);
    await deps.saveState(state);

    return reply.send({ ok: true, preset: preset.name, runtime: state });
  });

  // Manual toggles (dev/testing) — hardened to avoid bypassing onboarding + godmode rules
  app.post("/runtime/safety_zone", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const body = (req.body ?? {}) as any;
    const value = body?.value;

    const onboarded = await onboardingCompleted();

    // Parse requested zone
    let requestedZone: SafetyZone | null | "__invalid__" = "__invalid__";
    if (value === null) requestedZone = null;
    else if (isSafetyZone(value)) requestedZone = value as SafetyZone;

    if (requestedZone === "__invalid__") {
      return reply.code(400).send({
        ok: false,
        error: 'Invalid body. Send JSON: { "value": "workspace" } | "diagnostics" | "forge" | "godmode" | null'
      });
    }

    // 🚧 Onboarding gate: keep it ultra-conservative pre-onboarding.
    // We only allow workspace or null (null = fall back to config, which should still be beginner-guarded elsewhere).
    if (!onboarded) {
      const allowed = requestedZone === null || requestedZone === "workspace";
      if (!allowed) {
        return reply.code(403).send({
          ok: false,
          error: `Finish onboarding before setting safety_zone to "${requestedZone}".`,
          allowed_before_onboarding: ["workspace", null]
        });
      }
    }

    // 🔒 Godmode must ONLY be reachable through /runtime/preset so password + confirm phrase are always enforced.
    if (requestedZone === "godmode") {
      return reply.code(403).send({
        ok: false,
        error: 'Godmode can only be enabled via POST /runtime/preset (requires password + confirm phrase).'
      });
    }

    const state = { ...deps.getState() };
    state.safety_zone = requestedZone;

    deps.setState(state);
    await deps.saveState(state);
    return reply.send({ ok: true, runtime: state });
  });
    app.post("/budgets/strict_local_only", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const body = (req.body ?? {}) as any;
    const value = body?.value;

    const onboarded = await onboardingCompleted();

    const state = { ...deps.getState() };

    // 🚧 Onboarding gate: cannot disable strict_local_only before onboarding.
    // Allow only: true or null (null = fallback to config; your onboarding/bootstrap should still enforce beginner)
    if (!onboarded) {
      if (value === false) {
        return reply.code(403).send({
          ok: false,
          error: "Finish onboarding before disabling strict_local_only.",
          allowed_before_onboarding: [true, null],
          hint: 'Complete onboarding, then apply preset "normal" or set strict_local_only=false.'
        });
      }
    }

    if (value === null) {
      state.strict_local_only = null;
    } else if (typeof value === "boolean") {
      state.strict_local_only = value;
    } else {
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