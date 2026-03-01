// apps/api/src/chat/dailyBudget.ts
//
// Tracks daily cloud spend from receipts and enforces daily_usd cap.
// Also enforces nightly_lockout window (no cloud between 10pm-6am by default).

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const COST_PER_1K: Record<string, number> = {
  "gpt-5-mini":            0.00060,
  "gpt-4o-mini":           0.00060,
  "gpt-4o":                0.01250,
  "qwen2.5-plus":          0.00080,
  "qwen3-plus":            0.00080,
  "qwen3-max":             0.00375,
  "qwen3-max-preview":     0.00375,
  "qwen2.5:14b-instruct":  0.00000,
  "qwen2.5:7b":            0.00000,
  "default":               0.00100,
};

function estimateCost(model: string, tokens: number): number {
  const rate = COST_PER_1K[model] ?? COST_PER_1K["default"];
  return (tokens / 1000) * rate;
}

function receiptsDir(): string {
  const root = process.env.ZENSQUID_ROOT ?? process.cwd();
  return path.resolve(root, "state", "receipts");
}

function todayPrefix(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailySpend(): Promise<number> {
  try {
    const dir = receiptsDir();
    const files = await readdir(dir);
    const today = todayPrefix();
    let total = 0;
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(path.join(dir, file), "utf8");
        const receipt = JSON.parse(raw);
        const created = String(receipt?.created_at ?? "");
        if (!created.startsWith(today)) continue;
        const provider = receipt?.decision?.provider ?? "";
        if (provider === "ollama") continue;
        const model = receipt?.decision?.model ?? "default";
        const tokens = (receipt?.tokens_in ?? 500) + (receipt?.tokens_out ?? 300);
        total += estimateCost(model, tokens);
      } catch {}
    }
    return total;
  } catch {
    return 0;
  }
}

export function isNightlyLockout(cfg: any): boolean {
  const lockout = cfg?.budgets?.nightly_lockout;
  if (!lockout?.enabled) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = (lockout.start ?? "22:00").split(":").map(Number);
  const [endH, endM] = (lockout.end ?? "06:00").split(":").map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  if (start > end) return current >= start || current < end;
  return current >= start && current < end;
}

export async function checkDailyBudget(cfg: any, triggeredBy?: string): Promise<{
  allowed: boolean;
  reason?: string;
  spent: number;
  limit: number;
}> {
  const dailyLimit = cfg?.budgets?.daily_usd ?? 999;
  const lockout = cfg?.budgets?.nightly_lockout ?? {};
  const spent = await getDailySpend();

  if (isNightlyLockout(cfg)) {
    const overrideAgents: string[] = lockout.override_agents ?? [];
    const agentName = (triggeredBy ?? "").replace("scheduler:", "");
    if (!overrideAgents.includes(agentName)) {
      return {
        allowed: false,
        reason: `Nightly lockout active (${lockout.start}–${lockout.end}). Cloud disabled.`,
        spent,
        limit: dailyLimit,
      };
    }
  }

  if (spent >= dailyLimit) {
    return {
      allowed: false,
      reason: `Daily cloud budget exhausted ($${spent.toFixed(4)} / $${dailyLimit}). Using local.`,
      spent,
      limit: dailyLimit,
    };
  }

  return { allowed: true, spent, limit: dailyLimit };
}
