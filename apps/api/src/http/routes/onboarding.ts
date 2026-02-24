// apps/api/src/http/routes/onboarding.ts
import type { FastifyInstance } from "fastify";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Deps = {
  adminTokenOk: (req: any) => boolean;
  dataDir: () => string;

  // Reuse your existing preset applier (so behavior stays consistent)
  applyPresetByName: (
    name: string,
    opts?: { req?: any; confirm?: string | null; godmodePassword?: string | null }
  ) => Promise<{ ok: boolean; error?: string; runtime?: any; preset?: string }>;
};

export type OnboardingStateV1 = {
  schema: "squidley.onboarding.v1";
  completed: boolean;
  completed_at: string | null;
  version: number;
};

export type OnboardingMission = {
  id: string;
  title: string;
  difficulty: "starter" | "easy" | "medium";
  eta_minutes: number;
  teaches: string[];
  definition_of_done: string[];
};

export type OnboardingContentV1 = {
  schema: "squidley.onboarding.content.v1";
  version: number;
  principles: { title: string; body: string }[];
  quick_commands: { title: string; cmd: string; note?: string }[];
  starter_missions: OnboardingMission[];
};

function onboardingFile(dataDir: string): string {
  return path.resolve(dataDir, "onboarding.json");
}

async function loadOnboarding(dataDir: string): Promise<OnboardingStateV1> {
  try {
    const raw = await readFile(onboardingFile(dataDir), "utf-8");
    const parsed = JSON.parse(raw) as Partial<OnboardingStateV1>;
    return {
      schema: "squidley.onboarding.v1",
      completed: Boolean(parsed.completed),
      completed_at: typeof parsed.completed_at === "string" ? parsed.completed_at : null,
      version: typeof parsed.version === "number" ? parsed.version : 1
    };
  } catch {
    return {
      schema: "squidley.onboarding.v1",
      completed: false,
      completed_at: null,
      version: 1
    };
  }
}

async function saveOnboarding(dataDir: string, state: OnboardingStateV1): Promise<void> {
  await mkdir(dataDir, { recursive: true }).catch(() => {});
  await writeFile(onboardingFile(dataDir), JSON.stringify(state, null, 2) + "\n", "utf-8");
}

function buildOnboardingContent(): OnboardingContentV1 {
  return {
    schema: "squidley.onboarding.content.v1",
    version: 1,
    principles: [
      {
        title: "Local-first by default",
        body: "Squidley is designed to stay local-first. Cloud escalation should be explicit and visible, not silent."
      },
      {
        title: "Allowlisted tools only",
        body: "Tools run through an allowlist, with safe argument handling (no shell). If it’s not allowlisted, it doesn’t run."
      },
      {
        title: "Receipts over vibes",
        body: "Every meaningful action should leave a receipt (tool runs, important state changes). Debugging starts with receipts."
      },
      {
        title: "Training wheels",
        body: "Beginner mode should be safe and predictable. Advanced power is opt-in with clear warnings."
      }
    ],
    quick_commands: [
      { title: "Health", cmd: `curl -fsS http://127.0.0.1:18790/health | jq`, note: "API should say ok:true" },
      { title: "Tools list", cmd: `curl -fsS http://127.0.0.1:18790/tools/list | jq`, note: "Confirm allowlist" },
      { title: "Latest receipt", cmd: `curl -fsS "http://127.0.0.1:18790/receipts?limit=1" | jq`, note: "Quick regression check" },
      { title: "Smoke test", cmd: `pnpm smoke`, note: "Restarts API, checks endpoints, builds web, runs Playwright" }
    ],
    starter_missions: [
      {
        id: "m0-first-contact",
        title: "First Contact: run a safe tool plan",
        difficulty: "starter",
        eta_minutes: 10,
        teaches: ["Admin token usage", "Tool allowlist", "Receipts"],
        definition_of_done: [
          "Open Tool Loop tab",
          "Enter admin token",
          "Run plan with git.status and git.log",
          "Copy a receipt_id from results"
        ]
      },
      {
        id: "m1-receipts-panel",
        title: "Receipts Inspector (UI)",
        difficulty: "easy",
        eta_minutes: 25,
        teaches: ["API fetch", "UI state/rendering", "Trust receipts"],
        definition_of_done: [
          "UI shows last 20 receipts",
          "Click one → shows details (later enhancement)",
          "Playwright test asserts receipts list renders"
        ]
      },
      {
        id: "m2-new-tool",
        title: "Add a new allowlisted tool",
        difficulty: "easy",
        eta_minutes: 30,
        teaches: ["Tool allowlist shape", "Runner restrictions", "Safe args"],
        definition_of_done: [
          "Add new tool entry to allowlist",
          "Tool shows in /tools/list",
          "Tool run produces a receipt"
        ]
      },
      {
        id: "m3-policy-smoke",
        title: "Policy smoke: prove training wheels",
        difficulty: "medium",
        eta_minutes: 40,
        teaches: ["Capability gating", "Regression prevention"],
        definition_of_done: [
          "Create a script that checks key policy expectations",
          "Run it in smoke or CI-style flow",
          "Fail fast when policy breaks"
        ]
      }
    ]
  };
}

export async function registerOnboardingRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  // Status + content (public)
  app.get("/onboarding", async () => {
    const dataDir = deps.dataDir();
    const state = await loadOnboarding(dataDir);
    const content = buildOnboardingContent();
    return { ok: true, onboarding: state, content };
  });

  // Mark complete + auto-switch to NORMAL preset
  app.post("/onboarding/complete", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const dataDir = deps.dataDir();
    const now = new Date().toISOString();

    const next: OnboardingStateV1 = {
      schema: "squidley.onboarding.v1",
      completed: true,
      completed_at: now,
      version: 1
    };

    await saveOnboarding(dataDir, next);

    // Force Normal mode once onboarding is done (per your requirement)
    const applied = await deps.applyPresetByName("normal", { req });

    if (!applied.ok) {
      return reply.code(500).send({
        ok: false,
        error: applied.error ?? "Failed to apply normal preset",
        onboarding: next
      });
    }

    return reply.send({
      ok: true,
      onboarding: next,
      preset: "normal",
      runtime: applied.runtime
    });
  });

  // Reset onboarding (admin-only) — handy for testing, demos, or “start over”
  app.post("/onboarding/reset", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const dataDir = deps.dataDir();

    const next: OnboardingStateV1 = {
      schema: "squidley.onboarding.v1",
      completed: false,
      completed_at: null,
      version: 1
    };

    await saveOnboarding(dataDir, next);

    // When reset, go back to Beginner (safe + local-only)
    const applied = await deps.applyPresetByName("beginner", { req });

    if (!applied.ok) {
      return reply.code(500).send({
        ok: false,
        error: applied.error ?? "Failed to apply beginner preset",
        onboarding: next
      });
    }

    return reply.send({
      ok: true,
      onboarding: next,
      preset: "beginner",
      runtime: applied.runtime
    });
  });
}