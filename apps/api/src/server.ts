// apps/api/src/server.ts
import Fastify from "fastify";
import corsPkg from "@fastify/cors";
import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";

import { buildChatSystemPrompt, normalizeRelPath, memoryAbs, ensureMemoryRoot } from "./chat/systemPrompt.js";

import {
  loadConfig,
  chooseTier,
  newReceiptId,
  writeReceipt,
  type ChatRequest,
  type ReceiptV1,
  type ProviderName
} from "@zensquid/core";

import { ollamaChat } from "@zensquid/provider-ollama";
import { modelstudioChat } from "@zensquid/provider-modelstudio";

import { loadCapabilityPolicy, normalizeZone, zonePolicy } from "./capabilities/policy.js";
import { checkCapabilityAction } from "./capabilities/gate.js";
import type { CapabilityAction } from "./capabilities/types.js";

import { makeRuntimePaths, type RuntimeState, type SafetyZone } from "./runtime/state.js";

import { registerSkillsRoutes } from "./http/routes/skills.js";
import { registerToolsRoutes } from "./http/routes/tools.js";
import { registerReceiptsRoutes } from "./http/routes/receipts.js";
import { registerDoctorRoutes } from "./http/routes/doctor.js";
import { registerRuntimeRoutes } from "./http/routes/runtime.js";

type RequestKind = "chat" | "heartbeat" | "tool" | "system";

const app = Fastify({ logger: true });
await app.register(corsPkg, { origin: true });

app.get("/health", async () => ({ ok: true, name: "ZenSquid API" }));

function zensquidRoot(): string {
  return process.env.ZENSQUID_ROOT ?? process.cwd();
}

function dataDir(): string {
  return path.resolve(zensquidRoot(), "data");
}

function receiptsDir(): string {
  return path.resolve(dataDir(), "receipts");
}

function memoryRoot(): string {
  return path.resolve(zensquidRoot(), "memory");
}

function skillsRoot(): string {
  return path.resolve(zensquidRoot(), "skills");
}

function soulFile(): string {
  return path.resolve(zensquidRoot(), "SOUL.md");
}

function identityFile(): string {
  return path.resolve(zensquidRoot(), "IDENTITY.md");
}

/**
 * Runtime state (loaded via runtimePaths)
 */
function isSafetyZone(v: unknown): v is SafetyZone {
  return v === "workspace" || v === "diagnostics" || v === "forge" || v === "godmode";
}

const runtimePaths = makeRuntimePaths(zensquidRoot);

let runtimeState: RuntimeState = { strict_local_only: null, safety_zone: null };
runtimeState = await runtimePaths.loadRuntimeState();

const getRuntimeState = () => runtimeState;
const setRuntimeState = (s: RuntimeState) => {
  runtimeState = s;
};

function adminTokenOk(req: any): boolean {
  const expected = process.env.ZENSQUID_ADMIN_TOKEN;
  if (!expected || expected.trim().length < 12) return false;
  const got = (req.headers?.["x-zensquid-admin-token"] ?? "") as string;
  return typeof got === "string" && got === expected;
}

function effectiveStrictLocal(cfg: any): { effective: boolean; source: "runtime" | "config" } {
  if (typeof runtimeState.strict_local_only === "boolean") {
    return { effective: runtimeState.strict_local_only, source: "runtime" };
  }
  return { effective: Boolean((cfg as any)?.budgets?.strict_local_only), source: "config" };
}

function effectiveSafetyZone(cfg: any): { effective: SafetyZone; source: "runtime" | "config" } {
  if (isSafetyZone(runtimeState.safety_zone)) {
    return { effective: runtimeState.safety_zone, source: "runtime" };
  }

  const fromCfg = (cfg as any)?.meta?.safety_zone;
  if (isSafetyZone(fromCfg)) return { effective: fromCfg, source: "config" };

  const localFirst = Boolean((cfg as any)?.meta?.local_first);
  return { effective: localFirst ? "workspace" : "diagnostics", source: "config" };
}

function preview(s: unknown, n = 100): string {
  const t = String(s ?? "");
  const oneLine = t.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}

function isLocalProvider(p: ProviderName) {
  return p === "ollama";
}

async function listReceiptFiles(): Promise<string[]> {
  const dir = receiptsDir();
  const files = await readdir(dir).catch(() => []);
  return files.filter((f) => f.endsWith(".json"));
}

/**
 * Capability helpers
 */
async function getEffectivePolicy(cfg: any) {
  const zoneEff = effectiveSafetyZone(cfg);
  const zone = normalizeZone(zoneEff.effective);
  const loaded = await loadCapabilityPolicy(zensquidRoot());
  const zp = zonePolicy(loaded.policy, zone);

  return {
    zone,
    zone_source: zoneEff.source,
    policy_path: loaded.policyPath,
    project_root: loaded.projectRootResolved,
    global_denies: loaded.policy.global_denies ?? [],
    zone_allow: zp.allow,
    zone_deny: zp.deny,
    exec_allowlist: zp.exec_allowlist,
    exec_denylist: zp.exec_denylist,
    policy: loaded.policy,
    projectRootResolved: loaded.projectRootResolved
  };
}

function withKind(kind: RequestKind, base: any) {
  return {
    ...base,
    request: {
      ...(base.request ?? {}),
      kind
    }
  };
}

async function gateOrDenyTool(args: {
  cfg: any;
  action: CapabilityAction;
  reply: any;
  receiptBase: Partial<ReceiptV1>;
}) {
  const eff = await getEffectivePolicy(args.cfg);
  const decision = await checkCapabilityAction({
    action: args.action,
    zone: eff.zone,
    policy: eff.policy,
    projectRootResolved: eff.projectRootResolved
  });

  const receipt: any = withKind("tool", {
    schema: "zensquid.receipt.v1",
    receipt_id: (args.receiptBase as any).receipt_id,
    created_at: (args.receiptBase as any).created_at,
    node: (args.receiptBase as any).node,
    request: (args.receiptBase as any).request ?? {},
    decision: (args.receiptBase as any).decision ?? {},
    tool_event: {
      zone: eff.zone,
      capability: decision.capability,
      allowed: decision.allowed,
      reason: decision.reason,
      matched_rule: decision.matched_rule,
      action: args.action
    }
  });

  await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

  if (!decision.allowed) {
    return args.reply.code(403).send({
      ok: false,
      error: "Denied by capability gate",
      zone: eff.zone,
      capability: decision.capability,
      reason: decision.reason,
      matched_rule: decision.matched_rule,
      receipt_id: (receipt as any).receipt_id
    });
  }

  return null; // allowed
}

/**
 * Agent text loading (SOUL + IDENTITY)
 */
async function safeReadText(p: string, maxBytes = 200_000): Promise<string> {
  try {
    const st = await stat(p);
    if (!st.isFile()) return "";
    const raw = await readFile(p, "utf-8");
    if (st.size > maxBytes) return raw.slice(0, maxBytes) + "\n…(truncated)\n";
    return raw;
  } catch {
    return "";
  }
}

async function loadAgentTexts() {
  const soul = await safeReadText(soulFile());
  const identity = await safeReadText(identityFile());
  return { soul, identity };
}

/**
 * Memory search for chat (simple + fast enough)
 */
function extractKeywords(input: string): string[] {
  const raw = input
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_/]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const stop = new Set([
    "the",
    "and",
    "or",
    "to",
    "of",
    "a",
    "an",
    "is",
    "are",
    "am",
    "be",
    "been",
    "being",
    "i",
    "you",
    "we",
    "they",
    "it",
    "this",
    "that",
    "these",
    "those",
    "for",
    "with",
    "on",
    "in",
    "at",
    "from",
    "as",
    "by",
    "do",
    "does",
    "did",
    "done",
    "not",
    "no",
    "yes",
    "ok",
    "please",
    "can",
    "could",
    "would",
    "should",
    "will",
    "just",
    "like"
  ]);

  const filtered = raw.filter((w) => w.length >= 4 && !stop.has(w));
  return [...new Set(filtered)].slice(0, 8);
}

async function walkMarkdownFiles(root: string, maxFiles = 600): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    if (out.length >= maxFiles) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      const p = path.resolve(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".markdown"))) out.push(p);
    }
  }
  await walk(root);
  return out;
}

type MemoryHit = { rel: string; score: number; snippet: string };

function makeSnippet(text: string, needle: string, maxLen = 180): string {
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return preview(text, maxLen);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + 120);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return slice.length > maxLen ? slice.slice(0, maxLen - 1) + "…" : slice;
}

async function searchMemoryForChat(input: string, maxHits = 5): Promise<MemoryHit[]> {
  const root = memoryRoot();
  const keywords = extractKeywords(input);
  if (keywords.length === 0) return [];

  const files = await walkMarkdownFiles(root, 600);
  const hits: MemoryHit[] = [];

  for (const abs of files) {
    const raw = await safeReadText(abs, 120_000);
    if (!raw) continue;

    let score = 0;
    let bestNeedle = "";

    for (const k of keywords) {
      const count = raw.toLowerCase().split(k).length - 1;
      if (count > 0) {
        score += Math.min(6, count) * 2;
        if (!bestNeedle) bestNeedle = k;
      }
    }

    if (score > 0) {
      const rel = path.relative(zensquidRoot(), abs).replace(/\\/g, "/");
      hits.push({ rel, score, snippet: makeSnippet(raw, bestNeedle || keywords[0]) });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, maxHits);
}

/**
 * Skill doc loading (for chat context)
 */
async function loadSkillDoc(skillName: string): Promise<string> {
  const safe = String(skillName ?? "").trim();
  if (!safe) return "";
  if (safe.includes("..") || safe.includes("/") || safe.includes("\\")) return "";
  const p = path.resolve(skillsRoot(), safe, "skill.md");
  return await safeReadText(p, 120_000);
}

/**
 * ✅ Intelligence-visible chat context
 */
type ChatContextUsed = {
  base: boolean;
  identity: boolean;
  soul: boolean;
  skill: string | null;
  memory_hit_count: number;
};

type ChatContextMemoryHit = { path: string; score: number; snippet: string };

type SuggestedAction = {
  type: "suggest_memory_write";
  folder: string;
  filename_hint: string;
  suggested_path: string;
  content: string;
  source: "deterministic_parser";
  confidence: 1.0;
  requires_approval: true;
  raw_trigger: string;
};

type ChatContextMeta = {
  used: ChatContextUsed;
  memory_hits: ChatContextMemoryHit[];
  actions: SuggestedAction[];
};

/**
 * Deterministic Memory Suggestion Parser (NO LLM)
 */
function normalizeSpaces(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function sanitizeFolderName(folder: string): string {
  const cleaned = normalizeSpaces(folder).replace(/[^\w\-\/ ]/g, "").trim();
  if (!cleaned) return "general";
  if (cleaned.startsWith("/")) return "general";
  if (cleaned.includes("..")) return "general";
  return cleaned;
}

function slugifySimple(s: string, maxLen = 48): string {
  const t = String(s ?? "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const out = t.slice(0, maxLen);
  return out.length > 0 ? out : "note";
}

function safeFolderPath(folder: string): string {
  const cleaned = sanitizeFolderName(folder);
  const parts = cleaned
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => slugifySimple(p, 32));

  if (parts.length === 0) return "general";
  return parts.join("/");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatLocalStamp(d: Date): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${m}-${day}_${hh}${mm}`;
}

function djb2Hex(s: string): string {
  let h = 5381;
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h >>>= 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}

function buildSuggestedMemoryPath(args: { folder: string; content: string; now: Date }): string {
  const folderSafe = safeFolderPath(args.folder);
  const stamp = formatLocalStamp(args.now);
  const slug = slugifySimple(args.content, 48);
  const hash = djb2Hex(args.content);
  const filename = `${stamp}_${slug}-${hash}.md`;
  return `${folderSafe}/${filename}`;
}

function parseMemorySuggestion(inputRaw: string, now: Date): SuggestedAction | null {
  const raw = String(inputRaw ?? "");
  const trimmed = raw.trim();
  if (!trimmed) return null;

  {
    const m = trimmed.match(/^\s*log this under\s+([^:]{1,64})\s*:\s*([\s\S]+)$/i);
    if (m) {
      const folder = sanitizeFolderName(String(m[1] ?? ""));
      const content = String(m[2] ?? "").trim();
      if (content.length > 0) {
        const suggested_path = buildSuggestedMemoryPath({ folder, content, now });
        return {
          type: "suggest_memory_write",
          folder,
          filename_hint: "remembered-note.md",
          suggested_path,
          content,
          source: "deterministic_parser",
          confidence: 1.0,
          requires_approval: true,
          raw_trigger: "log this under"
        };
      }
    }
  }

  const triggers = ["remember this", "save this", "store this", "add to long term", "add to long-term", "add to memory"];
  for (const t of triggers) {
    const re = new RegExp(`^\\s*(${t})\\s*:\\s*([\\s\\S]+)$`, "i");
    const m = trimmed.match(re);
    if (m) {
      const content = String(m[2] ?? "").trim();
      if (content.length > 0) {
        const folder = "general";
        const suggested_path = buildSuggestedMemoryPath({ folder, content, now });
        return {
          type: "suggest_memory_write",
          folder,
          filename_hint: "remembered-note.md",
          suggested_path,
          content,
          source: "deterministic_parser",
          confidence: 1.0,
          requires_approval: true,
          raw_trigger: String(m[1] ?? t)
        };
      }
    }
  }

  {
    const m = trimmed.match(/^\s*remember this[.\s]+([\s\S]+)$/i);
    if (m) {
      const content = String(m[1] ?? "").trim();
      if (content.length > 0) {
        const folder = "general";
        const suggested_path = buildSuggestedMemoryPath({ folder, content, now });
        return {
          type: "suggest_memory_write",
          folder,
          filename_hint: "remembered-note.md",
          suggested_path,
          content,
          source: "deterministic_parser",
          confidence: 1.0,
          requires_approval: true,
          raw_trigger: "remember this."
        };
      }
    }
  }

  return null;
}

/**
 * Agent profile (used by UI)
 */
app.get("/agent/profile", async () => {
  const soul = await safeReadText(soulFile());
  const identity = await safeReadText(identityFile());
  const soulBytes = Buffer.byteLength(soul, "utf-8");
  const identityBytes = Buffer.byteLength(identity, "utf-8");

  return {
    ok: true,
    agent: {
      name: "Squidley",
      program: "ZenSquid"
    },
    files: {
      soul: { path: soulFile(), bytes: soulBytes },
      identity: { path: identityFile(), bytes: identityBytes }
    }
  };
});

/**
 * Snapshot (kept here for now)
 */
app.get("/snapshot", async () => {
  const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
  const effStrict = effectiveStrictLocal(cfg);
  const effZone = effectiveSafetyZone(cfg);

  return {
    ok: true,
    node: cfg.meta.node,
    ollama_base: cfg.providers.ollama.base_url,
    tiers: cfg.tiers.map((t: any) => ({ name: t.name, provider: t.provider, model: t.model })),
    budgets: {
      ...cfg.budgets,
      strict_local_only: effStrict.effective,
      strict_local_only_source: effStrict.source
    },
    runtime: {
      safety_zone: effZone.effective,
      safety_zone_source: effZone.source
    }
  };
});

/**
 * Heartbeat (hard local)
 */
app.post("/heartbeat", async (req, reply) => {
  const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);

  const receipt_id = newReceiptId();
  const started = Date.now();

  const body = (req.body ?? {}) as any;
  const prompt =
    typeof body?.prompt === "string" && body.prompt.trim().length > 0 ? body.prompt.trim() : "Return exactly: OK";

  const hbModel = process.env.ZENSQUID_HEARTBEAT_MODEL ?? (cfg as any)?.heartbeat?.model ?? "qwen2.5:7b-instruct";

  const messages = [
    { role: "system", content: "You are a heartbeat check. Follow user instruction precisely." },
    { role: "user", content: prompt }
  ] as const;

  try {
    const out = await ollamaChat({
      baseUrl: cfg.providers.ollama.base_url,
      model: hbModel,
      messages: [...messages]
    });

    const ms = Date.now() - started;

    const receipt: any = withKind("heartbeat", {
      schema: "zensquid.receipt.v1",
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: { input: prompt, mode: "heartbeat" },
      decision: {
        tier: "heartbeat",
        provider: "ollama",
        model: hbModel,
        escalated: false,
        escalation_reason: null
      },
      meta: { ms }
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.send({
      ok: true,
      output: (out as any).output,
      provider: "ollama",
      model: hbModel,
      receipt_id,
      ms
    });
  } catch (e: any) {
    const ms = Date.now() - started;

    const receipt: any = withKind("heartbeat", {
      schema: "zensquid.receipt.v1",
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: { input: prompt, mode: "heartbeat" },
      decision: {
        tier: "heartbeat",
        provider: "ollama",
        model: hbModel,
        escalated: false,
        escalation_reason: null
      },
      error: { message: String(e?.message ?? e) },
      meta: { ms }
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.code(503).send({
      ok: false,
      error: "Heartbeat failed (ollama)",
      provider: "ollama",
      model: hbModel,
      receipt_id,
      ms
    });
  }
});

/**
 * ✅ Memory API (admin-only)
 */
app.get("/memory/folders", async (req, reply) => {
  if (!adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
  await ensureMemoryRoot();
  const entries = await readdir(memoryRoot(), { withFileTypes: true }).catch(() => []);
  const folders = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  return reply.send({ ok: true, count: folders.length, folders });
});

app.get("/memory/list", async (req, reply) => {
  if (!adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
  await ensureMemoryRoot();

  const url = new URL(req.url, "http://127.0.0.1");
  const folderRaw = url.searchParams.get("folder") ?? "";
  const folder = normalizeRelPath(folderRaw);
  if (!folder) return reply.code(400).send({ ok: false, error: "Missing/invalid folder" });

  const absFolder = memoryAbs(folder);
  const entries = await readdir(absFolder, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((e) => e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".markdown")))
    .map((e) => `${folder}/${e.name}`.replace(/\\/g, "/"))
    .sort();

  return reply.send({ ok: true, folder: `memory/${folder}`, count: files.length, files });
});

app.get("/memory/read", async (req, reply) => {
  if (!adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
  await ensureMemoryRoot();

  const url = new URL(req.url, "http://127.0.0.1");
  const relRaw = url.searchParams.get("path") ?? "";
  const rel = normalizeRelPath(relRaw);
  if (!rel) return reply.code(400).send({ ok: false, error: "Missing/invalid path" });

  const abs = memoryAbs(rel);

  const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
  const receipt_id = newReceiptId();
  const base: Partial<ReceiptV1> = {
    receipt_id,
    created_at: new Date().toISOString(),
    node: cfg.meta.node,
    request: { input: `[memory read] memory/${rel}` } as any,
    decision: { tier: "tool", provider: "local", model: "fs.read", escalated: false } as any
  };

  const deny = await gateOrDenyTool({
    cfg,
    action: { kind: "fs.read", capability: "fs.read", path: abs },
    reply,
    receiptBase: base
  });
  if (deny) return deny;

  const content = await safeReadText(abs, 200_000);
  return reply.send({ ok: true, path: `memory/${rel}`, abs, content, receipt_id });
});

app.post("/memory/write", async (req, reply) => {
  if (!adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
  await ensureMemoryRoot();

  const body = (req.body ?? {}) as any;
  const rel = normalizeRelPath(body?.path ?? "");
  const content = typeof body?.content === "string" ? body.content : null;

  if (!rel || content === null) {
    return reply.code(400).send({ ok: false, error: "Missing/invalid path or content" });
  }

  const abs = memoryAbs(rel);

  const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
  const receipt_id = newReceiptId();
  const base: Partial<ReceiptV1> = {
    receipt_id,
    created_at: new Date().toISOString(),
    node: cfg.meta.node,
    request: { input: `[memory write] memory/${rel}` } as any,
    decision: { tier: "tool", provider: "local", model: "fs.write", escalated: false } as any
  };

  const deny = await gateOrDenyTool({
    cfg,
    action: { kind: "fs.write", capability: "fs.write", path: abs, bytes: Buffer.byteLength(content) },
    reply,
    receiptBase: base
  });
  if (deny) return deny;

  await mkdir(path.dirname(abs), { recursive: true }).catch(() => {});
  await writeFile(abs, content, "utf-8");

  return reply.send({
    ok: true,
    path: `memory/${rel}`,
    abs,
    bytes: Buffer.byteLength(content),
    receipt_id
  });
});

app.get("/memory/search", async (req, reply) => {
  if (!adminTokenOk(req)) return reply.code(401).send({ ok: false, error: "Unauthorized" });
  await ensureMemoryRoot();

  const url = new URL(req.url, "http://127.0.0.1");
  const q = (url.searchParams.get("q") ?? "").trim();
  const folderRaw = (url.searchParams.get("folder") ?? "").trim();

  if (!q) return reply.code(400).send({ ok: false, error: "Missing q" });

  let folderAbs = memoryRoot();
  let folderRelPrefix = "memory";

  if (folderRaw) {
    const cleaned = folderRaw.startsWith("memory/") ? folderRaw.slice("memory/".length) : folderRaw;
    const rel = normalizeRelPath(cleaned);
    if (!rel) return reply.code(400).send({ ok: false, error: "Invalid folder" });
    folderAbs = memoryAbs(rel);
    folderRelPrefix = `memory/${rel}`;
  }

  const files = await walkMarkdownFiles(folderAbs, 600);
  const results: Array<{ path: string; snippet: string }> = [];

  for (const abs of files) {
    const raw = await safeReadText(abs, 120_000);
    if (!raw) continue;
    if (raw.toLowerCase().includes(q.toLowerCase())) {
      const rel = path.relative(zensquidRoot(), abs).replace(/\\/g, "/");
      results.push({
        path: rel,
        snippet: makeSnippet(raw, q, 140)
      });
    }
    if (results.length >= 50) break;
  }

  return reply.send({ ok: true, q, folder: folderRelPrefix, count: results.length, results });
});

/**
 * Chat — uses Soul/Identity/Memory (+ optional skill context)
 */
function detectPromptInjection(input: string): { blocked: boolean; reason?: string } {
  const s = (input ?? "").toLowerCase();

  const patterns: Array<{ id: string; re: RegExp }> = [
    { id: "ignore_previous", re: /\bignore (all|any|the) (previous|prior) (instructions|rules|messages)\b/i },
    { id: "override_system", re: /\boverride (the )?(system|developer) (prompt|message|instructions)\b/i },
    { id: "reveal_system", re: /\b(reveal|show|print|dump|leak) (the )?(system|developer) (prompt|message|instructions)\b/i },
    { id: "bypass_safety", re: /\b(bypass|disable|remove) (safety|filters|guardrails|policy)\b/i },
    { id: "act_as_root", re: /\b(act as|you are now|pretend to be) (root|administrator|admin|system)\b/i }
  ];

  for (const p of patterns) {
    if (p.re.test(s)) return { blocked: true, reason: `prompt_injection:${p.id}` };
  }

  return { blocked: false };
}

function looksInfraOrTooling(input: string): boolean {
  const s = input.toLowerCase();
  return (
    s.includes("zensquid") ||
    s.includes("squidley") ||
    s.includes("openclaw") ||
    s.includes("receipt") ||
    s.includes("receipts") ||
    s.includes("snapshot") ||
    s.includes("doctor") ||
    s.includes("sanity") ||
    s.includes("systemctl") ||
    s.includes("journalctl") ||
    s.includes("curl ") ||
    s.includes("port ") ||
    s.includes("http://") ||
    s.includes("https://") ||
    s.includes("/health") ||
    s.includes("/runtime") ||
    s.includes("/skills") ||
    s.includes("/memory")
  );
}

function looksCodey(input: string): boolean {
  const s = input.toLowerCase();
  return (
    s.includes("diff --git") ||
    s.includes("--- a/") ||
    s.includes("+++ b/") ||
    s.includes("@@ ") ||
    s.includes("stack trace") ||
    s.includes("traceback") ||
    s.includes("tsconfig") ||
    s.includes("package.json") ||
    s.includes("systemd") ||
    s.includes("dockerfile") ||
    s.includes("error ts") ||
    s.includes("cannot find module") ||
    s.includes("module not found")
  );
}

app.post<{ Body: ChatRequest & { selected_skill?: string | null } }>("/chat", async (req, reply) => {
  const cfg = await loadConfig(process.env.ZENSQUID_CONFIG);
  const body = (req.body ?? {}) as Partial<ChatRequest> & { selected_skill?: string | null };

  const input = typeof body.input === "string" ? body.input.trim() : "";
  const selectedSkill = typeof body.selected_skill === "string" ? body.selected_skill : null;

  if (!input) return reply.code(400).send({ error: "Missing input" });

  const inj = detectPromptInjection(input);
  if (inj.blocked) {
    const receipt_id = newReceiptId();
    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1" as any,
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: {
        input,
        mode: body.mode ?? "auto",
        force_tier: body.force_tier,
        reason: body.reason,
        selected_skill: selectedSkill
      },
      decision: {
        tier: "guard",
        provider: "local",
        model: "prompt-injection-guard",
        escalated: false,
        escalation_reason: null
      },
      guard_event: {
        blocked: true,
        reason: inj.reason
      }
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.code(400).send({
      error: "Potential prompt injection detected",
      reason: inj.reason,
      receipt_id
    });
  }

  const now = new Date();

  // ✅ Deterministic parse BEFORE model call (no LLM)
  const preSuggestion = parseMemorySuggestion(input, now);

  // Build dynamic system prompt + intelligence-visible meta context
  const { system, meta } = await buildChatSystemPrompt({
    input,
    selected_skill: selectedSkill,
    now
  });

  // Ensure action list is ALWAYS present, and include the pre-parse suggestion
  (meta as any).actions = Array.isArray((meta as any).actions) ? (meta as any).actions : [];
  if (preSuggestion) {
    const exists =
      (meta as any).actions.some(
        (a: any) =>
          a.type === "suggest_memory_write" &&
          a.folder === preSuggestion.folder &&
          a.content === preSuggestion.content &&
          a.raw_trigger === preSuggestion.raw_trigger
      ) ?? false;

    if (!exists) (meta as any).actions.push(preSuggestion);
  }

  const normalized: ChatRequest = {
    input,
    mode: body.mode ?? "auto",
    force_tier: body.force_tier,
    reason: body.reason
  };

  if (normalized.mode === "auto" && looksInfraOrTooling(normalized.input)) {
    normalized.mode = "force_tier";
    normalized.force_tier = "local";
  }

  if (normalized.mode === "auto" && looksCodey(normalized.input)) {
    normalized.mode = "force_tier";
    normalized.force_tier = "coder";
  }

  // IMPORTANT: apply runtime override into cfg BEFORE tier selection
  const effStrict = effectiveStrictLocal(cfg);
  (cfg as any).budgets = (cfg as any).budgets ?? {};
  (cfg as any).budgets.strict_local_only = effStrict.effective;

  const decision = chooseTier(cfg, normalized);
  const receipt_id = newReceiptId();

  const strictLocalOnly = effStrict.effective;

  // ✅ If memory suggestion exists, write a receipt about the suggestion (NOT a write)
  if ((meta as any).actions.length > 0) {
    try {
      const receipt: any = withKind("system", {
        schema: "zensquid.receipt.v1" as any,
        receipt_id: newReceiptId(),
        created_at: new Date().toISOString(),
        node: cfg.meta.node,
        request: { input: `[memory suggestion] ${preview(input, 200)}` },
        decision: {
          tier: "deterministic",
          provider: "local",
          model: "memory-suggest",
          escalated: false,
          escalation_reason: null
        },
        memory_suggestion: (meta as any).actions.map((a: any) => ({
          folder: a.folder,
          filename_hint: a.filename_hint,
          suggested_path: a.suggested_path,
          content_preview: preview(a.content, 160),
          requires_approval: a.requires_approval,
          trigger: a.raw_trigger
        }))
      });
      await writeReceipt(zensquidRoot(), receipt as ReceiptV1);
    } catch {
      // best-effort; do not fail chat on receipt error
    }
  }

  if (strictLocalOnly && decision.tier.provider !== "ollama") {
    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1" as any,
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: {
        input: normalized.input,
        mode: normalized.mode ?? "auto",
        force_tier: normalized.force_tier,
        reason: normalized.reason,
        selected_skill: selectedSkill
      },
      decision: {
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        escalated: true,
        escalation_reason: `blocked: strict_local_only enabled (source=${effStrict.source})`
      },
      context: meta
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.code(403).send({
      error: "Strict local mode enabled: non-local providers are blocked",
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      receipt_id,
      context: meta
    });
  }

  const needsReason = !isLocalProvider(decision.tier.provider);
  const hasReason = typeof normalized.reason === "string" && normalized.reason.trim().length > 0;

  if (needsReason && cfg.budgets.escalation_requires_reason && !hasReason) {
    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1" as any,
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: {
        input: normalized.input,
        mode: normalized.mode ?? "auto",
        force_tier: normalized.force_tier,
        reason: normalized.reason,
        selected_skill: selectedSkill
      },
      decision: {
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        escalated: true,
        escalation_reason: "blocked: missing required reason for non-local escalation"
      },
      context: meta
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.code(400).send({
      error: "Escalation reason required for non-local providers",
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      receipt_id,
      context: meta
    });
  }

  const messages = [
    { role: "system", content: system },
    { role: "user", content: normalized.input }
  ] as const;

  // ===============================
  // OLLAMA (local)
  // ===============================
  if (decision.tier.provider === "ollama") {
    const out = await ollamaChat({
      baseUrl: cfg.providers.ollama.base_url,
      model: decision.tier.model,
      messages: [...messages]
    });

    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1",
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: {
        input: normalized.input,
        mode: normalized.mode ?? "auto",
        force_tier: normalized.force_tier,
        reason: normalized.reason,
        selected_skill: selectedSkill
      },
      decision: {
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        escalated: decision.escalated,
        escalation_reason: decision.escalation_reason
      },
      context: meta,
      provider_response: out.raw
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.send({
      output: out.output,
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      receipt_id,
      escalated: decision.escalated,
      escalation_reason: decision.escalation_reason,
      context: meta
    });
  }

  // ===============================
  // MODELSTUDIO (DashScope OpenAI-compatible)
  // ===============================
  if (decision.tier.provider === "modelstudio") {
    const apiKey =
      process.env.DASHSCOPE_API_KEY ??
      process.env.ZENSQUID_MODELSTUDIO_API_KEY ??
      process.env.MODELSTUDIO_API_KEY ??
      "";

    const baseUrl =
      (cfg as any)?.providers?.modelstudio?.base_url ??
      process.env.ZENSQUID_MODELSTUDIO_BASE_URL ??
      process.env.MODELSTUDIO_BASE_URL ??
      "https://dashscope-us.aliyuncs.com/compatible-mode/v1";

    if (!apiKey || apiKey.trim().length < 10) {
      const receipt: any = withKind("chat", {
        schema: "zensquid.receipt.v1",
        receipt_id,
        created_at: new Date().toISOString(),
        node: cfg.meta.node,
        request: {
          input: normalized.input,
          mode: normalized.mode ?? "auto",
          force_tier: normalized.force_tier,
          reason: normalized.reason,
          selected_skill: selectedSkill
        },
        decision: {
          tier: decision.tier.name,
          provider: decision.tier.provider,
          model: decision.tier.model,
          escalated: true,
          escalation_reason: "blocked: missing DASHSCOPE_API_KEY"
        },
        context: meta
      });

      await writeReceipt(zensquidRoot(), receipt);

      return reply.code(400).send({
        error: "Missing DASHSCOPE_API_KEY for modelstudio provider",
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        receipt_id,
        context: meta
      });
    }

    const out = await modelstudioChat({
      baseUrl,
      model: decision.tier.model,
      messages: [...messages],
      apiKey
    });

    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1",
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: {
        input: normalized.input,
        mode: normalized.mode ?? "auto",
        force_tier: normalized.force_tier,
        reason: normalized.reason,
        selected_skill: selectedSkill
      },
      decision: {
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        escalated: decision.escalated,
        escalation_reason: decision.escalation_reason
      },
      context: meta,
      provider_response: out.raw
    });

    await writeReceipt(zensquidRoot(), receipt);

    return reply.send({
      output: out.content,
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      receipt_id,
      escalated: decision.escalated,
      escalation_reason: decision.escalation_reason,
      context: meta
    });
  }

  // ===============================
  // OPENAI (lazy import)
  // ===============================
  if (decision.tier.provider === "openai") {
    const { openaiChat } = await import("@zensquid/provider-openai");

    const apiKey = process.env.ZENSQUID_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? undefined;

    const apiKeyFile = process.env.ZENSQUID_OPENAI_KEY_FILE ?? process.env.OPENAI_API_KEY_FILE ?? undefined;

    const out = await openaiChat({
      model: decision.tier.model,
      messages: [...messages],
      apiKey,
      apiKeyFile
    });

    const receipt: any = withKind("chat", {
      schema: "zensquid.receipt.v1" as any,
      receipt_id,
      created_at: new Date().toISOString(),
      node: cfg.meta.node,
      request: {
        input: normalized.input,
        mode: normalized.mode ?? "auto",
        force_tier: normalized.force_tier,
        reason: normalized.reason,
        selected_skill: selectedSkill
      },
      decision: {
        tier: decision.tier.name,
        provider: decision.tier.provider,
        model: decision.tier.model,
        escalated: decision.escalated,
        escalation_reason: decision.escalation_reason
      },
      context: meta,
      provider_response: (out as any).raw
    });

    await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

    return reply.send({
      output: (out as any).output,
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      receipt_id,
      escalated: decision.escalated,
      escalation_reason: decision.escalation_reason,
      context: meta
    });
  }

  const receipt: any = withKind("chat", {
    schema: "zensquid.receipt.v1" as any,
    receipt_id,
    created_at: new Date().toISOString(),
    node: cfg.meta.node,
    request: {
      input: normalized.input,
      mode: normalized.mode ?? "auto",
      force_tier: normalized.force_tier,
      reason: normalized.reason,
      selected_skill: selectedSkill
    },
    decision: {
      tier: decision.tier.name,
      provider: decision.tier.provider,
      model: decision.tier.model,
      escalated: decision.escalated,
      escalation_reason: "provider not implemented yet"
    },
    context: meta
  });

  await writeReceipt(zensquidRoot(), receipt as ReceiptV1);

  return reply.code(501).send({
    error: "Provider not implemented yet",
    tier: decision.tier.name,
    provider: decision.tier.provider,
    model: decision.tier.model,
    receipt_id,
    context: meta
  });
});

const port = Number(process.env.ZENSQUID_PORT ?? "18790");
const host = process.env.ZENSQUID_HOST ?? "127.0.0.1";

/**
 * Extracted route modules
 */
await registerSkillsRoutes(app, { zensquidRoot });

await registerToolsRoutes(app, {
  adminTokenOk,
  gateOrDenyTool,
  safeReadText
});

await registerReceiptsRoutes(app, {
  zensquidRoot,
  receiptsDir,
  preview
});

await registerDoctorRoutes(app, {
  receiptsDir,
  effectiveStrictLocal,
  effectiveSafetyZone
});

await registerRuntimeRoutes(app, {
  adminTokenOk,
  loadState: runtimePaths.loadRuntimeState,
  saveState: runtimePaths.saveRuntimeState,
  getState: getRuntimeState,
  setState: setRuntimeState,
  effectiveStrictLocal,
  effectiveSafetyZone,
  getEffectivePolicy
});

await app.listen({ port, host });