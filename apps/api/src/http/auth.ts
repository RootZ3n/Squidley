// apps/api/src/http/auth.ts
//
// Single source of truth for admin token validation.
// Used by both adminTokenOk() in server.ts and requireAdmin() in admin.ts.
// Always uses crypto.timingSafeEqual to prevent timing attacks.

import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

function headerString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return String(v[0] ?? "");
  return "";
}

/**
 * Returns true if the request carries a valid admin token.
 * Safe to call inline (does not send a reply).
 */
export function adminTokenOk(req: { headers?: any }): boolean {
  const expected = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();
  if (expected.length < 12) return false;

  const got =
    headerString((req.headers ?? {})["x-zensquid-admin-token"]) ||
    headerString((req.headers ?? {})["x-admin-token"]);

  if (got.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Fastify preHandler: calls adminTokenOk and sends 401/500 if not authorized.
 * Use this as a route preHandler or call manually at the top of a handler.
 */
export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const expected = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();

  if (!expected) {
    req.log.warn("admin auth: missing ZENSQUID_ADMIN_TOKEN");
    return reply.code(500).send({ ok: false, error: "admin_token_not_configured" });
  }

  if (!adminTokenOk(req)) {
    return reply.code(401).send({ ok: false, error: "unauthorized" });
  }

  // ✅ authorized — continue
}
