import type { ChatRequest, TierConfig, ZenSquidConfig } from "./types.js";

export type TierDecision = {
  tier: TierConfig;
  escalated: boolean;
  escalation_reason?: string;
};

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

function providerIsLocal(provider: string): boolean {
  return provider === "ollama";
}

function isCodey(input: string): boolean {
  const s = input.toLowerCase();
  return (
    s.includes("```") ||
    s.includes("diff --git") ||
    s.includes("--- a/") ||
    s.includes("+++ b/") ||
    s.includes("@@ ") ||
    s.includes("stack trace") ||
    s.includes("traceback")
  );
}

function pickByName(tiers: TierConfig[], name: string): TierConfig | undefined {
  const wanted = normalizeName(name);
  return tiers.find((t) => normalizeName(t.name) === wanted);
}

function localBaselineTier(tiers: TierConfig[]): TierConfig {
  return tiers.find((t) => providerIsLocal(t.provider)) ?? tiers[0];
}

/**
 * Primary tier:
 * - Prefer tier named "mini"
 * - Otherwise first tier
 */
function primaryTier(tiers: TierConfig[]): TierConfig {
  return pickByName(tiers, "mini") ?? tiers[0];
}

export function chooseTier(cfg: ZenSquidConfig, req: ChatRequest): TierDecision {
  const tiers = cfg.tiers;
  const localBaseline = localBaselineTier(tiers);
  const primary = primaryTier(tiers);

  // budgets.strict_local_only exists at runtime, but your TS type doesn’t include it yet.
  const strictLocalOnly = !!((cfg as any).budgets?.strict_local_only);

  const finalize = (picked: TierConfig, reason: string): TierDecision => {
    if (strictLocalOnly && !providerIsLocal(picked.provider)) {
      return {
        tier: localBaseline,
        escalated: normalizeName(localBaseline.name) !== normalizeName(primary.name),
        escalation_reason: `blocked: strict_local_only enabled (wanted ${picked.name})`
      };
    }

    return {
      tier: picked,
      escalated: normalizeName(picked.name) !== normalizeName(primary.name),
      escalation_reason: reason
    };
  };

  // 1) Explicit force_tier always wins if it matches a known tier
  if (req.force_tier) {
    const match = pickByName(tiers, req.force_tier);
    if (match) return finalize(match, `forced: tier=${match.name}`);
  }

  // 2) Mode handling (schema-compatible)
  if (req.mode === "force_local") {
    return finalize(localBaseline, "mode: force_local");
  }

  if (req.mode === "force_tier") {
    return finalize(
      localBaseline,
      req.force_tier
        ? `mode: force_tier (unknown tier=${req.force_tier})`
        : "mode: force_tier (missing force_tier)"
    );
  }

  // 3) Auto routing
  if (isCodey(req.input)) {
    const coder = pickByName(tiers, "coder") ?? localBaseline;
    return finalize(coder, "auto: coder selected (diff/patch/code fences)");
  }

  // Default = primary (usually tier name "mini")
  return finalize(primary, "auto: primary selected");
}
