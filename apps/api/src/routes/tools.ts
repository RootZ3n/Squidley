// apps/api/src/routes/tools.ts
import type { FastifyInstance } from "fastify";
import { newReceiptId, writeReceipt, type ReceiptV1 } from "@zensquid/core";

import { TOOL_ALLOWLIST } from "../tools/allowlist.js";
import { runTool, type RunToolRequest } from "../tools/runner.js";

type ToolsListResponse = {
  ok: true;
  tools: { id: string; title: string }[];
};

/**
 * Local-only Tool Runner routes
 *
 * Goals:
 * - /tools/list is safe & readable (no admin token required)
 * - /tools/run is admin-token protected by your existing auth gate
 * - 400 for malformed requests / invalid args
 * - 403 for allowlist/permission denials
 * - write receipts for BOTH allowed and denied attempts
 * - never bubble expected denials as 500
 */
export async function toolsRoutes(app: FastifyInstance) {
  // ✅ list tools (safe: only id + title)
  app.get("/tools/list", async (_req, reply) => {
    const tools = Object.values(TOOL_ALLOWLIST)
      .map((t) => ({ id: t.id, title: t.title }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const out: ToolsListResponse = { ok: true, tools };
    return reply.send(out);
  });

  // ✅ run tool (admin token required by your existing guard)
  app.post("/tools/run", async (request, reply) => {
    const body = (request.body ?? {}) as Partial<RunToolRequest>;

    const workspace = typeof body.workspace === "string" ? body.workspace.trim() : "";
    const tool_id = typeof body.tool_id === "string" ? body.tool_id.trim() : "";
    const args = Array.isArray(body.args) ? body.args.map(String) : [];

    if (!workspace || !tool_id) {
      return reply.code(400).send({ ok: false, error: "workspace and tool_id are required" });
    }

    const receipt_id = newReceiptId();
    const started_at = new Date().toISOString();

    try {
      const result = await runTool({
        workspace: workspace as any,
        tool_id: String(tool_id),
        args
      });

      // route-level receipt (keeps symmetry with denied receipts)
      const okReceipt: any = {
        schema: "squidley.toolrun.v1",
        receipt_id,
        created_at: started_at,
        request: {
          kind: "tool",
          workspace,
          tool_id,
          args
        },
        result: {
          ok: true,
          tool_id: result.tool_id,
          workspace: result.workspace,
          cwd: result.cwd,
          command: result.command,
          started_at: result.started_at,
          finished_at: result.finished_at,
          duration_ms: result.duration_ms,
          exit_code: result.exit_code,
          signal: result.signal,
          truncated: result.truncated
        }
      };

      await writeReceipt(process.cwd(), okReceipt as ReceiptV1);

      return reply.send({ ok: true, result });
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "Tool run failed");

      const isForbidden =
        msg.startsWith("Tool not allowed:") ||
        msg.startsWith("Workspace not allowed:") ||
        msg.includes("not allowed");

      const isBadRequest =
        msg.startsWith("Disallowed characters in args:") ||
        msg.startsWith("Invalid args:") ||
        msg.includes("args");

      const status = isForbidden ? 403 : isBadRequest ? 400 : 500;

      const errReceipt: any = {
        schema: "squidley.toolrun.v1",
        receipt_id,
        created_at: started_at,
        request: {
          kind: "tool",
          workspace,
          tool_id,
          args
        },
        result: {
          ok: false,
          status,
          error: msg
        }
      };

      await writeReceipt(process.cwd(), errReceipt as ReceiptV1);

      return reply.code(status).send({
        ok: false,
        error: msg,
        receipt_id
      });
    }
  });
}