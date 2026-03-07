import type { FastifyInstance } from "fastify";

export async function registerPingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ping", async (_request, reply) => {
    return reply.send({ ok: true, ts: Date.now() });
  });
}
