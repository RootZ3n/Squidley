// apps/api/src/chat/pendingTools.ts
//
// In-memory store for pending tool proposals awaiting user approval.
// Keyed by session_id. Sessions expire after 10 minutes of inactivity.
// No persistence — intentional. Pending approvals don't survive restarts.

import type { ToolProposal } from "./toolDetector.js";

export type PendingToolSession = {
  session_id: string;
  proposal: ToolProposal;
  // The model's original response that contained the proposal
  original_response: string;
  created_at: number;
  expires_at: number;
};

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SESSIONS = 200; // prevent unbounded growth

const store = new Map<string, PendingToolSession>();

// Purge expired sessions
function purge() {
  const now = Date.now();
  for (const [id, s] of store) {
    if (s.expires_at < now) store.delete(id);
  }
  // If still over limit, evict oldest
  if (store.size > MAX_SESSIONS) {
    const sorted = [...store.entries()].sort((a, b) => a[1].created_at - b[1].created_at);
    for (const [id] of sorted.slice(0, store.size - MAX_SESSIONS)) {
      store.delete(id);
    }
  }
}

export function storePending(session_id: string, proposal: ToolProposal, original_response: string): void {
  purge();
  const now = Date.now();
  store.set(session_id, {
    session_id,
    proposal,
    original_response,
    created_at: now,
    expires_at: now + SESSION_TTL_MS,
  });
}

export function getPending(session_id: string): PendingToolSession | null {
  purge();
  const s = store.get(session_id);
  if (!s) return null;
  if (s.expires_at < Date.now()) {
    store.delete(session_id);
    return null;
  }
  return s;
}

export function clearPending(session_id: string): void {
  store.delete(session_id);
}

export function hasPending(session_id: string): boolean {
  return getPending(session_id) !== null;
}
