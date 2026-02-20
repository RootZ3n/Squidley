// apps/web/src/app/api/zensquid.ts
export const ZENSQUID_API =
  process.env.NEXT_PUBLIC_ZENSQUID_API || "http://127.0.0.1:18790";

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${ZENSQUID_API}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function apiPost<T = any>(path: string, body: any, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(`${ZENSQUID_API}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {})
    },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json && (json.error || json.message)) ? (json.error || json.message) : `${res.status}`;
    throw new Error(`POST ${path} failed: ${msg}`);
  }
  return json as T;
}

export type AgentProfile = {
  ok: true;
  agent: { name: string; program: string };
  files: {
    soul: { path: string; bytes: number };
    identity: { path: string; bytes: number };
  };
};

export type SkillsList = {
  count: number;
  skills: Array<{ name: string; has_skill_md: boolean }>;
};

export type ChatContext = {
  used?: {
    base: boolean;
    identity: boolean;
    soul: boolean;
    skill: string | null;
  };
  recall?: {
    memory_hit_count: number;
    memory_hits: Array<{ path: string; score: number }>;
  };
  actions?: Array<{
    type: string;
    folder?: string;
    filename_hint?: string;
    content?: string;
  }>;
};

export type ChatResponse = {
  output?: string;
  tier?: string;
  provider?: string;
  model?: string;
  receipt_id?: string;
  escalated?: boolean;
  escalation_reason?: string | null;
  context?: ChatContext; // <-- Option 1
  error?: string;
};

export async function getAgentProfile(): Promise<AgentProfile> {
  return apiGet<AgentProfile>("/agent/profile");
}

export async function getSkills(): Promise<SkillsList> {
  return apiGet<SkillsList>("/skills");
}

export async function chat(input: string, selected_skill?: string | null): Promise<ChatResponse> {
  return apiPost<ChatResponse>("/chat", {
    input,
    selected_skill: selected_skill ?? null
  });
}
