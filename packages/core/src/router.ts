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

function isCodeTask(input: string): boolean {
  const s = input.toLowerCase();
  // Explicit code artifacts
  if (
    s.includes("```") ||
    s.includes("diff --git") ||
    s.includes("--- a/") ||
    s.includes("+++ b/") ||
    s.includes("@@ ") ||
    s.includes("stack trace") ||
    s.includes("traceback") ||
    s.includes("tsconfig") ||
    s.includes("package.json") ||
    s.includes("error ts") ||
    s.includes("cannot find module") ||
    s.includes("module not found")
  ) return true;

  // Explicit code task verbs
  const codeVerbs = [
    /\b(write|create|build|generate|implement|code|program)\b.{0,40}\b(function|class|script|component|module|tool|agent|route|endpoint|api|test|spec)\b/i,
    /\b(fix|debug|refactor|update|modify|edit|patch|improve)\b.{0,40}\b(bug|error|issue|code|function|class|file|script)\b/i,
    /\bhow (do|would|should) (i|we|you)\b.{0,40}\b(implement|code|build|write|create)\b/i,
    /\b(add|implement)\b.{0,60}\b(feature|functionality|support|handler|middleware)\b/i,
    /\.(ts|js|py|go|rs|tsx|jsx|sh|bash|mjs|cjs)\b/i,
    /\b(search|grep|rg|ripgrep)\b.{0,40}\b(codebase|code|file|repo|source)\b/i,
  ];
  return codeVerbs.some(p => p.test(s));
}

function isPlanTask(input: string): boolean {
  const s = input.toLowerCase();
  const planVerbs = [
    /\b(plan|design|architect|structure|outline|roadmap|strategy)\b/i,
    /\bhow (should|would|do) (i|we)\b.{0,40}\b(approach|structure|organize|design|build)\b/i,
    /\bwhat('?s| is) the best way to\b/i,
    /\bthink through\b/i,
    /\bbreak (this|it) down\b/i,
  ];
  return planVerbs.some(p => p.test(s));
}

function isBigBrainTask(input: string): boolean {
  const s = input.toLowerCase();
  const bigVerbs = [
    /\b(analyze|analyse|evaluate|assess|compare|review|audit)\b.{0,40}\b(architecture|system|codebase|design|tradeoffs?)\b/i,
    /\bdeep dive\b/i,
    /\bcomprehensive\b/i,
    /\bfull (analysis|review|audit|report)\b/i,
  ];
  return bigVerbs.some(p => p.test(s));
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
 * - Prefer tier named "chat", then "mini"
 * - Otherwise first non-local tier, then tiers[0]
 */
function primaryTier(tiers: TierConfig[]): TierConfig {
  return (
    pickByName(tiers, "local") ??
    tiers.find((t) => providerIsLocal(t.provider)) ??
    pickByName(tiers, "chat") ??
    tiers[0]
  );
}

export function chooseTier(cfg: ZenSquidConfig, req: ChatRequest): TierDecision {
  const tiers = cfg.tiers;
  const localBaseline = localBaselineTier(tiers);
  const primary = primaryTier(tiers);

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

  // 2) Mode handling
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

  // 3) Auto routing — most specific first
  if (isBigBrainTask(req.input)) {
    const bigBrain = pickByName(tiers, "big_brain");
    if (bigBrain) return finalize(bigBrain, "auto: big_brain selected (deep analysis)");
  }

  if (isCodeTask(req.input)) {
  const coderTier = pickByName(tiers, "coder") ?? pickByName(tiers, "build") ?? localBaseline;
  return finalize(coderTier, "auto: coder tier selected (code task)");
}

  if (isPlanTask(req.input)) {
    const planTier = pickByName(tiers, "plan");
    if (planTier) return finalize(planTier, "auto: plan tier selected (planning task)");
  }

  // Default = primary (chat tier)
  return finalize(primary, "auto: primary selected");
}
