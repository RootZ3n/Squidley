// apps/api/src/scheduler.ts
//
// Squidley heartbeat scheduler.
// Reads config/schedules.json and runs agents on cron expressions.
// Integrates with the agent runner — no separate process needed.
//
// Surfaces scheduled runs in the next chat session via pendingBriefings.

import { Cron } from "croner";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { sendTelegramMessage } from "./http/routes/telegram.js";

export type ScheduleEntry = {
  id: string;
  agent: string;
  cron: string;
  enabled: boolean;
  label: string;
  focus?: string | null;
  last_run?: string | null;
  last_result?: "pass" | "fail" | "skip" | null;
};

export type SchedulesConfig = {
  schedules: ScheduleEntry[];
  _comment?: string;
};

// In-memory store of briefings to surface in next chat session
const pendingBriefings: Array<{
  agent: string;
  ran_at: string;
  steps_ran: number;
  pass: number;
  fail: number;
  summary: string;
}> = [];

export function getPendingBriefings() {
  return [...pendingBriefings];
}

export function clearPendingBriefings() {
  pendingBriefings.length = 0;
}

function schedulesPath(): string {
  const root = process.env.ZENSQUID_ROOT ?? process.cwd();
  return path.resolve(root, "config", "schedules.json");
}

async function loadSchedules(): Promise<SchedulesConfig> {
  try {
    const raw = await readFile(schedulesPath(), "utf8");
    return JSON.parse(raw) as SchedulesConfig;
  } catch {
    return { schedules: [] };
  }
}

async function saveSchedule(updated: ScheduleEntry): Promise<void> {
  const cfg = await loadSchedules();
  const idx = cfg.schedules.findIndex((s) => s.id === updated.id);
  if (idx >= 0) cfg.schedules[idx] = updated;
  await writeFile(schedulesPath(), JSON.stringify(cfg, null, 2), "utf8");
}

async function runScheduledAgent(
  entry: ScheduleEntry,
  app: FastifyInstance
): Promise<void> {
  const ran_at = new Date().toISOString();
  console.log(`[scheduler] ▶ running agent "${entry.agent}" (schedule: ${entry.id})`);

  try {
    const res = await app.inject({
      method: "POST",
      url: "/autonomy/agent/run",
      headers: {
        "content-type": "application/json",
        "x-zensquid-admin-token": process.env.ZENSQUID_ADMIN_TOKEN ?? "",
      },
      payload: JSON.stringify({
        agent: entry.agent,
        focus: entry.focus ?? undefined,
        triggered_by: `scheduler:${entry.id}`,
      }),
    });

    const result = res.json() as any;
    const pass = result?.pass ?? 0;
    const fail = result?.fail ?? 0;
    const steps_ran = result?.steps_ran ?? 0;
    const summary = result?.summary ?? "";

    console.log(
      `[scheduler] ✓ ${entry.agent} — ${steps_ran} steps, ${pass} pass, ${fail} fail`
    );

    // Queue briefing for next chat session
    const briefing = {
      agent: entry.agent,
      ran_at,
      steps_ran,
      pass,
      fail,
      summary: summary.slice(0, 500),
    };
    pendingBriefings.push(briefing);

    // Push to Telegram proactively
    const status = fail > 0 ? "⚠️" : "✅";
    await sendTelegramMessage(
      `${status} *${entry.agent}* finished\n${pass}/${steps_ran} steps passed\n\n${summary.slice(0, 400)}`
    ).catch(() => {});

    // Update last_run in schedules.json
    await saveSchedule({
      ...entry,
      last_run: ran_at,
      last_result: fail > 0 ? "fail" : "pass",
    });
  } catch (e: any) {
    console.error(`[scheduler] ✗ ${entry.agent} failed: ${String(e?.message ?? e)}`);
    await saveSchedule({
      ...entry,
      last_run: ran_at,
      last_result: "fail",
    });
  }
}

// Active cron jobs (so we can stop them on shutdown)
const activeJobs: Cron[] = [];

export async function startScheduler(app: FastifyInstance): Promise<void> {
  const cfg = await loadSchedules();
  const enabled = cfg.schedules.filter((s) => s.enabled);

  if (enabled.length === 0) {
    console.log("[scheduler] no enabled schedules — heartbeat idle");
    return;
  }

  console.log(`[scheduler] starting ${enabled.length} schedule(s)`);

  for (const entry of enabled) {
    try {
      const job = new Cron(entry.cron, { timezone: "America/Chicago" }, async () => {
        await runScheduledAgent(entry, app);
      });
      activeJobs.push(job);
      console.log(`[scheduler] ✓ scheduled "${entry.id}" (${entry.cron}) — ${entry.label}`);
    } catch (e: any) {
      console.error(`[scheduler] ✗ invalid cron for "${entry.id}": ${String(e?.message ?? e)}`);
    }
  }
}

export function stopScheduler(): void {
  for (const job of activeJobs) {
    job.stop();
  }
  activeJobs.length = 0;
  console.log("[scheduler] stopped");
}

// Route: GET /scheduler/status
// Route: POST /scheduler/run/:id  (manual trigger)
// Route: PATCH /scheduler/schedule/:id  (enable/disable)
export async function registerSchedulerRoutes(app: FastifyInstance): Promise<void> {
  // GET /scheduler/status
  app.get("/scheduler/status", async (_req, reply) => {
    const cfg = await loadSchedules();
    return reply.send({
      ok: true,
      active_jobs: activeJobs.length,
      pending_briefings: pendingBriefings.length,
      schedules: cfg.schedules.map((s) => ({
        id: s.id,
        agent: s.agent,
        label: s.label,
        cron: s.cron,
        enabled: s.enabled,
        last_run: s.last_run ?? null,
        last_result: s.last_result ?? null,
      })),
    });
  });

  // POST /scheduler/run/:id — manual trigger (admin only)
  app.post("/scheduler/run/:id", async (req, reply) => {
    const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
    const expectedToken = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();
    if (!expectedToken || adminToken !== expectedToken) {
      return reply.code(403).send({ ok: false, error: "forbidden" });
    }

    const { id } = req.params as { id: string };
    const cfg = await loadSchedules();
    const entry = cfg.schedules.find((s) => s.id === id);
    if (!entry) return reply.code(404).send({ ok: false, error: `schedule "${id}" not found` });

    // Run immediately regardless of enabled state
    setImmediate(() => runScheduledAgent(entry, app));
    return reply.send({ ok: true, message: `triggered "${id}"` });
  });

  // PATCH /scheduler/schedule/:id — enable or disable a schedule
  app.patch("/scheduler/schedule/:id", async (req, reply) => {
    const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
    const expectedToken = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();
    if (!expectedToken || adminToken !== expectedToken) {
      return reply.code(403).send({ ok: false, error: "forbidden" });
    }

    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as any;
    const cfg = await loadSchedules();
    const entry = cfg.schedules.find((s) => s.id === id);
    if (!entry) return reply.code(404).send({ ok: false, error: `schedule "${id}" not found` });

    if (typeof body.enabled === "boolean") entry.enabled = body.enabled;
    if (typeof body.cron === "string") entry.cron = body.cron;
    if (typeof body.focus === "string") entry.focus = body.focus;

    await saveSchedule(entry);
    return reply.send({ ok: true, schedule: entry });
  });

  // GET /scheduler/briefings — what ran while you were away
  app.get("/scheduler/briefings", async (_req, reply) => {
    const briefings = getPendingBriefings();
    return reply.send({ ok: true, count: briefings.length, briefings });
  });

  // DELETE /scheduler/briefings — mark as read
  app.delete("/scheduler/briefings", async (_req, reply) => {
    clearPendingBriefings();
    return reply.send({ ok: true });
  });
}
