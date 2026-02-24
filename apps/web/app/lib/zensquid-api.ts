const BASE =
  process.env.NEXT_PUBLIC_ZENSQUID_API_BASE?.replace(/\/+$/, "") ??
  "/api/zsq";

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${url}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "content-type": "application/json"
    }
  });

  const text = await r.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!r.ok) {
    const err = new Error(`HTTP ${r.status} ${r.statusText}`);
    (err as any).status = r.status;
    (err as any).data = data;
    throw err;
  }

  return data as T;
}

export type Health = { ok: boolean; name: string };

export type HeartbeatResponse = {
  ok: boolean;
  output: string;
  provider: string;
  model: string;
  receipt_id: string;
  ms: number;
};

export type ChatResponse = {
  output: string;
  tier: string;
  provider: string;
  model: string;
  receipt_id: string;
  escalated: boolean;
  escalation_reason: string | null;
};

export type ReceiptsListResponse = {
  count: number;
  receipts: Array<{
    receipt_id: string;
    created_at: string;
    kind: string | null;
    tier: string | null;
    provider: string | null;
    model: string | null;
    escalated: boolean | null;
    escalation_reason: string | null;
    tool: { allowed: boolean; capability: string } | null;
    input_preview: string;
  }>;
};

export const zapi = {
  base: BASE,

  health: () => j<Health>("/health", { method: "GET" }),

  heartbeat: (prompt?: string) =>
    j<HeartbeatResponse>("/heartbeat", {
      method: "POST",
      body: JSON.stringify({ prompt: prompt ?? "Return exactly: OK" })
    }),

  chat: (input: string) =>
    j<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify({ input, mode: "auto" })
    }),

  receipts: (limit = 30) =>
    j<ReceiptsListResponse>(`/receipts?limit=${encodeURIComponent(String(limit))}`, {
      method: "GET"
    })
};
