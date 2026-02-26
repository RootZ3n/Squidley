// apps/remote/lib/api.ts
// Talks to squidley-api (port 18790) from the remote cockpit server-side.
// All requests include the admin token from env.

const API_BASE = process.env.SQUIDLEY_API_URL ?? "http://127.0.0.1:18790";
const ADMIN_TOKEN = process.env.ZENSQUID_ADMIN_TOKEN ?? "";

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-zensquid-admin-token": ADMIN_TOKEN,
  };
}

export type HealthResult = {
  ok: boolean;
  name?: string;
  error?: string;
};

export type SnapshotResult = {
  ok: boolean;
  node?: string;
  ollama_base?: string;
  tiers?: Array<{ name: string; provider: string; model: string }>;
  budgets?: {
    strict_local_only: boolean;
    strict_local_only_source: string;
  };
  runtime?: {
    safety_zone: string;
    safety_zone_source: string;
  };
  onboarding?: { completed: boolean };
  error?: string;
};

export type Receipt = {
  receipt_id: string;
  created_at: string;
  schema?: string;
  request?: {
    input?: string;
    mode?: string;
    kind?: string;
  };
  decision?: {
    tier?: string;
    provider?: string;
    model?: string;
    escalated?: boolean;
    escalation_reason?: string | null;
    active_model?: { label?: string };
  };
  guard_event?: {
    blocked: boolean;
    reason?: string;
    score?: number;
  };
  tool_event?: {
    zone?: string;
    capability?: string;
    allowed?: boolean;
    reason?: string;
  };
  error?: { message?: string };
  meta?: { ms?: number };
};

export type ReceiptsResult = {
  ok: boolean;
  receipts?: Receipt[];
  total?: number;
  error?: string;
};

export type HeartbeatResult = {
  ok: boolean;
  output?: string;
  provider?: string;
  model?: string;
  ms?: number;
  error?: string;
};

export type PendingApproval = {
  plan_id: string;
  workspace: string;
  goal: string;
  steps: Array<{
    tool: string;
    args?: Record<string, unknown>;
    label?: string;
  }>;
  created_at: string;
};

export type AutonomyPolicyResult = {
  ok: boolean;
  policy?: {
    mode_default: string;
    stop_on_fail_default: boolean;
    allowlist: Array<{ id: string }>;
    notes: string[];
  };
  error?: string;
};

async function safeFetch<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
    const json = await res.json();
    return json as T;
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? "fetch failed") } as T;
  }
}

export async function getHealth(): Promise<HealthResult> {
  return safeFetch<HealthResult>(`${API_BASE}/health`);
}

export async function getSnapshot(): Promise<SnapshotResult> {
  return safeFetch<SnapshotResult>(`${API_BASE}/snapshot`);
}

export async function getReceipts(limit = 10): Promise<ReceiptsResult> {
  return safeFetch<ReceiptsResult>(`${API_BASE}/receipts?limit=${limit}`);
}

export async function runHeartbeat(): Promise<HeartbeatResult> {
  return safeFetch<HeartbeatResult>(`${API_BASE}/heartbeat`, {
    method: "POST",
    body: JSON.stringify({ prompt: "Return exactly: OK" }),
  });
}

export async function getAutonomyPolicy(): Promise<AutonomyPolicyResult> {
  return safeFetch<AutonomyPolicyResult>(`${API_BASE}/autonomy/policy`);
}

export async function runAutonomy(body: {
  goal: string;
  steps: Array<{ tool: string; args?: Record<string, unknown> }>;
  stop_on_fail?: boolean;
}): Promise<{ ok: boolean; summary?: unknown; results?: unknown[]; error?: string }> {
  return safeFetch(`${API_BASE}/autonomy/run`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
