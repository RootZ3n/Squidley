import { readFile } from "node:fs/promises";
import { request } from "undici";

export type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenAIChatArgs = {
  apiKey?: string;
  apiKeyFile?: string;
  model: string;
  messages: OpenAIChatMessage[];
  /**
   * Defaults to https://api.openai.com
   * You can override for gateways / proxies if needed.
   */
  baseUrl?: string;
  /**
   * Optional: keep it conservative by default.
   */
  temperature?: number;
};

export type OpenAIChatResult = {
  output: string;
  raw: unknown;
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

function pickOutputTextFromResponses(raw: any): string {
  // Responses API typically returns: { output: [ { content: [ { type:"output_text", text:"..." } ] } ] }
  const out = raw?.output;
  if (Array.isArray(out)) {
    const chunks: string[] = [];
    for (const item of out) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
      }
    }
    if (chunks.length) return chunks.join("");
  }

  // Some SDK-like shapes expose output_text
  if (typeof raw?.output_text === "string" && raw.output_text.trim().length) return raw.output_text;

  return "";
}

function pickOutputTextFromChatCompletions(raw: any): string {
  // chat.completions shape: { choices: [ { message: { content: "..." } } ] }
  const c0 = raw?.choices?.[0]?.message?.content;
  return typeof c0 === "string" ? c0 : "";
}

export async function openaiChat(args: OpenAIChatArgs): Promise<OpenAIChatResult> {
  const baseUrl = (args.baseUrl ?? "https://api.openai.com").replace(/\/+$/, "");
  const apiKey =
    (args.apiKey && args.apiKey.trim().length ? args.apiKey.trim() : null) ??
    (await readKeyFromFile(args.apiKeyFile));

  if (!apiKey) {
    throw new Error("OpenAI api key missing (provide apiKey or apiKeyFile)");
  }

  // Try Responses API first (modern, supports GPT-5 family cleanly)
  const responsesUrl = `${baseUrl}/v1/responses`;

  const input = args.messages.map((m) => ({
    role: m.role,
    content: [{ type: "input_text", text: m.content }]
  }));

  const bodyResponses = {
    model: args.model,
    input,
    ...(typeof args.temperature === "number" ? { temperature: args.temperature } : {})
  };

  try {
    const r = await request(responsesUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(bodyResponses)
    });

    const raw = await r.body.json().catch(async () => {
      const t = await r.body.text().catch(() => "");
      return { _non_json: true, text: t };
    });

    if (r.statusCode >= 200 && r.statusCode < 300) {
      const output = pickOutputTextFromResponses(raw) || "";
      return { output: output.trim(), raw };
    }

    // If Responses fails (auth/format/endpoint), fall through to chat.completions
  } catch {
    // fall through
  }

  // Fallback: Chat Completions API
  const chatUrl = `${baseUrl}/v1/chat/completions`;

  const bodyChat = {
    model: args.model,
    messages: args.messages,
    ...(typeof args.temperature === "number" ? { temperature: args.temperature } : {})
  };

  const r2 = await request(chatUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(bodyChat)
  });

  const raw2 = await r2.body.json().catch(async () => {
    const t = await r2.body.text().catch(() => "");
    return { _non_json: true, text: t };
  });

  if (!(r2.statusCode >= 200 && r2.statusCode < 300)) {
    throw new Error(
      `OpenAI request failed: HTTP ${r2.statusCode} ${typeof raw2 === "object" ? JSON.stringify(raw2) : String(raw2)}`
    );
  }

  const output2 = pickOutputTextFromChatCompletions(raw2) || "";
  return { output: output2.trim(), raw: raw2 };
}
