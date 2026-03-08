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
  ok: boolean;
  count: number;
  receipts: Array<{
    schema: string | null;
    receipt_id: string | null;
    created_at: string | null;
    node: string | null;
    request: {
      kind: string | null;
      mode: string | null;
      force_tier: string | null;
      selected_skill: string | null;
    };
    decision: {
      tier: string | null;
      provider: string | null;
      model: string | null;
      escalated: boolean | null;
      escalation_reason: string | null;
      active_model: {
        provider: string | null;
        model: string | null;
        model_class: string | null;
        param_b: number | null;
        class_source: string | null;
      } | null;
    };
    error: { message: string | null } | null;
    meta: {
      ms: number | null;
      toolrun: {
        tool_id?: string | null;
        ok?: boolean | null;
        exit_code?: number | null;
        timed_out?: boolean | null;
        statusCode?: number | null;
      } | null;
    };
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
