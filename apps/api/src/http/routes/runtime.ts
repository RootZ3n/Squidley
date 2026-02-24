// apps/api/src/http/routes/runtime.ts
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@zensquid/core";
import { isSafetyZone, type RuntimeState, type SafetyZone } from "../../runtime/state.js";
import { classifyModel } from "../../runtime/modelClass.js";

type StrictSource = "runtime" | "config" | "runtime_onboarding_relaxed";

type Deps = {
  adminTokenOk: (req: any) => boolean;
  loadState: () => Promise<RuntimeState>;
  saveState: (s: RuntimeState) => Promise<void>;
  getState: () => RuntimeState;
  setState: (s: RuntimeState) => void;

  effectiveStrictLocal: (cfg: any) => Promise<{ effective: boolean; source: StrictSource }>;
  effectiveSafetyZone: (cfg: any) => { effective: SafetyZone; source: "runtime" | "config" };
  getEffectivePolicy: (cfg: any) => Promise<any>;

  // onboarding gate (per-PC)
  getOnboarding: () => Promise<{ completed: boolean }>;
};

type PresetName = "beginner" | "normal" | "diagnostics" | "forge" | "godmode" | "local_lockdown" | "reset";

type Preset = {
  name: PresetName;
  label: string;
  description: string;
  apply: {
    safety_zone: SafetyZone | null;
    strict_local_only: boolean | null;
  };
  requires?: {
    godmode_password?: boolean;
    confirm_phrase?: string;
  };
};

function godmodePasswordOk(req: any, body: any): boolean {
  const expected = String(process.env.ZENSQUID_GODMODE_PASSWORD ?? "").trim();
  if (!expected) return false;
  const header = String(req.headers?.["x-zensquid-godmode-password"] ?? "").trim();
  const b = String(body?.godmode_password ?? "").trim();
  return header === expected || b === expected;
}

function getBuildInfo(): { sha: string | null; at: string | null } {
  const sha = String(process.env.ZENSQUID_BUILD_SHA ?? "").trim();
  const at = String(process.env.ZENSQUID_BUILD_AT ?? "").trim();
  return {
    sha: sha.length > 0 ? sha : null,
    at: at.length > 0 ? at : null
  };
}

export async function registerRuntimeRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  // Load once at boot time
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

  async function onboardingCompleted(): Promise<boolean> {
    try {
      const o = await deps.getOnboarding();
      return Boolean(o?.completed);
    } catch {
      return false;
    }
  }

  function presetAllowedBeforeOnboarding(name: PresetName): boolean {
    return name === "beginner" || name === "local_lockdown" || name === "reset";
  }

  function zoneAllowedBeforeOnboarding(zone: SafetyZone | null): boolean {
    if (zone === null) return true;
    return zone === "workspace" || zone === "diagnostics";
  }

  /**
   * ✅ Status endpoint (UI + CLI friendly)
   * Exposes effective runtime + tier catalog + model_class per tier.
   */
  app.get("/status", async () => {
    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);

    const build = getBuildInfo();

    const effStrict = await deps.effectiveStrictLocal(cfg);
    const effZone = deps.effectiveSafetyZone(cfg);

    const tiers = (cfg as any)?.tiers ?? [];
    const mappedTiers = tiers.map((t: any) => {
      const provider = String(t?.provider ?? "");
      const model = String(t?.model ?? "");
      const c = classifyModel(provider, model);

      return {
        name: String(t?.name ?? ""),
        provider,
        model,
        model_class: c.model_class,
        param_b: c.param_b,
        class_source: c.source
      };
    });

    // Heartbeat model (hard-local) — use env override if set
    const hbModel =
      String(process.env.ZENSQUID_HEARTBEAT_MODEL ?? "").trim() ||
      String((cfg as any)?.heartbeat?.model ?? "").trim() ||
      "qwen2.5:7b-instruct";

    const heartbeat = classifyModel("ollama", hbModel);

    // Conservative “recommended default tier” for initial UI display:
    // prefer tier named "local", else first ollama tier, else first tier.
    const recommended =
      mappedTiers.find((t: any) => t.name === "local") ??
      mappedTiers.find((t: any) => String(t.provider).toLowerCase() === "ollama") ??
      mappedTiers[0] ??
      null;

    return {
      ok: true,

      // Handy for CLI: jq '.build'
      build,

      meta: {
        name: (cfg as any)?.meta?.name ?? "Squidley",
        node: (cfg as any)?.meta?.node ?? null,
        local_first: Boolean((cfg as any)?.meta?.local_first),

        // Handy for your UI + jq '.meta.build'
        build
      },
      onboarding: {
        completed: await onboardingCompleted()
      },
      runtime: deps.getState(),
      effective: {
        strict_local_only: effStrict.effective,
        strict_local_only_source: effStrict.source,
        safety_zone: effZone.effective,
        safety_zone_source: effZone.source
      },
      providers: {
        ollama_base: (cfg as any)?.providers?.ollama?.base_url ?? null,
        modelstudio_base: (cfg as any)?.providers?.modelstudio?.base_url ?? null
      },
      heartbeat: {
        provider: "ollama",
        model: hbModel,
        model_class: heartbeat.model_class,
        param_b: heartbeat.param_b,
        class_source: heartbeat.source
      },
      tiers: mappedTiers,
      recommended_default_tier: recommended
    };
  });

  app.get("/runtime", async () => {
    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const build = getBuildInfo();

    const effStrict = await deps.effectiveStrictLocal(cfg);
    const effZone = deps.effectiveSafetyZone(cfg);

    return {
      ok: true,
      build,
      runtime: deps.getState(),
      effective: {
        strict_local_only: effStrict.effective,
        strict_local_only_source: effStrict.source,
        safety_zone: effZone.effective,
        safety_zone_source: effZone.source
      }
    };
  });

  app.get("/runtime/presets", async () => {
    return { ok: true, presets: PRESETS };
  });

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

    const onboarded = await onboardingCompleted();
    if (!onboarded && !presetAllowedBeforeOnboarding(preset.name)) {
      return reply.code(403).send({
        ok: false,
        error: `Finish onboarding before using preset "${preset.name}".`,
        allowed_before_onboarding: ["beginner", "local_lockdown", "reset"]
      });
    }

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
    state.safety_zone = preset.apply.safety_zone;
    state.strict_local_only = preset.apply.strict_local_only;

    deps.setState(state);
    await deps.saveState(state);

    return reply.send({ ok: true, preset: preset.name, runtime: state });
  });

  app.post("/runtime/safety_zone", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const body = (req.body ?? {}) as any;
    const value = body?.value;

    const onboarded = await onboardingCompleted();

    let requestedZone: SafetyZone | null | "__invalid__" = "__invalid__";
    if (value === null) requestedZone = null;
    else if (isSafetyZone(value)) requestedZone = value as SafetyZone;

    if (requestedZone === "__invalid__") {
      return reply.code(400).send({
        ok: false,
        error: 'Invalid body. Send JSON: { "value": "workspace" } | "diagnostics" | "forge" | "godmode" | null'
      });
    }

    if (!onboarded) {
      if (!zoneAllowedBeforeOnboarding(requestedZone)) {
        return reply.code(403).send({
          ok: false,
          error: `Finish onboarding before setting safety_zone to "${requestedZone}".`,
          allowed_before_onboarding: ["workspace", "diagnostics", null]
        });
      }
    }

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

    if (!onboarded && value === false) {
      return reply.code(403).send({
        ok: false,
        error: "Finish onboarding before disabling strict_local_only.",
        allowed_before_onboarding: [true, null],
        hint: 'Complete onboarding, then apply preset "normal" or set strict_local_only=false.'
      });
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
    const effStrict = await deps.effectiveStrictLocal(cfg);
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