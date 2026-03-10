// apps/api/src/http/routes/squidvision.ts
import type { FastifyInstance } from "fastify";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

type Deps = {
  zensquidRoot: () => string;
  receiptsDir: () => string;
};

async function listAgents(agentsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(agentsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

// Sort by file modification time — receipts have random ID filenames so alpha sort is wrong
async function getNewestJsonFile(dir: string): Promise<string | null> {
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    if (files.length === 0) return null;

    const withMtime = await Promise.all(
      files.map(async (f) => {
        try {
          const s = await stat(path.join(dir, f));
          return { file: f, mtime: s.mtimeMs };
        } catch {
          return { file: f, mtime: 0 };
        }
      })
    );

    withMtime.sort((a, b) => b.mtime - a.mtime);
    return withMtime[0].file;
  } catch {
    return null;
  }
}

async function getLastReceipt(dir: string): Promise<any | null> {
  try {
    const newest = await getNewestJsonFile(dir);
    if (!newest) return null;
    const raw = await readFile(path.join(dir, newest), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getLastAgentReceipt(receiptsDir: string): Promise<any | null> {
  const agentReceiptsDir = path.join(receiptsDir, "agents");
  const receipt = await getLastReceipt(agentReceiptsDir);
  if (receipt) return receipt;

  // Fall back: scan chat receipts by mtime for agent-mode entries
  try {
    const chatDir = path.join(receiptsDir, "chat");
    const files = (await readdir(chatDir)).filter((f) => f.endsWith(".json"));

    const withMtime = await Promise.all(
      files.map(async (f) => {
        try {
          const s = await stat(path.join(chatDir, f));
          return { file: f, mtime: s.mtimeMs };
        } catch {
          return { file: f, mtime: 0 };
        }
      })
    );
    withMtime.sort((a, b) => b.mtime - a.mtime);

    for (const { file } of withMtime.slice(0, 20)) {
      const raw = await readFile(path.join(chatDir, file), "utf-8");
      const r = JSON.parse(raw);
      if (r?.request?.kind === "agent" || r?.component === "agent") return r;
    }
  } catch {}
  return null;
}

async function countSkills(skillsDir: string): Promise<number> {
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

async function countTools(receiptsDir: string): Promise<number> {
  try {
    const chatDir = path.join(receiptsDir, "chat");
    const files = (await readdir(chatDir)).filter((f) => f.endsWith(".json"));

    const withMtime = await Promise.all(
      files.map(async (f) => {
        try {
          const s = await stat(path.join(chatDir, f));
          return { file: f, mtime: s.mtimeMs };
        } catch {
          return { file: f, mtime: 0 };
        }
      })
    );
    withMtime.sort((a, b) => b.mtime - a.mtime);

    for (const { file } of withMtime.slice(0, 5)) {
      const raw = await readFile(path.join(chatDir, file), "utf-8");
      const r = JSON.parse(raw);
      const tools = r?.context?.tool_catalog?.available_tools;
      if (Array.isArray(tools)) return tools.length;
    }
  } catch {}
  return 0;
}

async function getLastChatReceipt(receiptsDir: string): Promise<any | null> {
  const chatDir = path.join(receiptsDir, "chat");
  return getLastReceipt(chatDir);
}

export async function registerSquidvisionRoutes(
  app: FastifyInstance,
  deps: Deps
): Promise<void> {
  const { zensquidRoot, receiptsDir } = deps;

  app.get("/agents", async () => {
    const agentsDir = path.join(zensquidRoot(), "agents");
    const agents = await listAgents(agentsDir);
    return {
      ok: true,
      count: agents.length,
      agents: agents.map((name) => ({ name }))
    };
  });

  app.get("/squidvision/snapshot", async () => {
    const root = zensquidRoot();
    const rDir = receiptsDir();

    const [agents, skillCount, toolCount, lastAgentReceipt, lastChatReceipt] =
      await Promise.all([
        listAgents(path.join(root, "agents")),
        countSkills(path.join(root, "skills")),
        countTools(rDir),
        getLastAgentReceipt(rDir),
        getLastChatReceipt(rDir)
      ]);

    const lastAgent = lastAgentReceipt
      ? {
          name: lastAgentReceipt.component_name ?? lastAgentReceipt.request?.agent ?? "unknown",
          status: lastAgentReceipt.build_event?.status ?? lastAgentReceipt.status ?? "unknown",
          model: lastAgentReceipt.decision?.model ?? null,
          provider: lastAgentReceipt.decision?.provider ?? null,
          tokens_in: lastAgentReceipt.provider_response?.usage?.prompt_tokens ?? lastAgentReceipt.provider_response?.usage?.input_tokens ?? null,
          tokens_out: lastAgentReceipt.provider_response?.usage?.completion_tokens ?? lastAgentReceipt.provider_response?.usage?.output_tokens ?? null,
          estimated_cost: lastAgentReceipt.estimated_cost ?? null,
          duration_ms: lastAgentReceipt.duration_ms ?? null,
          surfaced_to_user: lastAgentReceipt.surfaced_to_user ?? null,
          created_at: lastAgentReceipt.created_at ?? null,
          receipt_id: lastAgentReceipt.receipt_id ?? null
        }
      : null;

    const lastChat = lastChatReceipt
      ? {
          tier: lastChatReceipt.decision?.tier ?? null,
          model: lastChatReceipt.decision?.model ?? null,
          provider: lastChatReceipt.decision?.provider ?? null,
          tokens_in: lastChatReceipt.provider_response?.usage?.prompt_tokens ?? lastChatReceipt.provider_response?.usage?.input_tokens ?? null,
          tokens_out: lastChatReceipt.provider_response?.usage?.completion_tokens ?? lastChatReceipt.provider_response?.usage?.output_tokens ?? null,
          created_at: lastChatReceipt.created_at ?? null,
          receipt_id: lastChatReceipt.receipt_id ?? null
        }
      : null;

    return {
      ok: true,
      awareness: {
        skills: skillCount,
        agents: agents.length,
        tools: toolCount,
        agent_list: agents
      },
      last_agent: lastAgent,
      last_chat: lastChat
    };
  });
}
