// apps/api/src/http/routes/telegram.ts
//
// Telegram bot integration for Squidley.
// Uses long-polling (no public webhook needed — works behind NAT/firewall).
// Single-user mode: only responds to the owner's chat ID.
//
// Flow:
//   1. On startup, begins polling Telegram for updates
//   2. First message from any user logs their chat ID (owner capture mode)
//   3. Once owner ID is set, ignores all other senders
//   4. Inbound messages → same chat pipeline as web UI
//   5. Scheduler/agents can push messages via sendTelegramMessage()

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";

const TELEGRAM_API = "https://api.telegram.org";
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_SEC = 30;

let botToken = "";
let ownerChatId: string | null = null;
let pollingActive = false;
let lastUpdateId = 0;

function ownerFilePath(): string {
  const root = process.env.ZENSQUID_ROOT ?? process.cwd();
  return path.resolve(root, "config", "telegram_owner.txt");
}

async function loadOwnerChatId(): Promise<string | null> {
  try {
    const text = await readFile(ownerFilePath(), "utf8");
    return text.trim() || null;
  } catch {
    return null;
  }
}

async function saveOwnerChatId(id: string): Promise<void> {
  await mkdir(path.dirname(ownerFilePath()), { recursive: true });
  await writeFile(ownerFilePath(), id, "utf8");
}

async function loadBotToken(): Promise<string> {
  // Try env var first
  let token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (token) return token;
  // Try file (systemd credentials pattern)
  const file = (process.env.TELEGRAM_BOT_TOKEN_FILE ?? "").trim();
  if (file) {
    try { token = (await readFile(file, "utf8")).trim(); } catch {}
  }
  return token;
}

export async function sendTelegramMessage(text: string, chatId?: string): Promise<boolean> {
  const target = chatId ?? ownerChatId;
  if (!botToken || !target) return false;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: target,
        text,
        parse_mode: "Markdown",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getUpdates(offset: number): Promise<any[]> {
  try {
    const res = await fetch(
      `${TELEGRAM_API}/bot${botToken}/getUpdates?offset=${offset}&timeout=${POLL_TIMEOUT_SEC}&allowed_updates=["message"]`,
      { signal: AbortSignal.timeout((POLL_TIMEOUT_SEC + 5) * 1000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as any;
    return data?.result ?? [];
  } catch {
    return [];
  }
}

async function handleInboundMessage(
  chatId: string,
  text: string,
  firstName: string,
  app: FastifyInstance
): Promise<void> {
  // Owner capture mode — first message sets the owner
  if (!ownerChatId) {
    ownerChatId = chatId;
    await saveOwnerChatId(chatId);
    console.log(`[telegram] owner captured: chat_id=${chatId} (${firstName})`);
    await sendTelegramMessage(
      `🦑 *Squidley online.*\n\nYour chat ID has been saved: \`${chatId}\`\n\nSend me anything to get started.`,
      chatId
    );
    return;
  }

  // Security: ignore non-owner messages
  if (chatId !== ownerChatId) {
    console.warn(`[telegram] ignoring message from unknown chat_id=${chatId}`);
    return;
  }

  // Handle commands
  if (text.startsWith("/")) {
    await handleCommand(text, chatId, app);
    return;
  }

  // Forward to chat pipeline
  try {
    const res = await app.inject({
      method: "POST",
      url: "/chat",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        input: text,
        session_id: `telegram-${chatId}`,
        source: "telegram",
      }),
    });

    const json = res.json() as any;
    const output = json?.output ?? json?.response ?? json?.error ?? "No response";

    // Telegram has 4096 char limit — split if needed
    const chunks = splitMessage(output);
    for (const chunk of chunks) {
      await sendTelegramMessage(chunk, chatId);
    }
  } catch (e: any) {
    await sendTelegramMessage(`⚠️ Error: ${String(e?.message ?? e)}`, chatId);
  }
}

async function handleCommand(
  text: string,
  chatId: string,
  app: FastifyInstance
): Promise<void> {
  const cmd = text.split(" ")[0].toLowerCase();

  if (cmd === "/start" || cmd === "/help") {
    await sendTelegramMessage(
      `🦑 *Squidley Commands*\n\n` +
      `/status — system health\n` +
      `/scheduler — scheduled tasks\n` +
      `/agents — list agents\n` +
      `/run <agent> — run an agent\n` +
      `/briefings — pending briefings\n` +
      `/help — this message\n\n` +
      `Or just talk to me normally.`,
      chatId
    );
    return;
  }

  if (cmd === "/status") {
    const res = await app.inject({ method: "GET", url: "/doctor" });
    const json = res.json() as any;
    const summary = json?.summary ?? {};
    const fails = (json?.checks ?? []).filter((c: any) => c.status === "fail").map((c: any) => `❌ ${c.id}: ${c.detail}`);
    const warns = (json?.checks ?? []).filter((c: any) => c.status === "warn").map((c: any) => `⚠️ ${c.id}: ${c.detail}`);
    let msg = `🦑 *System Status*\n\n✅ ${summary.pass} passing · ⚠️ ${summary.warn} warnings · ❌ ${summary.fail} failing`;
    if (fails.length) msg += `\n\n${fails.join("\n")}`;
    if (warns.length) msg += `\n\n${warns.join("\n")}`;
    await sendTelegramMessage(msg, chatId);
    return;
  }

  if (cmd === "/scheduler") {
    const res = await app.inject({ method: "GET", url: "/scheduler/status" });
    const json = res.json() as any;
    const schedules = json?.schedules ?? [];
    const lines = schedules.map((s: any) =>
      `${s.enabled ? "✅" : "⏸"} *${s.id}*\n   ${s.label}\n   Last: ${s.last_run ? new Date(s.last_run).toLocaleString() : "never"}`
    ).join("\n\n");
    await sendTelegramMessage(`🦑 *Scheduled Tasks*\n\n${lines || "No schedules configured."}`, chatId);
    return;
  }

  if (cmd === "/agents") {
    const res = await app.inject({ method: "GET", url: "/autonomy/agents" });
    const json = res.json() as any;
    const agents = json?.agents ?? [];
    const lines = agents.map((a: any) => `• *${a.name}*: ${a.role ?? ""}`).join("\n");
    await sendTelegramMessage(`🦑 *Registered Agents*\n\n${lines}`, chatId);
    return;
  }

  if (cmd === "/run") {
    const agentName = text.split(" ")[1]?.trim();
    if (!agentName) {
      await sendTelegramMessage("Usage: /run <agent-name>", chatId);
      return;
    }
    await sendTelegramMessage(`⚙️ Running *${agentName}*...`, chatId);
    const res = await app.inject({
      method: "POST",
      url: "/autonomy/agent/run",
      headers: {
        "content-type": "application/json",
        "x-zensquid-admin-token": process.env.ZENSQUID_ADMIN_TOKEN ?? "",
      },
      payload: JSON.stringify({ agent: agentName }),
    });
    const json = res.json() as any;
    const status = json?.ok ? "✅" : "❌";
    await sendTelegramMessage(
      `${status} *${agentName}* — ${json?.pass ?? 0}/${json?.steps_ran ?? 0} steps passed\n\n${(json?.summary ?? "").slice(0, 800)}`,
      chatId
    );
    return;
  }

  if (cmd === "/briefings") {
    const res = await app.inject({ method: "GET", url: "/scheduler/briefings" });
    const json = res.json() as any;
    if (!json?.count) {
      await sendTelegramMessage("No pending briefings.", chatId);
      return;
    }
    const lines = json.briefings.map((b: any) =>
      `✅ *${b.agent}* — ${b.pass}/${b.steps_ran} steps — ${new Date(b.ran_at).toLocaleTimeString()}`
    ).join("\n");
    await sendTelegramMessage(`🦑 *Pending Briefings*\n\n${lines}`, chatId);
    return;
  }

  await sendTelegramMessage(`Unknown command: ${cmd}\nType /help for available commands.`, chatId);
}

function splitMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + maxLen));
    start += maxLen;
  }
  return chunks;
}

async function pollLoop(app: FastifyInstance): Promise<void> {
  console.log("[telegram] polling started");
  while (pollingActive) {
    const updates = await getUpdates(lastUpdateId + 1);
    for (const update of updates) {
      if (update.update_id > lastUpdateId) lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg?.text) continue;
      const chatId = String(msg.chat.id);
      const text = String(msg.text);
      const firstName = String(msg.from?.first_name ?? "unknown");
      await handleInboundMessage(chatId, text, firstName, app).catch((e) =>
        console.error("[telegram] handler error:", e?.message)
      );
    }
    if (updates.length === 0) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  console.log("[telegram] polling stopped");
}

export async function startTelegramBot(app: FastifyInstance): Promise<void> {
  let rawToken = "";
  try {
    rawToken = await loadBotToken();
  } catch (e: any) {
    console.error("[telegram] failed to load token:", String(e?.message ?? e));
    return;
  }
  if (!rawToken) {
    console.error("[telegram] no bot token found — skipping");
    return;
  }
  botToken = rawToken;

  let rawOwner: string | null = null;
  try {
    rawOwner = await loadOwnerChatId();
  } catch (e: any) {
    console.error("[telegram] failed to load owner:", String(e?.message ?? e));
  }
  ownerChatId = rawOwner;
  if (ownerChatId) {
    console.log(`[telegram] owner loaded: ${ownerChatId}`);
  } else {
    console.log("[telegram] no owner set — first message will capture chat ID");
  }

  // Verify token works
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`, {
      signal: AbortSignal.timeout(5_000),
    });
    const data = await res.json() as any;
    if (!res.ok || !data?.ok) {
      console.error("[telegram] invalid bot token — skipping");
      return;
    }
    console.log(`[telegram] bot ready: @${data.result?.username}`);
  } catch (e: any) {
    console.error(`[telegram] cannot reach Telegram API: ${e?.message}`);
    return;
  }

  pollingActive = true;
  // Run poll loop in background — don't await
  pollLoop(app).catch((e) =>
    console.error("[telegram] poll loop crashed:", e?.message)
  );

  // Notify owner on startup (if known)
  if (ownerChatId) {
    await sendTelegramMessage("🦑 Squidley is online.", ownerChatId).catch(() => {});
  }
}

export function stopTelegramBot(): void {
  pollingActive = false;
}

export async function registerTelegramRoutes(app: FastifyInstance): Promise<void> {
  // GET /telegram/debug (temp)
  app.get("/telegram/debug", async (_req, reply) => {
    const envToken = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
    const envFile = (process.env.TELEGRAM_BOT_TOKEN_FILE ?? "").trim();
    let fileContent = "";
    if (envFile) {
      try { fileContent = (await readFile(envFile, "utf8")).trim(); } catch (e: any) { fileContent = "ERROR: " + e.message; }
    }
    return reply.send({
      env_token_len: envToken.length,
      env_file: envFile,
      file_token_len: fileContent.startsWith("ERROR") ? fileContent : fileContent.length,
      owner_file: ownerFilePath(),
      current_owner: ownerChatId,
      bot_token_loaded: botToken.length,
    });
  });

  // GET /telegram/status
  app.get("/telegram/status", async (_req, reply) => {
    return reply.send({
      ok: true,
      active: pollingActive,
      owner_set: Boolean(ownerChatId),
      owner_chat_id: ownerChatId ?? null,
    });
  });

  // POST /telegram/send — push a message to owner (admin only)
  app.post("/telegram/send", async (req, reply) => {
    const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
    const expectedToken = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();
    if (!expectedToken || adminToken !== expectedToken) {
      return reply.code(403).send({ ok: false, error: "forbidden" });
    }
    const body = (req.body ?? {}) as any;
    const text = String(body?.text ?? "").trim();
    if (!text) return reply.code(400).send({ ok: false, error: "missing text" });
    const ok = await sendTelegramMessage(text);
    return reply.send({ ok });
  });

  // DELETE /telegram/owner — reset owner (admin only, for re-pairing)
  app.delete("/telegram/owner", async (req, reply) => {
    const adminToken = String((req.headers as any)["x-zensquid-admin-token"] ?? "").trim();
    const expectedToken = (process.env.ZENSQUID_ADMIN_TOKEN ?? "").trim();
    if (!expectedToken || adminToken !== expectedToken) {
      return reply.code(403).send({ ok: false, error: "forbidden" });
    }
    ownerChatId = null;
    try { await writeFile(ownerFilePath(), "", "utf8"); } catch {}
    return reply.send({ ok: true, message: "owner reset — next message will re-capture" });
  });
}
