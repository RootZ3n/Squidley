/**
 * Local provider configuration.
 *
 * Public Squidley speaks only to a local, Ollama-compatible chat endpoint.
 * There is no cloud fallback in this pass — by design.
 *
 * Defaults are set up so a fresh checkout works against a stock Ollama
 * install with `llama3.2` pulled. They can be overridden per-process via
 * environment variables:
 *
 *   SQUIDLEY_LOCAL_ENDPOINT   e.g. http://localhost:11434
 *   SQUIDLEY_LOCAL_MODEL      e.g. llama3.2
 *
 * Both are read on the server only. They are never read from the browser
 * because the chat call is proxied through /api/chat.
 */

export const LOCAL_PROVIDER_ID = "local" as const;
export const DEFAULT_LOCAL_ENDPOINT = "http://localhost:11434";
export const DEFAULT_LOCAL_MODEL = "llama3.2";

export const ENV_KEYS = {
  endpoint: "SQUIDLEY_LOCAL_ENDPOINT",
  model: "SQUIDLEY_LOCAL_MODEL",
} as const;

export interface LocalProviderConfig {
  /** Stable identifier used in receipts, metrics, and UI badges. */
  readonly providerId: typeof LOCAL_PROVIDER_ID;
  /** Base URL of the Ollama-compatible server. No trailing slash. */
  readonly endpoint: string;
  /** Model name passed to the upstream `/api/chat` call. */
  readonly model: string;
  /** Always false in this pass. Encoded as a constant so callers can't
   *  accidentally flip it. */
  readonly cloudUsed: false;
  /** Always false in this pass. */
  readonly toolsUsed: false;
}

function pick(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Build the local provider config from a given env bag (defaults to
 * `process.env` on the server). Pure: no side effects, no I/O.
 */
export function getLocalProviderConfig(
  env: Record<string, string | undefined> = typeof process !== "undefined"
    ? process.env
    : {},
): LocalProviderConfig {
  return {
    providerId: LOCAL_PROVIDER_ID,
    endpoint: stripTrailingSlash(pick(env[ENV_KEYS.endpoint], DEFAULT_LOCAL_ENDPOINT)),
    model: pick(env[ENV_KEYS.model], DEFAULT_LOCAL_MODEL),
    cloudUsed: false,
    toolsUsed: false,
  };
}
