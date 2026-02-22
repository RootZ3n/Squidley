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

type OnboardingStateV1 = {
  schema: "squidley.onboarding.v1";
  completed: boolean;
  completed_at: string | null;
  version: number;
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

export async function registerOnboardingRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  // Status (public, no admin token needed)
  app.get("/onboarding", async () => {
    const dataDir = deps.dataDir();
    const state = await loadOnboarding(dataDir);
    return { ok: true, onboarding: state };
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