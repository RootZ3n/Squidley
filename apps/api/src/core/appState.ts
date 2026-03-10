// apps/api/src/core/appState.ts
// Helper functions extracted from server.ts
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { makeRuntimePaths, type RuntimeState, type SafetyZone } from "../runtime/state.js";
import { loadCapabilityPolicy } from "../capabilities/policy.js";
import type { ProviderName } from "@zensquid/core";

// ── Path helpers ──────────────────────────────────────────────────────────────
export function zensquidRoot(): string {
  return process.env.ZENSQUID_ROOT ?? process.cwd();
}
export function dataDir(): string {
  return path.join(zensquidRoot(), "data");
}
export function receiptsDir(): string {
  return path.join(dataDir(), "receipts");
}
export function memoryRoot(): string {
  return path.join(zensquidRoot(), "memory");
}
export function soulFile(): string {
  return path.join(zensquidRoot(), "SOUL.md");
}
export function identityFile(): string {
  return path.join(zensquidRoot(), "memory", "identity.md");
}

// ── Type guards ───────────────────────────────────────────────────────────────
export function isSafetyZone(v: unknown): v is SafetyZone {
  return v === "strict" || v === "standard" || v === "forge";
}

// ── Misc helpers ──────────────────────────────────────────────────────────────
export function preview(s: unknown, n = 100): string {
  const str = String(s ?? "");
  return str.length <= n ? str : str.slice(0, n) + "…";
}

export function isLocalProvider(p: ProviderName) {
  return p === "ollama";
}

export async function safeReadText(p: string, maxBytes = 200_000): Promise<string> {
  try {
    const s = await stat(p);
    if (s.size > maxBytes) return `[file too large: ${s.size} bytes]`;
    return await readFile(p, "utf-8");
  } catch {
    return "";
  }
}

export async function listReceiptFiles(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files.filter(f => f.endsWith(".json")).map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

export async function getEffectivePolicy(cfg: any) {
  const zone = effectiveSafetyZone(cfg).effective;
  return loadCapabilityPolicy(zone);
}

export function effectiveSafetyZone(cfg: any): { effective: SafetyZone; source: "runtime" | "config" } {
  // ZenPop is always forge — no other zones exist
  return { effective: "forge", source: "config" };
}

export type StrictSource = "runtime" | "config" | "default";
export async function effectiveStrictLocal(cfg: any): Promise<{ effective: boolean; source: StrictSource }> {
  // strict_local_only is permanently OFF — local model is for heartbeat and tools only
  return { effective: false, source: "config" };
}
