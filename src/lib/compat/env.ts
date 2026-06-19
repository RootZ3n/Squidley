/**
 * Environment-variable compatibility layer (peh-pub migration).
 *
 * Peh is the active public identity; Squidley is retained for compatibility.
 * Every environment variable that used to be named `SQUIDLEY_*` now has a
 * canonical `PEH_*` name. This helper reads the canonical (PEH_*) name first
 * and transparently falls back to the legacy (SQUIDLEY_*) name so that:
 *
 *   - existing `.env.local` files keep working,
 *   - existing systemd units / shell exports keep working,
 *   - the migration is reversible (we never rewrite the user's environment).
 *
 * Pure: no I/O, no process.env access of its own — callers pass an env bag.
 */

/** A canonical env var paired with its legacy Squidley-era name. */
export interface EnvVarAlias {
  /** Canonical Peh-era name, read first. */
  readonly current: string;
  /** Legacy Squidley-era name, read as a fallback. */
  readonly legacy: string;
}

/**
 * Canonical env var aliases for the public app. New code should reference
 * these rather than hardcoding either name, so the fallback is guaranteed.
 */
export const ENV_ALIASES = {
  mode: { current: "PEH_MODE", legacy: "SQUIDLEY_MODE" },
  localEndpoint: { current: "PEH_LOCAL_ENDPOINT", legacy: "SQUIDLEY_LOCAL_ENDPOINT" },
  localModel: { current: "PEH_LOCAL_MODEL", legacy: "SQUIDLEY_LOCAL_MODEL" },
  localBackend: { current: "PEH_LOCAL_BACKEND", legacy: "SQUIDLEY_LOCAL_BACKEND" },
  chatBase: { current: "PEH_CHAT_BASE", legacy: "SQUIDLEY_CHAT_BASE" },
  inspectionRoot: { current: "PEH_INSPECTION_ROOT", legacy: "SQUIDLEY_INSPECTION_ROOT" },
} as const satisfies Record<string, EnvVarAlias>;

export type EnvAliasKey = keyof typeof ENV_ALIASES;

function nonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().length > 0 ? value : undefined;
}

/**
 * Read an aliased env var from a bag: canonical (PEH_*) first, legacy
 * (SQUIDLEY_*) second. Returns the raw string (untrimmed) of whichever name
 * is set to a non-empty value, or `undefined` if neither is set.
 */
export function readAliasedEnv(
  env: Record<string, string | undefined>,
  alias: EnvVarAlias,
): string | undefined {
  const current = nonEmpty(env[alias.current]);
  if (current !== undefined) return current;
  return nonEmpty(env[alias.legacy]);
}

/** Convenience reader keyed by {@link ENV_ALIASES}. */
export function readEnv(
  env: Record<string, string | undefined>,
  key: EnvAliasKey,
): string | undefined {
  return readAliasedEnv(env, ENV_ALIASES[key]);
}

/**
 * Report which name supplied the value — useful for diagnostics and for
 * surfacing a one-time deprecation note when the legacy name is used.
 */
export function resolveAliasedEnv(
  env: Record<string, string | undefined>,
  alias: EnvVarAlias,
): { value: string | undefined; source: "current" | "legacy" | "unset" } {
  if (nonEmpty(env[alias.current]) !== undefined) {
    return { value: env[alias.current], source: "current" };
  }
  if (nonEmpty(env[alias.legacy]) !== undefined) {
    return { value: env[alias.legacy], source: "legacy" };
  }
  return { value: undefined, source: "unset" };
}
