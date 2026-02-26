// apps/api/src/routes/tools.ts
//
// Fastify plugin for all tool execution routes.
// This replaces the old parallel tool system.
// All execution goes through the consolidated runner.ts.

import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { runTool } from "../tools/runner.js";
import { listTools } from "../tools/allowlist.js";

export const toolsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {

  // ── Tool catalog ─────────────────────────────────────────────────────────────

  app.get("/tools/list", async (req) => {
    // Admin token = show all tools including admin-gated ones
    const expected = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();
    const got = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
    const isAdmin = expected.length >= 12 && got === expected;
    return { ok: true, tools: listTools(isAdmin) };
  });

  // ── Tool execution ────────────────────────────────────────────────────────────

  app.post("/tools/run", async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const tool_id = String(body?.tool_id ?? body?.tool ?? "").trim();
    const workspace = String(body?.workspace ?? "squidley").trim() as any;
    const args = body?.args ?? {};

    // Forward admin token from request headers into runner
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

  // ── Filesystem routes (admin-gated via runner) ────────────────────────────────

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
        args: { path: body?.path ?? body?.rel ?? "", text: body?.text ?? body?.content ?? "" },
        admin_token,
      });
      return reply.send({ ok: result.ok, path: body?.path, receipt_id: result.receipt_id });
    } catch (e: any) {
      const code = e?.code === "FORBIDDEN" ? 403 : 400;
      return reply.code(code).send({ ok: false, error: String(e?.message ?? "write failed") });
    }
  });

  // ── Exec route (admin-gated via runner) ───────────────────────────────────────

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

  // ── Systemd route (admin-gated via runner) ────────────────────────────────────

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
