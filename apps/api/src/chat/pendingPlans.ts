// apps/api/src/chat/pendingPlans.ts
//
// Stores autonomy plans awaiting user approval in chat.
// Keyed by session_id. 30-minute TTL.

import crypto from "node:crypto";

export type PendingPlan = {
  session_id: string;
  plan_id: string;
  goal: string;
  steps: Array<{ tool: string; args?: Record<string, any> }>;
  created_at: number;
  expires_at: number;
};

const PLAN_TTL_MS = 30 * 60 * 1000;
const store = new Map<string, PendingPlan>();

function purge() {
  const now = Date.now();
  for (const [id, p] of store) {
    if (p.expires_at < now) store.delete(id);
  }
}

export function storePendingPlan(
  session_id: string,
  plan_id: string,
  goal: string,
  steps: Array<{ tool: string; args?: Record<string, any> }>
): PendingPlan {
  purge();
  const now = Date.now();
  const p: PendingPlan = {
    session_id,
    plan_id,
    goal,
    steps,
    created_at: now,
    expires_at: now + PLAN_TTL_MS,
  };
  store.set(session_id, p);
  return p;
}

export function getPendingPlan(session_id: string): PendingPlan | null {
  purge();
  const p = store.get(session_id);
  if (!p) return null;
  if (p.expires_at < Date.now()) {
    store.delete(session_id);
    return null;
  }
  return p;
}

export function clearPendingPlan(session_id: string): void {
  store.delete(session_id);
}

export function hasPendingPlan(session_id: string): boolean {
  return getPendingPlan(session_id) !== null;
}
