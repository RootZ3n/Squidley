// apps/api/src/http/routes/tools.ts
import type { FastifyInstance } from "fastify";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { loadConfig, newReceiptId, type ReceiptV1 } from "@zensquid/core";
import type { CapabilityAction } from "../../capabilities/types.js";

type Deps = {
  adminTokenOk: (req: any) => boolean;
  gateOrDenyTool: (args: {
    cfg: any;
    action: CapabilityAction;
    reply: any;
    receiptBase: Partial<ReceiptV1>;
  }) => Promise<any>;
  safeReadText: (p: string, maxBytes?: number) => Promise<string>;
};

async function runCommand(cmd: string[], cwd?: string | null) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(cmd[0], cmd.slice(1), {
      cwd: cwd ?? undefined,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (d) => (stdout += d.toString("utf-8")));
    child.stderr?.on("data", (d) => (stderr += d.toString("utf-8")));

    const killTimer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
    }, 12_000);

    child.on("close", (code) => {
      clearTimeout(killTimer);
      const cap = (s: string) => (s.length > 120_000 ? s.slice(0, 120_000) + "\n…(truncated)\n" : s);
      resolve({ code: typeof code === "number" ? code : 1, stdout: cap(stdout), stderr: cap(stderr) });
    });
  });
}

export async function registerToolsRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.post("/tools/fs/write", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const body = (req.body ?? {}) as any;

    const p = typeof body?.path === "string" ? body.path : "";
    const content = typeof body?.content === "string" ? body.content : null;
    if (!p || content === null) return reply.code(400).send({ ok: false, error: "Missing path or content" });

    const receipt_id = newReceiptId();
    const base: Partial<ReceiptV1> = {
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: { input: `[tool fs.write] ${p}` } as any,
      decision: { tier: "tool", provider: "local", model: "fs.write", escalated: false } as any
    };

    const deny = await deps.gateOrDenyTool({
      cfg,
      action: { kind: "fs.write", capability: "fs.write", path: p, bytes: Buffer.byteLength(content) } as any,
      reply,
      receiptBase: base
    });
    if (deny) return deny;

    const abs = path.resolve(p);
    await mkdir(path.dirname(abs), { recursive: true }).catch(() => {});
    await writeFile(abs, content, "utf-8");
    return reply.send({ ok: true, path: abs, bytes: Buffer.byteLength(content), receipt_id });
  });

  app.post("/tools/fs/read", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const body = (req.body ?? {}) as any;

    const p = typeof body?.path === "string" ? body.path : "";
    if (!p) return reply.code(400).send({ ok: false, error: "Missing path" });

    const receipt_id = newReceiptId();
    const base: Partial<ReceiptV1> = {
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: { input: `[tool fs.read] ${p}` } as any,
      decision: { tier: "tool", provider: "local", model: "fs.read", escalated: false } as any
    };

    const deny = await deps.gateOrDenyTool({
      cfg,
      action: { kind: "fs.read", capability: "fs.read", path: p } as any,
      reply,
      receiptBase: base
    });
    if (deny) return deny;

    const abs = path.resolve(p);
    const raw = await deps.safeReadText(abs, 200_000);
    return reply.send({ ok: true, path: abs, content: raw, receipt_id });
  });

  app.post("/tools/exec", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const body = (req.body ?? {}) as any;

    let cmd: string[] = [];
    if (Array.isArray(body?.cmd)) cmd = body.cmd.map((x: any) => String(x));
    else if (typeof body?.cmd === "string") cmd = body.cmd.trim().split(/\s+/);

    const cwd = typeof body?.cwd === "string" ? body.cwd : null;
    if (cmd.length === 0) return reply.code(400).send({ ok: false, error: "Missing cmd" });

    const receipt_id = newReceiptId();
    const base: Partial<ReceiptV1> = {
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: { input: `[tool exec] ${cmd.join(" ")}` } as any,
      decision: { tier: "tool", provider: "local", model: "proc.exec", escalated: false } as any
    };

    const deny = await deps.gateOrDenyTool({
      cfg,
      action: { kind: "proc.exec", capability: "proc.exec", cmd, cwd } as any,
      reply,
      receiptBase: base
    });
    if (deny) return deny;

    const res = await runCommand(cmd, cwd);
    return reply.send({ ok: true, code: res.code, stdout: res.stdout, stderr: res.stderr, receipt_id });
  });

  app.post("/tools/systemctl/user", async (req, reply) => {
    if (!deps.adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });

    const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
    const body = (req.body ?? {}) as any;

    const action = typeof body?.action === "string" ? body.action : "";
    const unit = typeof body?.unit === "string" ? body.unit : "";
    if (!action || !unit) return reply.code(400).send({ ok: false, error: "Missing action or unit" });

    const cmd = ["systemctl", "--user", action, unit];

    const receipt_id = newReceiptId();
    const base: Partial<ReceiptV1> = {
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: { input: `[tool systemctl.user] ${cmd.join(" ")}` } as any,
      decision: { tier: "tool", provider: "local", model: "systemctl.user", escalated: false } as any
    };

    const deny = await deps.gateOrDenyTool({
      cfg,
      action: { kind: "systemctl.user", capability: "systemctl.user", cmd } as any,
      reply,
      receiptBase: base
    });
    if (deny) return deny;

    const res = await runCommand(cmd, null);
    return reply.send({ ok: res.code === 0, code: res.code, stdout: res.stdout, stderr: res.stderr, receipt_id });
  });
}