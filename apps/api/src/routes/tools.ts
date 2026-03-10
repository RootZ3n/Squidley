// apps/api/src/routes/tools.ts
//
// Fastify plugin for all tool execution routes.
// All execution goes through the consolidated runner.ts.

import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { runTool } from "../tools/runner.js";
import { listTools } from "../tools/allowlist.js";

function adminOk(req: any): boolean {
  const expected = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();
  if (expected.length < 12) return false;

  const got = String((req.headers as any)?.["x-zensquid-admin-token"] ?? "").trim();
  if (got.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const toolsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/tools/list", async (req) => {
    const isAdmin = adminOk(req);
    return { ok: true, tools: listTools(isAdmin) };
  });

  app.post("/tools/run", async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const tool_id = String(body?.tool_id ?? body?.tool ?? "").trim();
    const workspace = String(body?.workspace ?? "squidley").trim() as any;
    const args = body?.args ?? {};

    const admin_token = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim() || undefined;

    if (!tool_id) {
      return reply.code(400).send({ ok: false, error: "missing tool_id" });
    }

    try {
      const result = await runTool({ workspace, tool_id, args, admin_token });
      return reply.send(result);
    } catch (e: any) {
      const code = e?.code === "FORBIDDEN" ? 403 : e?.code === "BAD_REQUEST" ? 400 : 500;
      return reply.code(code).send({
        ok: false,
        error: String(e?.message ?? "tool failed"),
        receipt_id: e?.receipt_id ?? null,
      });
    }
  });

  app.post("/tools/fs/read", async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const admin_token = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim() || undefined;

    try {
      const result = await runTool({
        workspace: "squidley",
        tool_id: "fs.read",
        args: { path: body?.path ?? body?.rel ?? "" },
        admin_token,
      });
      return reply.send({ ok: result.ok, path: body?.path, text: result.stdout, receipt_id: result.receipt_id });
    } catch (e: any) {
      const code = e?.code === "FORBIDDEN" ? 403 : 400;
      return reply.code(code).send({ ok: false, error: String(e?.message ?? "read failed") });
    }
  });

  app.post("/tools/fs/write", async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const admin_token = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim() || undefined;

    try {
      const result = await runTool({
        workspace: "squidley",
        tool_id: "fs.write",
        args: { path: body?.path ?? body?.rel ?? "", content: body?.content ?? body?.text ?? "" },
        admin_token,
      });
      return reply.send({ ok: result.ok, path: body?.path, receipt_id: result.receipt_id });
    } catch (e: any) {
      const code = e?.code === "FORBIDDEN" ? 403 : 400;
      return reply.code(code).send({ ok: false, error: String(e?.message ?? "write failed") });
    }
  });

  app.post("/tools/exec", async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const admin_token = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim() || undefined;

    try {
      const result = await runTool({
        workspace: "squidley",
        tool_id: "proc.exec",
        args: { cmd: body?.cmd ?? "", argv: body?.argv ?? [] },
        admin_token,
      });
      return reply.send({ ok: result.ok, stdout: result.stdout, stderr: result.stderr, receipt_id: result.receipt_id });
    } catch (e: any) {
      const code = e?.code === "FORBIDDEN" ? 403 : 400;
      return reply.code(code).send({ ok: false, error: String(e?.message ?? "exec failed") });
    }
  });

  app.post("/tools/systemctl/user", async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const admin_token = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim() || undefined;

    try {
      const result = await runTool({
        workspace: "squidley",
        tool_id: "systemctl.user",
        args: { action: body?.action ?? "", unit: body?.unit ?? "" },
        admin_token,
      });
      return reply.send({ ok: result.ok, stdout: result.stdout, stderr: result.stderr, receipt_id: result.receipt_id });
    } catch (e: any) {
      const code = e?.code === "FORBIDDEN" ? 403 : 400;
      return reply.code(code).send({ ok: false, error: String(e?.message ?? "systemctl failed") });
    }
  });
};
