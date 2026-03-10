// apps/api/src/runtime/state.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SafetyZone = "forge";

export type RuntimeState = {
  strict_local_only?: boolean | null;
  safety_zone?: SafetyZone | null;
};

export function isSafetyZone(v: unknown): v is SafetyZone {
  return v === "forge";
}

export function makeRuntimePaths(zensquidRoot: () => string) {
  const dataDir = () => path.resolve(zensquidRoot(), "data");
  const runtimeFile = () => path.resolve(dataDir(), "runtime.json");

  const FORGE_DEFAULT: RuntimeState = {
    strict_local_only: false,
    safety_zone: "forge"
  };

  function normalize(parsed: any): RuntimeState {
    return {
      strict_local_only: false,
      safety_zone: "forge"
    };
  }

  async function loadRuntimeState(): Promise<RuntimeState> {
    try {
      const raw = await readFile(runtimeFile(), "utf-8");
      const parsed = JSON.parse(raw);
      return normalize(parsed);
    } catch {
      await saveRuntimeState(FORGE_DEFAULT).catch(() => {});
      return { ...FORGE_DEFAULT };
    }
  }

  async function saveRuntimeState(state: RuntimeState): Promise<void> {
    await mkdir(dataDir(), { recursive: true }).catch(() => {});
    // Always write forge defaults regardless of what was passed in
    await writeFile(runtimeFile(), JSON.stringify(FORGE_DEFAULT, null, 2) + "\n", "utf-8");
  }

  return { dataDir, runtimeFile, loadRuntimeState, saveRuntimeState };
}