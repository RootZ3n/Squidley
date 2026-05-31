/**
 * Central mode resolver for Peh.
 *
 * Determines the operating mode from config/env. Defaults to local.
 * Cloud mode requires EXPLICIT activation — API keys alone do not enable it.
 *
 * Resolution order:
 *   1. Explicit PEH_MODE env var (legacy PEH_MODE honored as fallback)
 *   2. Explicit config setting (future: UI-saved setting)
 *   3. Default: "local"
 *
 * Cloud mode activation requires:
 *   - PEH_MODE=cloud (or equivalent explicit config)
 *   - At least one cloud provider configured (checked separately)
 *   - Invalid mode values fall back to "local" (fail closed)
 */

import type { PehMode, ModeState } from "./types";
import { LOCAL_MODE_STATE, CLOUD_MODE_STATE } from "./types";
import { ENV_ALIASES, resolveAliasedEnv } from "../compat/env";

/**
 * Legacy mode env var name. Reads go through {@link ENV_ALIASES.mode} so the
 * canonical `PEH_MODE` is preferred with `PEH_MODE` honored as a fallback
 * (peh-pub migration compatibility).
 */
export const ENV_KEY_MODE = "PEH_MODE" as const;

/**
 * Known cloud API key env vars. Their presence alone does NOT enable cloud mode.
 * They are checked only to determine if a cloud provider is configured AFTER
 * cloud mode is explicitly enabled.
 */
export const CLOUD_API_KEY_ENV_VARS = [
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "MINIMAX_API_KEY",
  "ZAI_API_KEY",
] as const;

function parseMode(value: string | undefined): PehMode {
  if (typeof value !== "string") return "local";
  const lower = value.trim().toLowerCase();
  if (lower === "cloud") return "cloud";
  // All other values including invalid ones fall back to local (fail closed)
  return "local";
}

export interface ModeResolverInput {
  /** Environment variable bag. Defaults to process.env on server. */
  env?: Record<string, string | undefined>;
  /** Explicit mode override from UI/config. Takes precedence over env. */
  explicitMode?: PehMode;
}

export interface ModeResolution {
  /** The resolved mode state. */
  state: ModeState;
  /** How the mode was determined. */
  source: "explicit-config" | "env-var" | "default";
  /** Whether any cloud API keys are present in the environment. */
  cloudApiKeysPresent: boolean;
  /** Which cloud API key env vars are set (names only, not values). */
  cloudApiKeysFound: readonly string[];
  /** Diagnostic reasons for the resolution. */
  reasons: readonly string[];
}

/**
 * Resolve the operating mode. Pure function, no I/O.
 *
 * Critical invariant: API keys alone NEVER enable cloud mode.
 */
export function resolveMode(input: ModeResolverInput = {}): ModeResolution {
  const env = input.env ?? (typeof process !== "undefined" ? process.env : {});
  const reasons: string[] = [];

  // Check for cloud API keys (informational only)
  const cloudApiKeysFound = CLOUD_API_KEY_ENV_VARS.filter(
    (key) => typeof env[key] === "string" && env[key]!.trim().length > 0,
  );
  const cloudApiKeysPresent = cloudApiKeysFound.length > 0;

  // 1. Explicit config override (highest priority)
  if (input.explicitMode) {
    const mode = input.explicitMode;
    reasons.push(`Mode set by explicit config: ${mode}`);
    if (mode === "cloud" && cloudApiKeysPresent) {
      reasons.push(`Cloud API keys found: ${cloudApiKeysFound.join(", ")}`);
    } else if (mode === "cloud" && !cloudApiKeysPresent) {
      reasons.push("Cloud mode requested but no cloud API keys found.");
    }
    if (mode === "local" && cloudApiKeysPresent) {
      reasons.push(
        `Cloud API keys present (${cloudApiKeysFound.join(", ")}) but mode is local. Keys do not unlock cloud.`,
      );
    }
    return {
      state: mode === "cloud" ? CLOUD_MODE_STATE : LOCAL_MODE_STATE,
      source: "explicit-config",
      cloudApiKeysPresent,
      cloudApiKeysFound,
      reasons,
    };
  }

  // 2. Environment variable (PEH_MODE preferred, PEH_MODE fallback)
  const modeEnv = resolveAliasedEnv(env, ENV_ALIASES.mode);
  const modeRaw = modeEnv.value;
  const modeVarName = modeEnv.source === "legacy" ? ENV_ALIASES.mode.legacy : ENV_ALIASES.mode.current;
  const envMode = parseMode(modeRaw);
  if (typeof modeRaw === "string" && modeRaw.trim().length > 0) {
    reasons.push(`Mode set by ${modeVarName}=${modeRaw}: resolved to ${envMode}`);
    if (envMode === "local" && cloudApiKeysPresent) {
      reasons.push(
        `Cloud API keys present (${cloudApiKeysFound.join(", ")}) but mode is local. Keys do not unlock cloud.`,
      );
    }
    return {
      state: envMode === "cloud" ? CLOUD_MODE_STATE : LOCAL_MODE_STATE,
      source: "env-var",
      cloudApiKeysPresent,
      cloudApiKeysFound,
      reasons,
    };
  }

  // 3. Default: local
  reasons.push("No explicit mode set. Defaulting to local.");
  if (cloudApiKeysPresent) {
    reasons.push(
      `Cloud API keys present (${cloudApiKeysFound.join(", ")}) but mode is local by default. Keys alone do not enable cloud mode.`,
    );
  }
  return {
    state: LOCAL_MODE_STATE,
    source: "default",
    cloudApiKeysPresent,
    cloudApiKeysFound,
    reasons,
  };
}

/**
 * Quick helper: is the resolved mode local?
 */
export function isLocalMode(input?: ModeResolverInput): boolean {
  return resolveMode(input).state.mode === "local";
}

/**
 * Quick helper: is the resolved mode cloud?
 */
export function isCloudMode(input?: ModeResolverInput): boolean {
  return resolveMode(input).state.mode === "cloud";
}
