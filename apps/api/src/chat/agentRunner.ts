// apps/api/src/chat/agentRunner.ts
//
// Reads an agent.md definition, generates a plan from it, executes the plan,
// and writes structured results to memory/threads/.
// This is the core of Squidley's sub-agent system.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function zensquidRoot(): string {
  return process.env.ZENSQUID_ROOT ?? process.cwd();
}

function agentsDir(): string {
  return path.resolve(zensquidRoot(), "agents");
}

function threadsDir(): string {
  return path.resolve(zensquidRoot(), "memory", "threads");
}

// ── Agent definition ──────────────────────────────────────────────────────────

export type AgentPostProcess = {
  prompt: string;
  model?: string;
  write_to?: string; // directory to write output files
};

export type AgentDefinition = {
  name: string;
  role: string;
  goal: string;
  allowed_tools: string[];
  default_plan: Array<{ tool: string; args?: Record<string, any> }>;
  output_format: {
    path_template: string;
  };
  constraints: string[];
  post_process?: AgentPostProcess;
};

export type AgentRunResult = {
  ok: boolean;
  agent: string;
  run_id: string;
  thread_id: string;
  thread_path: string;
  steps_ran: number;
  pass: number;
  fail: number;
  summary: string;
  error?: string;
};

// ── Parse agent.md ────────────────────────────────────────────────────────────

function extractSection(md: string, heading: string): string {
  const lines = md.split("\n");
  const startIdx = lines.findIndex(
    (l) => l.trim().toLowerCase() === `## ${heading.toLowerCase()}`
  );
  if (startIdx < 0) return "";

  const result: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) break;
    result.push(lines[i]);
  }
  return result.join("\n").trim();
}

export async function loadAgentDefinition(agentName: string): Promise<AgentDefinition | null> {
  const fp = path.resolve(agentsDir(), agentName, "agent.md");
  try {
    const raw = await fs.readFile(fp, "utf8");

    // Extract role
    const roleMatch = raw.match(/^## Role\s*\n([\s\S]*?)(?=\n## |\n# |$)/m);
    const role = roleMatch?.[1]?.trim() ?? "";

    // Extract goal
    const goalMatch = raw.match(/^## Goal\s*\n([\s\S]*?)(?=\n## |\n# |$)/m);
    const goal = goalMatch?.[1]?.trim() ?? "";

    // Extract allowed tools
    const toolsSection = extractSection(raw, "Allowed tools");
    const allowed_tools = toolsSection
      .split("\n")
      .filter((l) => l.trim().startsWith("-"))
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter(Boolean);

    // Extract default plan
    const planSection = extractSection(raw, "Default plan");
    const default_plan: Array<{ tool: string; args?: Record<string, any> }> = [];
    for (const line of planSection.split("\n")) {
      const m = line.match(/^\d+\.\s+(\w+[\.\w]*)\(?(.*?)\)?$/);
      if (m?.[1]) {
        const tool = m[1].trim();
        const argStr = m[2]?.trim() ?? "";
        const args: Record<string, any> = {};
        if (argStr) args.query = argStr;
        default_plan.push({ tool, args: Object.keys(args).length > 0 ? args : undefined });
      }
    }

    // Extract constraints
    const constraintsSection = extractSection(raw, "Constraints");
    const constraints = constraintsSection
      .split("\n")
      .filter((l) => l.trim().startsWith("-"))
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter(Boolean);

    // Parse post_process section if present
    // Format: ## Post process section has model/write_to keys
    // Prompt is between prompt_start and prompt_end markers (safe from ## parsing)
    const ppSection = extractSection(raw, "Post process");
    let post_process: AgentPostProcess | undefined;
    if (ppSection) {
      const modelMatch = ppSection.match(/model:\s*(.+)/);
      const writeToMatch = ppSection.match(/write_to:\s*(.+)/);
      // Extract prompt between prompt_start and prompt_end markers
      const promptMatch = raw.match(/prompt_start\n([\s\S]+?)\nprompt_end/);
      if (promptMatch?.[1]) {
        post_process = {
          prompt: promptMatch[1].trim(),
          model: modelMatch?.[1]?.trim(),
          write_to: writeToMatch?.[1]?.trim(),
        };
      }
    }

    return {
      name: agentName,
      role,
      goal,
      allowed_tools,
      default_plan,
      output_format: {
        path_template: `memory/threads/${agentName}-{date}.json`,
      },
      constraints,
      post_process,
    };
  } catch {
    return null;
  }
}

// ── List available agents ─────────────────────────────────────────────────────

export async function listAgents(): Promise<Array<{ name: string; role: string }>> {
  try {
    const entries = await fs.readdir(agentsDir(), { withFileTypes: true }) as import("node:fs").Dirent[];
    const agents: Array<{ name: string; role: string }> = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const fp = path.resolve(agentsDir(), e.name, "agent.md");
      try {
        const raw = await fs.readFile(fp, "utf8");
        const roleMatch = raw.match(/^## Role\s*\n([\s\S]*?)(?=\n## |\n# |$)/m);
        const role = roleMatch?.[1]?.trim().split("\n")[0] ?? "";
        agents.push({ name: e.name, role });
      } catch {
        agents.push({ name: e.name, role: "" });
      }
    }
    return agents;
  } catch {
    return [];
  }
}

// ── Run agent ─────────────────────────────────────────────────────────────────

export async function runAgent(args: {
  agentName: string;
  focus?: string;
  app: any; // Fastify instance for inject
  adminToken: string;
  ollamaUrl?: string;
  model?: string;
}): Promise<AgentRunResult> {
  const { agentName, focus, app, adminToken } = args;
  const run_id = crypto.randomBytes(6).toString("base64url");
  const today = new Date().toISOString().slice(0, 10);
  const thread_id = `${agentName}-${today}-${run_id}`;
  const thread_path = path.resolve(
    zensquidRoot(),
    `memory/threads/${thread_id}.json`
  );

  // Load agent definition
  const agent = await loadAgentDefinition(agentName);
  if (!agent) {
    return {
      ok: false,
      agent: agentName,
      run_id,
      thread_id,
      thread_path,
      steps_ran: 0,
      pass: 0,
      fail: 0,
      summary: "",
      error: `Agent not found: ${agentName}`,
    };
  }

  // Build plan — use focus to override rg.search query if provided
  const steps = agent.default_plan.map((step) => {
    if (step.tool === "rg.search" && focus) {
      return { tool: step.tool, args: { query: focus, path: "." } };
    }
    return step;
  });

  // Execute steps via /tools/run
  const results: Array<{
    tool: string;
    ok: boolean;
    stdout: string;
    error?: string;
  }> = [];

  for (const step of steps) {
    // Check tool is allowed
    if (!agent.allowed_tools.includes(step.tool)) {
      results.push({ tool: step.tool, ok: false, stdout: "", error: "not in agent allowlist" });
      break;
    }

    try {
      // fs.read and fs.write use rawArgs format
      const usesRawArgs = step.tool === "fs.read" || step.tool === "fs.write";
      const payload = usesRawArgs
        ? {
            workspace: "squidley",
            tool_id: step.tool,
            rawArgs: step.args ?? {},
          }
        : {
            workspace: "squidley",
            tool_id: step.tool,
            args: (() => {
              if (!step.args) return [];
              if (step.tool === "rg.search") {
                return [String(step.args.query ?? "TODO"), String(step.args.path ?? ".")];
              }
              return Object.values(step.args).map(String);
            })(),
          };

      const res = await app.inject({
        method: "POST",
        url: "/tools/run",
        headers: {
          "content-type": "application/json",
          "x-zensquid-admin-token": adminToken,
        },
        payload,
      });

      const json =
        typeof (res as any).json === "function"
          ? (res as any).json()
          : JSON.parse(res.payload);

      const ok = Boolean(json?.ok);
      const stdout = String(json?.stdout ?? json?.output ?? json?.content ?? "");
      results.push({ tool: step.tool, ok, stdout: stdout.slice(0, 2000) });

      if (!ok) break; // stop on fail
    } catch (e: any) {
      results.push({ tool: step.tool, ok: false, stdout: "", error: String(e?.message ?? e) });
      break;
    }
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;

  // Build summary from results
  const summaryLines: string[] = [];
  summaryLines.push(`Agent: ${agentName}`);
  summaryLines.push(`Focus: ${focus ?? "default inspection"}`);
  summaryLines.push(`Ran: ${results.length} steps, ${pass} passed, ${fail} failed`);
  summaryLines.push("");
  for (const r of results) {
    summaryLines.push(`## ${r.tool} ${r.ok ? "✓" : "✗"}`);
    if (r.stdout) summaryLines.push(r.stdout.trim().slice(0, 500));
    if (r.error) summaryLines.push(`Error: ${r.error}`);
    summaryLines.push("");
  }
  const summary = summaryLines.join("\n");

  // Extract open loops from stdout (TODOs, FIXMEs, etc.)
  const open_loops: string[] = [];
  for (const r of results) {
    if (r.tool === "rg.search" && r.stdout) {
      const lines = r.stdout.split("\n").filter((l) => l.includes("TODO") || l.includes("FIXME"));
      for (const l of lines.slice(0, 6)) {
        open_loops.push(l.trim().slice(0, 120));
      }
    }
  }

  // ── Post-process: send results to local model for extraction ─────────────────
  let modelOutput = "";
  let writtenFiles: string[] = [];

  if (agent.post_process && results.some((r) => r.ok && r.stdout)) {
    try {
      const combinedOutput = results
        .filter((r) => r.ok && r.stdout)
        .map((r) => `## ${r.tool}\n${r.stdout.trim()}`)
        .join("\n\n");

      const prompt = agent.post_process.prompt
        .replace("{output}", combinedOutput)
        .replace("{date}", today)
        .replace("{focus}", focus ?? "default");

      const ollamaUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434") + "/api/generate";
      const ollamaModel = agent.post_process.model ?? "qwen2.5:14b-instruct";

      const resp = await fetch(ollamaUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          prompt,
          stream: false,
          options: { temperature: 0.2, num_predict: 2000 },
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (resp.ok) {
        const data = await resp.json() as any;
        modelOutput = String(data?.response ?? "").trim();

        if (agent.post_process.write_to && modelOutput) {
          const outDir = path.resolve(zensquidRoot(), agent.post_process.write_to);
          await fs.mkdir(outDir, { recursive: true });

          // Model output may contain multiple --- FILE: path --- sections
          const fileBlocks = modelOutput.split(/^---\s*FILE:\s*/m).filter(Boolean);
          if (fileBlocks.length > 1) {
            for (const block of fileBlocks) {
              const firstLine = block.split("\n")[0].trim();
              const fileContent = block.split("\n").slice(1).join("\n").trim();
              if (firstLine && fileContent) {
                const filePath = path.resolve(zensquidRoot(), firstLine);
                if (filePath.startsWith(outDir)) {
                  await fs.mkdir(path.dirname(filePath), { recursive: true });
                  await fs.writeFile(filePath, fileContent, "utf8");
                  writtenFiles.push(firstLine);
                }
              }
            }
          } else {
            const fileName = `${agentName}-output-${today}-${run_id}.md`;
            const filePath = path.resolve(outDir, fileName);
            await fs.writeFile(filePath, modelOutput, "utf8");
            writtenFiles.push(`${agent.post_process.write_to}/${fileName}`);
          }
        }
      }
    } catch (e: any) {
      modelOutput = `Post-process error: ${String(e?.message ?? e)}`;
    }
  }

  // Write thread JSON
  const thread = {
    thread_id,
    title: `${agentName} — ${today}`,
    status: "active",
    tags: [agentName, "autonomous"],
    summary: (modelOutput || summary).slice(0, 800),
    open_loops,
    agent_run: {
      run_id,
      agent: agentName,
      focus: focus ?? "default",
      steps_ran: results.length,
      pass,
      fail,
      written_files: writtenFiles,
      model_processed: Boolean(modelOutput && !modelOutput.startsWith("Post-process error")),
    },
    last_touched: new Date().toISOString(),
  };

  try {
    await fs.mkdir(threadsDir(), { recursive: true });
    await fs.writeFile(thread_path, JSON.stringify(thread, null, 2), "utf8");

    // Update _active.txt
    const activeFp = path.resolve(threadsDir(), "_active.txt");
    await fs.writeFile(activeFp, thread_id + "\n", "utf8");
  } catch (e: any) {
    return {
      ok: false,
      agent: agentName,
      run_id,
      thread_id,
      thread_path,
      steps_ran: results.length,
      pass,
      fail,
      summary,
      error: `Failed to write thread: ${String(e?.message ?? e)}`,
    };
  }

  return {
    ok: fail === 0,
    agent: agentName,
    run_id,
    thread_id,
    thread_path,
    steps_ran: results.length,
    pass,
    fail,
    summary,
  };
}
