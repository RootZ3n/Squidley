// apps/web/app/api/zensquid/index.ts

export const ZENSQUID_API =
  process.env.NEXT_PUBLIC_ZENSQUID_API || "http://127.0.0.1:18790";

/** ---------- shared helpers ---------- */

async function parseJsonOrText(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text || `HTTP ${res.status}` };
  }
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${ZENSQUID_API}${path}`, {
    method: "GET",
    headers: { "content-type": "application/json" }
  });
  return (await parseJsonOrText(res)) as T;
}

export async function apiPost<T = any>(
  path: string,
  payload: any,
  adminToken?: string
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (adminToken) headers["x-zensquid-admin-token"] = adminToken;

  const res = await fetch(`${ZENSQUID_API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  return (await parseJsonOrText(res)) as T;
}

/** ---------- Skills ---------- */

export type SkillInfo = { name: string; description?: string };
export type SkillsList = { ok: boolean; name?: string; skills: SkillInfo[]; [k: string]: any };

export async function getSkills(): Promise<SkillsList> {
  const res = await apiGet<any>("/skills/list");
  if (res?.ok && Array.isArray(res?.skills)) return res as SkillsList;
  if (res?.ok && Array.isArray(res?.files)) return { ok: true, skills: [] };
  return { ok: false, skills: [] };
}

/** ---------- Chat ---------- */

export type ChatResponse = {
  ok?: boolean;
  output?: string;
  content?: string;
  error?: string;
  [k: string]: any;
};

export async function chat(input: string, skill?: string | null): Promise<ChatResponse> {
  return apiPost<ChatResponse>("/chat", { input, skill: skill ?? null });
}

/** ---------- Tools ---------- */

export type ToolListItem = { id: string; title: string };
export type ToolsListResponse = { ok: boolean; tools: ToolListItem[] };

export type ToolRunRequest = {
  workspace: string;
  tool_id: string;
  args: string[];
};

export type ToolRunResult = {
  receipt_id: string;
  ok: boolean;
  tool_id: string;
  workspace: string;
  cwd: string;
  command: { cmd: string; args: string[] };
  started_at: string;
  finished_at: string;
  duration_ms: number;
  exit_code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  truncated: { stdout: boolean; stderr: boolean };
};

export type ToolRunResponse =
  | { ok: true; result: ToolRunResult }
  | { ok: false; error: string; receipt_id?: string | null };

export async function getToolsList(): Promise<ToolsListResponse> {
  return apiGet<ToolsListResponse>("/tools/list");
}

export async function runTool(req: ToolRunRequest, adminToken: string): Promise<ToolRunResponse> {
  return apiPost<ToolRunResponse>("/tools/run", req, adminToken);
}