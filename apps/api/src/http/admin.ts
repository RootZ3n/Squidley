import type { FastifyReply, FastifyRequest } from "fastify";

function headerString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return String(v[0] ?? "");
  return "";
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const expected = String(process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();

  if (!expected) {
    // Misconfig should fail fast (and loudly in logs)
    req.log.warn("admin auth: missing ZENSQUID_ADMIN_TOKEN");
    return reply.code(500).send({ ok: false, error: "admin_token_not_configured" });
  }

  // Support both header names
  const token =
    headerString((req.headers as any)["x-zensquid-admin-token"]) ||
    headerString((req.headers as any)["x-admin-token"]);

  if (!token) {
    return reply.code(401).send({ ok: false, error: "unauthorized" });
  }

  // Constant-time compare is nice, but not required for local-first admin header.
  // Keep it simple + reliable.
  if (token !== expected) {
    return reply.code(401).send({ ok: false, error: "unauthorized" });
  }

  // ✅ authorized; do nothing and allow request to continue
}