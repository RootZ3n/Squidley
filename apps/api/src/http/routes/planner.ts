// apps/api/src/http/routes/planner.ts
// Dedicated planner chat endpoint — injects architect mode system prompt server-side

import type { FastifyInstance } from "fastify";

const ARCHITECT_PROMPT = `You are Squidley in ARCHITECT MODE.
Your job right now is NOT to answer questions or run tools.
Your job is to deeply understand what Jeff wants to build or solve before anything gets planned.

RULES FOR THIS MODE:
- Ask ONE focused question at a time. Never stack questions.
- Listen carefully to the answers and build on them.
- Push back if something is vague or contradictory.
- Connect what Jeff says to what you know about his existing systems (Squidley, Krakzen, Mushin OS, the lab).
- When you have enough to write a real plan — say so. Don't drag it out.
- When Jeff says he's ready, or you feel you have enough, say exactly: "I think I have what I need. Want me to crystallize this into a plan?"

WHAT YOU'RE BUILDING TOWARD:
A structured plan with: goal, why it matters, affected systems, ordered steps, risks, and open questions.

Start by asking what Jeff wants to work on today. One question. Then listen.`;

interface Deps {
  adminTokenOk: (req: any) => boolean;
  zensquidRoot: () => string;
}

export async function registerPlannerRoutes(app: FastifyInstance, deps: Deps): Promise<void> {

  // POST /planner/chat — architect mode chat, injects system prompt server-side
  app.post<{ Body: { message?: string; session_id?: string; tier?: string } }>(
    "/planner/chat",
    async (req, reply) => {
      if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "unauthorized" });

      const message = String(req.body?.message ?? "").trim();
      if (!message) return reply.code(400).send({ ok: false, error: "message required" });

      const sessionId = String(req.body?.session_id ?? `planner-${Date.now()}`);
      const tier = String(req.body?.tier ?? "chat");

      // Inject via /chat with prefixed message containing architect context
      const augmentedMessage = `[PLANNER MODE — ARCHITECT CONTEXT]\n${ARCHITECT_PROMPT}\n\n[USER MESSAGE]\n${message}`;

      const res = await app.inject({
        method: "POST",
        url: "/chat",
        headers: {
          "content-type": "application/json",
          "x-zensquid-admin-token": String(req.headers?.["x-zensquid-admin-token"] ?? ""),
        },
        payload: {
          input: augmentedMessage,
          session_id: sessionId,
          tier,
          force_tier: tier !== "chat" ? tier : undefined,
          reason: "planner:interview",
        },
      });

      let json: any = null;
      try {
        json = typeof res.json === "function" ? res.json() : JSON.parse(res.payload);
      } catch {
        json = { ok: false, error: "parse error", raw: res.payload };
      }

      return reply.code(res.statusCode).send(json);
    }
  );

  // POST /planner/crystallize — synthesize transcript into structured plan
  app.post<{ Body: { transcript?: string; tier?: string } }>(
    "/planner/crystallize",
    async (req, reply) => {
      if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "unauthorized" });

      const transcript = String(req.body?.transcript ?? "").trim();
      if (!transcript) return reply.code(400).send({ ok: false, error: "transcript required" });

      const tier = String(req.body?.tier ?? "chat");

      const message = `Based on this planning conversation, produce a structured plan.

CONVERSATION:
${transcript}

OUTPUT FORMAT (use these exact headers):
## Goal
## Why It Matters
## Affected Systems
## Ordered Steps
## Risks
## Open Questions

Be specific. Use what was actually discussed. Do not invent anything not mentioned.`;

      const res = await app.inject({
        method: "POST",
        url: "/chat",
        headers: {
          "content-type": "application/json",
          "x-zensquid-admin-token": String(req.headers?.["x-zensquid-admin-token"] ?? ""),
        },
        payload: {
          input: message,
          session_id: `crystallize-${Date.now()}`,
          tier,
          force_tier: tier !== "chat" ? tier : undefined,
          reason: "planner:crystallize",
        },
      });

      let json: any = null;
      try {
        json = typeof res.json === "function" ? res.json() : JSON.parse(res.payload);
      } catch {
        json = { ok: false, error: "parse error" };
      }

      return reply.code(res.statusCode).send(json);
    }
  );
}
