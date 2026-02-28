// apps/api/src/chat/pendingTools.ts
//
// Pending tool proposals awaiting explicit user approval.
// Keyed by session_id. Sessions expire after 10 minutes of inactivity.
// Optional persistence: can survive restarts if SQUIDLEY_PENDING_PERSIST=true.
//
// Approval is nonce-based: user must reply "approve <code>" or "deny <code>".

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import type { ToolProposal } from "./toolDetector.js";

export type PendingToolSession = {
  session_id: string;
  proposal: ToolProposal;
  original_response: string;

  // Nonce required to approve/deny
  approval_code: string;

  created_at: number;
  expires_at: number;
};

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SESSIONS = 200;

const store = new Map<string, PendingToolSession>();

function persistEnabled(): boolean {
  return String(process.env.SQUIDLEY_PENDING_PERSIST ?? "false").trim().toLowerCase() === "true";
}

function pendingDir(): string {
  // Keep this in the repo if ZENSQUID_ROOT is set, otherwise fall back to ~/.squidley
  const root = process.env.ZENSQUID_ROOT ?? "";
  if (root) return path.resolve(root, "data", "pending_tools");
  return path.join(os.homedir(), ".squidley", "pending_tools");
}

async function persistWrite(s: PendingToolSession): Promise<void> {
  if (!persistEnabled()) return;
  const dir = pendingDir();
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, `${s.session_id}.json`);
  await fs.writeFile(fp, JSON.stringify(s, null, 2), "utf8");
}

async function persistDelete(session_id: string): Promise<void> {
  if (!persistEnabled()) return;
  const fp = path.join(pendingDir(), `${session_id}.json`);
  await fs.rm(fp, { force: true }).catch(() => {});
}

async function persistLoadAll(): Promise<void> {
  if (!persistEnabled()) return;
  const dir = pendingDir();
  const files = await fs.readdir(dir).catch(() => []);
  const now = Date.now();

  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const fp = path.join(dir, f);
    try {
      const raw = await fs.readFile(fp, "utf8");
      const j = JSON.parse(raw) as PendingToolSession;
      if (!j?.session_id || !j?.approval_code || !j?.proposal) continue;

      // Drop expired on load
      if (typeof j.expires_at === "number" && j.expires_at < now) {
        await fs.rm(fp, { force: true }).catch(() => {});
        continue;
      }

      store.set(j.session_id, j);
    } catch {
      // ignore corrupt file
    }
  }
}

// Fire-and-forget init load (safe)
void persistLoadAll();

function purge() {
  const now = Date.now();
  for (const [id, s] of store) {
    if (s.expires_at < now) {
      store.delete(id);
      void persistDelete(id);
    }
  }

  if (store.size > MAX_SESSIONS) {
    const sorted = [...store.entries()].sort((a, b) => a[1].created_at - b[1].created_at);
    for (const [id] of sorted.slice(0, store.size - MAX_SESSIONS)) {
      store.delete(id);
      void persistDelete(id);
    }
  }
}

function makeApprovalCode(): string {
  // short, human-typeable, low ambiguity
  return crypto.randomBytes(2).toString("hex").toUpperCase(); // e.g. "A3F9"
}

export async function storePending(
  session_id: string,
  proposal: ToolProposal,
  original_response: string
): Promise<PendingToolSession> {
  purge();
  const now = Date.now();
  const s: PendingToolSession = {
    session_id,
    proposal,
    original_response,
    approval_code: makeApprovalCode(),
    created_at: now,
    expires_at: now + SESSION_TTL_MS,
  };
  store.set(session_id, s);
  await persistWrite(s);
  return s;
}

export function getPending(session_id: string): PendingToolSession | null {
  purge();
  const s = store.get(session_id);
  if (!s) return null;
  if (s.expires_at < Date.now()) {
    store.delete(session_id);
    void persistDelete(session_id);
    return null;
  }
  return s;
}

export async function clearPending(session_id: string): Promise<void> {
  store.delete(session_id);
  await persistDelete(session_id);
}

export function hasPending(session_id: string): boolean {
  return getPending(session_id) !== null;
}