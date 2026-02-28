// apps/api/src/chat/pendingAgents.ts
//
// Stores agent run requests awaiting user approval in chat.
// Keyed by session_id. 30-minute TTL.

export type PendingAgent = {
  session_id: string;
  agent_name: string;
  focus?: string;
  created_at: number;
  expires_at: number;
};

const AGENT_TTL_MS = 30 * 60 * 1000;
const store = new Map<string, PendingAgent>();

function purge() {
  const now = Date.now();
  for (const [id, p] of store) {
    if (p.expires_at < now) store.delete(id);
  }
}

export function storePendingAgent(
  session_id: string,
  agent_name: string,
  focus?: string
): PendingAgent {
  purge();
  const now = Date.now();
  const p: PendingAgent = {
    session_id,
    agent_name,
    focus,
    created_at: now,
    expires_at: now + AGENT_TTL_MS,
  };
  store.set(session_id, p);
  return p;
}

export function getPendingAgent(session_id: string): PendingAgent | null {
  purge();
  const p = store.get(session_id);
  if (!p) return null;
  if (p.expires_at < Date.now()) {
    store.delete(session_id);
    return null;
  }
  return p;
}

export function clearPendingAgent(session_id: string): void {
  store.delete(session_id);
}

export function hasPendingAgent(session_id: string): boolean {
  return getPendingAgent(session_id) !== null;
}
