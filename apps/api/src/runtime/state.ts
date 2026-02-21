// apps/api/src/runtime/state.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SafetyZone = "workspace" | "diagnostics" | "forge" | "godmode";

export type RuntimeState = {
  strict_local_only?: boolean | null;
  safety_zone?: SafetyZone | null;
};

export function isSafetyZone(v: unknown): v is SafetyZone {
  return v === "workspace" || v === "diagnostics" || v === "forge" || v === "godmode";
}

export function makeRuntimePaths(zensquidRoot: () => string) {
  const dataDir = () => path.resolve(zensquidRoot(), "data");
  const runtimeFile = () => path.resolve(dataDir(), "runtime.json");

  async function loadRuntimeState(): Promise<RuntimeState> {
    try {
      const raw = await readFile(runtimeFile(), "utf-8");
      const parsed = JSON.parse(raw) as RuntimeState;
      return {
        strict_local_only: typeof parsed.strict_local_only === "boolean" ? parsed.strict_local_only : null,
        safety_zone: isSafetyZone(parsed.safety_zone) ? parsed.safety_zone : null
      };
    } catch {
      return { strict_local_only: null, safety_zone: null };
    }
  }

  async function saveRuntimeState(state: RuntimeState): Promise<void> {
    await mkdir(dataDir(), { recursive: true }).catch(() => {});
    await writeFile(runtimeFile(), JSON.stringify(state, null, 2) + "\n", "utf-8");
  }

  return { dataDir, runtimeFile, loadRuntimeState, saveRuntimeState };
}