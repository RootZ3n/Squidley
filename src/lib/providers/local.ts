/**
 * Local provider configuration.
 *
 * Peh speaks only to a local chat endpoint — either Ollama
 * (default) or llama-server (llama.cpp). There is no cloud fallback in
 * this pass — by design.
 *
 * Defaults are set up so a fresh checkout works against a stock Ollama
 * install with `llama3.2` pulled. They can be overridden per-process via
 * environment variables (canonical PEH_* names; legacy SQUIDLEY_* names are
 * still honored as a fallback — see src/lib/compat/env.ts):
 *
 *   PEH_LOCAL_ENDPOINT   e.g. http://localhost:11434
 *   PEH_LOCAL_MODEL      e.g. llama3.2
 *   PEH_LOCAL_BACKEND    "ollama" | "llama-cpp" | "auto" (default: "auto")
 *
 * All are read on the server only. They are never read from the browser
 * because the chat call is proxied through /api/chat.
 */

import { readEnv } from "../compat/env";

export const LOCAL_PROVIDER_ID = "local" as const;
export const DEFAULT_LOCAL_ENDPOINT = "http://localhost:11434";
export const DEFAULT_LOCAL_MODEL = "llama3.2";
export const DEFAULT_LLAMACPP_ENDPOINT = "http://localhost:8080";
export const LOCAL_FETCH_TIMEOUT_MS = 30_000;

export type LocalBackendType = "ollama" | "llama-cpp" | "auto";

/**
 * Legacy env var names. New code reads through {@link readEnv} so the
 * canonical `PEH_LOCAL_*` names are preferred and these are honored as a
 * fallback (peh-pub migration compatibility).
 */
export const ENV_KEYS = {
  endpoint: "SQUIDLEY_LOCAL_ENDPOINT",
  model: "SQUIDLEY_LOCAL_MODEL",
  backend: "SQUIDLEY_LOCAL_BACKEND",
} as const;

export interface LocalProviderConfig {
  /** Stable identifier used in receipts, metrics, and UI badges. */
  readonly providerId: typeof LOCAL_PROVIDER_ID;
  /** Base URL of the local server. No trailing slash. */
  readonly endpoint: string;
  /** Model name passed to the upstream chat call. */
  readonly model: string;
  /** Which local backend API to use. "auto" means detect at runtime. */
  readonly backendType: LocalBackendType;
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

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

export function isAllowedLocalEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "::1" || host === "[::1]") return true;
    if (host.endsWith(".local")) return true;
    if (isPrivateIpv4(host)) return true;
    // IPv6 unique-local/link-local ranges. Keep this conservative: no public
    // DNS hostnames, no public IPs, no HTTPS cloud endpoints.
    if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
    return false;
  } catch {
    return false;
  }
}

function pickLocalEndpoint(value: string | undefined, fallback: string): string {
  const endpoint = stripTrailingSlash(pick(value, fallback));
  return isAllowedLocalEndpoint(endpoint) ? endpoint : fallback;
}

export async function fetchLocalWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number = LOCAL_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const request = fetchImpl(input, { ...init, signal: controller.signal });
    const timeoutRejection = new Promise<Response>((_, reject) => {
      const onAbort = () => reject(new DOMException("Local provider request timed out.", "AbortError"));
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    return await Promise.race([request, timeoutRejection]);
  } finally {
    clearTimeout(timeout);
  }
}

function parseBackendType(value: string | undefined): LocalBackendType {
  if (typeof value !== "string") return "auto";
  const lower = value.trim().toLowerCase();
  if (lower === "ollama") return "ollama";
  if (lower === "llama-cpp" || lower === "llamacpp" || lower === "llama.cpp") return "llama-cpp";
  return "auto";
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
  const backendType = parseBackendType(readEnv(env, "localBackend"));
  const defaultEndpoint =
    backendType === "llama-cpp" ? DEFAULT_LLAMACPP_ENDPOINT : DEFAULT_LOCAL_ENDPOINT;
  return {
    providerId: LOCAL_PROVIDER_ID,
    endpoint: pickLocalEndpoint(readEnv(env, "localEndpoint"), defaultEndpoint),
    model: pick(readEnv(env, "localModel"), DEFAULT_LOCAL_MODEL),
    backendType,
    cloudUsed: false,
    toolsUsed: false,
  };
}
