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

  const BEGINNER_DEFAULT: RuntimeState = {
    strict_local_only: true,
    safety_zone: "workspace"
  };

  function normalize(parsed: any): RuntimeState {
    return {
      strict_local_only: typeof parsed?.strict_local_only === "boolean" ? parsed.strict_local_only : null,
      safety_zone: isSafetyZone(parsed?.safety_zone) ? parsed.safety_zone : null
    };
  }

  async function loadRuntimeState(): Promise<RuntimeState> {
    try {
      const raw = await readFile(runtimeFile(), "utf-8");
      const parsed = JSON.parse(raw);
      return normalize(parsed);
    } catch {
      // If runtime.json is missing or broken, default to Beginner.
      // We also write it out so future boots are stable and visible on disk.
      await saveRuntimeState(BEGINNER_DEFAULT).catch(() => {});
      return { ...BEGINNER_DEFAULT };
    }
  }

  async function saveRuntimeState(state: RuntimeState): Promise<void> {
    await mkdir(dataDir(), { recursive: true }).catch(() => {});
    await writeFile(runtimeFile(), JSON.stringify(state, null, 2) + "\n", "utf-8");
  }

  return { dataDir, runtimeFile, loadRuntimeState, saveRuntimeState };
}