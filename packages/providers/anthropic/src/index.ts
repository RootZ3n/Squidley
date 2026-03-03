import { readFile } from "node:fs/promises";
import { request } from "undici";

export type AnthropicChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AnthropicChatArgs = {
  apiKey?: string;
  apiKeyFile?: string;
  model: string;
  system?: string;
  messages: AnthropicChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type AnthropicChatResult = {
  output: string;
  raw: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

async function readKeyFromFile(p?: string): Promise<string | null> {
  if (!p) return null;
  try {
    const s = await readFile(p, "utf-8");
    const key = s.trim();
    return key.length ? key : null;
  } catch {
    return null;
  }
}

export async function anthropicChat(args: AnthropicChatArgs): Promise<AnthropicChatResult> {
  const apiKey =
    (args.apiKey && args.apiKey.trim().length ? args.apiKey.trim() : null) ??
    (await readKeyFromFile(args.apiKeyFile));

  if (!apiKey) {
    throw new Error("Anthropic API key missing (provide apiKey or apiKeyFile)");
  }

  // Anthropic requires user/assistant alternation — strip system from messages
  // and pass as top-level system param
  const messages = args.messages.filter(m => m.role === "user" || m.role === "assistant");

  const body = {
    model: args.model,
    max_tokens: args.maxTokens ?? 8192,
    messages,
    ...(args.system ? { system: args.system } : {}),
    ...(typeof args.temperature === "number" ? { temperature: args.temperature } : {})
  };

  const r = await request("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await r.body.json().catch(async () => {
    const t = await r.body.text().catch(() => "");
    return { _non_json: true, text: t };
  }) as any;

  if (!(r.statusCode >= 200 && r.statusCode < 300)) {
    throw new Error(
      `Anthropic error ${r.statusCode}: ${typeof raw === "object" ? JSON.stringify(raw) : String(raw)}`
    );
  }

  // Anthropic response: { content: [ { type: "text", text: "..." } ] }
  const output = (raw?.content ?? [])
    .filter((c: any) => c?.type === "text")
    .map((c: any) => c.text ?? "")
    .join("") ?? "";

  return {
    output: output.trim(),
    raw,
    usage: raw?.usage
  };
}
