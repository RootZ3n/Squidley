// apps/api/src/http/routes/runtime.ts
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@zensquid/core";
import { type RuntimeState, type SafetyZone } from "../../runtime/state.js";
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

  getOnboarding: () => Promise<{ completed: boolean }>;
};

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

  async function onboardingCompleted(): Promise<boolean> {
    try {
      const o = await deps.getOnboarding();
      return Boolean(o?.completed);
    } catch {
      return false;
    }
  }

  /**
   * GET /status
   * UI + CLI friendly status. Zone is always forge. Strict local is always off.
   */
  app.get("/status", async () => {
    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const build = getBuildInfo();

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

    const hbModel =
      String(process.env.ZENSQUID_HEARTBEAT_MODEL ?? "").trim() ||
      String((cfg as any)?.heartbeat?.model ?? "").trim() ||
      "qwen2.5:7b-instruct";

    const heartbeat = classifyModel("ollama", hbModel);

    // Always prefer the chat tier as recommended — never local
    const recommended =
      mappedTiers.find((t: any) => t.name === "chat") ??
      mappedTiers.find((t: any) => String(t.provider).toLowerCase() !== "ollama") ??
      mappedTiers[0] ??
      null;

    return {
      ok: true,
      build,
      meta: {
        name: (cfg as any)?.meta?.name ?? "Squidley",
        node: (cfg as any)?.meta?.node ?? null,
        local_first: false,
        build
      },
      onboarding: {
        completed: await onboardingCompleted()
      },
      runtime: deps.getState(),
      effective: {
        strict_local_only: false,
        strict_local_only_source: "config",
        safety_zone: "forge",
        safety_zone_source: "config"
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

  /**
   * GET /runtime
   * Returns current runtime state. Zone is always forge, strict always off.
   */
  app.get("/runtime", async () => {
    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const build = getBuildInfo();

    return {
      ok: true,
      build,
      runtime: deps.getState(),
      effective: {
        strict_local_only: false,
        strict_local_only_source: "config",
        safety_zone: "forge",
        safety_zone_source: "config"
      }
    };
  });

  /**
   * GET /runtime/effective_policy
   */
  app.get("/runtime/effective_policy", async () => {
    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const eff = await deps.getEffectivePolicy(cfg);

    return {
      ok: true,
      runtime: deps.getState(),
      effective: {
        strict_local_only: false,
        strict_local_only_source: "config",
        safety_zone: "forge",
        safety_zone_source: "config"
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