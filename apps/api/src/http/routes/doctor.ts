// apps/api/src/http/routes/doctor.ts
//
// Health check endpoint with comprehensive service checks.
// GET /doctor — runs all checks, returns pass/warn/fail report
// POST /doctor/fix — applies safe auto-fixes (create dirs, restart services)

import type { FastifyInstance } from "fastify";
import { mkdir, readdir, stat, readFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { loadConfig } from "@zensquid/core";

const execAsync = promisify(exec);

type StrictSource = "runtime" | "config" | "runtime_onboarding_relaxed";

type Deps = {
  receiptsDir: () => string;
  effectiveStrictLocal: (cfg: any) => Promise<{ effective: boolean; source: StrictSource }>;
  effectiveSafetyZone: (cfg: any) => { effective: any; source: "runtime" | "config" };
};

type CheckStatus = "pass" | "warn" | "fail";
type Check = { id: string; status: CheckStatus; detail: string; fixable?: boolean };

export async function registerDoctorRoutes(app: FastifyInstance, deps: Deps): Promise<void> {

  app.get("/doctor", async (_req, reply) => {
    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const effStrict = await deps.effectiveStrictLocal(cfg);
    const effZone = deps.effectiveSafetyZone(cfg);
    const checks: Check[] = [];

    const pass = (id: string, detail: string) => checks.push({ id, status: "pass", detail });
    const warn = (id: string, detail: string, fixable = false) => checks.push({ id, status: "warn", detail, fixable });
    const fail = (id: string, detail: string, fixable = false) => checks.push({ id, status: "fail", detail, fixable });

    const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();

    // ── Config ────────────────────────────────────────────────────────────────

    if (cfg?.meta?.node) pass("config.node", `node=${cfg.meta.node}`);
    else fail("config.node", "cfg.meta.node missing");

    pass("budgets.strict_local_only", `effective=${effStrict.effective} (source=${effStrict.source})`);
    pass("runtime.safety_zone", `effective=${effZone.effective} (source=${effZone.source})`);

    if (effZone.effective === "godmode") warn("runtime.safety_zone.risk", "godmode enabled");
    else pass("runtime.safety_zone.risk", "zone is conservative");

    // Required tiers check
    const requiredTiers = ["local", "chat"];
    const tierNames = (cfg?.tiers ?? []).map((t: any) => t.name);
    for (const t of requiredTiers) {
      if (tierNames.includes(t)) pass(`config.tier.${t}`, `tier "${t}" defined`);
      else fail(`config.tier.${t}`, `required tier "${t}" missing from config`);
    }

    // ── Directories ───────────────────────────────────────────────────────────

    const requiredDirs = [
      "memory",
      "memory/threads",
      "memory/resume",
      "memory/jobs",
      "memory/resumes",
      "memory/outreach",
      "memory/pipeline",
      "memory/responses",
      "memory/intel",
      "skills",
      "agents",
      "state/receipts",
    ];

    for (const dir of requiredDirs) {
      const abs = path.resolve(repoRoot, dir);
      try {
        await mkdir(abs, { recursive: true });
        pass(`dir.${dir.replace(/\//g, ".")}`, `ok (${dir})`);
      } catch (e: any) {
        fail(`dir.${dir.replace(/\//g, ".")}`, `cannot create: ${String(e?.message ?? e)}`, true);
      }
    }

    // Receipts dir specifically
    try {
      await mkdir(deps.receiptsDir(), { recursive: true });
      pass("receipts.dir", `ok (${deps.receiptsDir()})`);
    } catch (e: any) {
      fail("receipts.dir", `cannot create/read: ${String(e?.message ?? e)}`, true);
    }

    // ── Agents ────────────────────────────────────────────────────────────────

    const agentsDir = path.resolve(repoRoot, "agents");
    try {
      const entries = await readdir(agentsDir, { withFileTypes: true }) as import("node:fs").Dirent[];
      const agentDirs = entries.filter((e) => e.isDirectory());
      let loadable = 0;
      const missing: string[] = [];
      for (const d of agentDirs) {
        const agentMd = path.resolve(agentsDir, d.name, "agent.md");
        try {
          await stat(agentMd);
          loadable++;
        } catch {
          missing.push(d.name);
        }
      }
      if (missing.length > 0) warn("agents.loadable", `${loadable} ok, missing agent.md in: ${missing.join(", ")}`);
      else pass("agents.loadable", `${loadable} agents registered`);
    } catch (e: any) {
      warn("agents.loadable", `cannot read agents dir: ${String(e?.message ?? e)}`);
    }

    // ── Services ──────────────────────────────────────────────────────────────

    // Ollama
    try {
      const r = await fetch(`${(cfg?.providers?.ollama?.base_url ?? "http://127.0.0.1:11434").replace(/\/+$/, "")}/api/tags`,
        { signal: AbortSignal.timeout(5_000) });
      if (!r.ok) fail("ollama.reachable", `HTTP ${r.status} from /api/tags`);
      else {
        const data = await r.json() as any;
        const models = (data?.models ?? []).map((m: any) => m.name);
        pass("ollama.reachable", `ok — ${models.length} model(s) loaded`);
        // Check that the local tier model is actually pulled
        const localTier = (cfg?.tiers ?? []).find((t: any) => t.name === "local");
        if (localTier?.model) {
          const modelLoaded = models.some((m: string) => m.startsWith(localTier.model.split(":")[0]));
          if (modelLoaded) pass("ollama.local_model", `"${localTier.model}" available`);
          else warn("ollama.local_model", `"${localTier.model}" not found in ollama — run: ollama pull ${localTier.model}`);
        }
      }
    } catch (e: any) {
      fail("ollama.reachable", `error: ${String(e?.message ?? e)}`);
    }

    // SearXNG
    try {
      const searxUrl = process.env.SEARXNG_URL ?? "http://127.0.0.1:8080";
      const r = await fetch(`${searxUrl}/search?q=test&format=json`, { signal: AbortSignal.timeout(5_000) });
      if (!r.ok) warn("searxng.reachable", `HTTP ${r.status} — web.search may fail`);
      else pass("searxng.reachable", `ok (${searxUrl})`);
    } catch (e: any) {
      warn("searxng.reachable", `unreachable — web.search will fail: ${String(e?.message ?? e)}`);
    }

    // Web UI
    try {
      const webUrl = process.env.WEB_URL ?? "http://127.0.0.1:3001";
      const r = await fetch(webUrl, { signal: AbortSignal.timeout(5_000) });
      if (!r.ok) warn("web.reachable", `HTTP ${r.status}`);
      else pass("web.reachable", `ok (${webUrl})`);
    } catch (e: any) {
      warn("web.reachable", `unreachable: ${String(e?.message ?? e)}`);
    }

    // ── API Keys ──────────────────────────────────────────────────────────────

    // OpenAI
    let openaiKey = (process.env.OPENAI_API_KEY ?? "").trim();
    if (!openaiKey) {
      const keyFile = (process.env.OPENAI_API_KEY_FILE ?? "").trim();
      if (keyFile) {
        try { openaiKey = (await readFile(keyFile, "utf8")).trim(); } catch {}
      }
    }
    if (openaiKey && openaiKey.length > 10) pass("apikey.openai", "key present");
    else warn("apikey.openai", "OPENAI_API_KEY missing — chat/resume-tailor agents will fail");

    // ModelStudio (DashScope)
    const dashKey = (process.env.DASHSCOPE_API_KEY ?? "").trim();
    if (dashKey && dashKey.length > 10) pass("apikey.modelstudio", "key present");
    else warn("apikey.modelstudio", "DASHSCOPE_API_KEY missing — plan/big_brain tiers unavailable");

    // ── Systemd Services ──────────────────────────────────────────────────────

    for (const svc of ["squidley-api", "squidley-web"]) {
      try {
        const { stdout } = await execAsync(`systemctl --user is-active ${svc}.service`);
        const status = stdout.trim();
        if (status === "active") pass(`systemd.${svc}`, "active");
        else warn(`systemd.${svc}`, `status=${status}`, true);
      } catch {
        warn(`systemd.${svc}`, "not active or not found", true);
      }
    }

    // ── Disk Space ────────────────────────────────────────────────────────────

    try {
      const { stdout } = await execAsync(`df -BG "${repoRoot}" | tail -1 | awk '{print $4}'`);
      const gbFree = parseInt(stdout.trim().replace("G", ""), 10);
      if (isNaN(gbFree)) warn("disk.space", "could not parse df output");
      else if (gbFree < 2) fail("disk.space", `only ${gbFree}GB free — low disk space`);
      else if (gbFree < 10) warn("disk.space", `${gbFree}GB free`);
      else pass("disk.space", `${gbFree}GB free`);
    } catch (e: any) {
      warn("disk.space", `could not check: ${String(e?.message ?? e)}`);
    }

    // ── Memory Files ──────────────────────────────────────────────────────────

    // Check base resume exists
    const resumePath = path.resolve(repoRoot, "memory/resume/base-resume.md");
    try {
      const s = await stat(resumePath);
      if (s.size < 100) warn("memory.resume", "base-resume.md exists but seems very short");
      else pass("memory.resume", `base-resume.md ok (${s.size} bytes)`);
    } catch {
      warn("memory.resume", "memory/resume/base-resume.md missing — resume-tailor will fail");
    }

    // ── Summary ───────────────────────────────────────────────────────────────

    const summary = {
      pass: checks.filter((c) => c.status === "pass").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
    };

    const ok = summary.fail === 0;

    return reply.send({ ok, summary, checks });
  });

  // ── POST /doctor/fix ───────────────────────────────────────────────────────
  // Apply safe fixes: create missing dirs, restart services
  // Requires admin token

  app.post("/doctor/fix", async (req, reply) => {
    const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
    const expectedToken = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();
    if (!expectedToken || adminToken !== expectedToken) {
      return reply.code(403).send({ ok: false, error: "forbidden" });
    }

    const repoRoot = process.env.ZENSQUID_ROOT ?? process.cwd();
    const fixes: Array<{ action: string; status: "ok" | "failed"; detail: string }> = [];

    const requiredDirs = [
      "memory", "memory/threads", "memory/resume", "memory/jobs",
      "memory/resumes", "memory/outreach", "memory/pipeline",
      "memory/responses", "memory/intel", "skills", "agents",
      "state/receipts",
    ];

    for (const dir of requiredDirs) {
      const abs = path.resolve(repoRoot, dir);
      try {
        await mkdir(abs, { recursive: true });
        fixes.push({ action: `mkdir ${dir}`, status: "ok", detail: "created or already exists" });
      } catch (e: any) {
        fixes.push({ action: `mkdir ${dir}`, status: "failed", detail: String(e?.message ?? e) });
      }
    }

    return reply.send({ ok: true, fixes });
  });
}
