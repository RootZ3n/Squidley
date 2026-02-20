import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ZenSquidConfig } from "./types.js";

export async function loadConfig(configPath?: string): Promise<ZenSquidConfig> {
  const p = configPath
    ? path.resolve(configPath)
    : path.resolve(process.cwd(), "config", "zensquid.config.json");

  const raw = await readFile(p, "utf-8");
  const cfg = JSON.parse(raw) as ZenSquidConfig;

  if (!cfg?.tiers?.length) {
    throw new Error(`Invalid config: missing tiers in ${p}`);
  }
  if (!cfg.providers?.ollama?.base_url) {
    throw new Error(`Invalid config: missing providers.ollama.base_url in ${p}`);
  }
  return cfg;
}
