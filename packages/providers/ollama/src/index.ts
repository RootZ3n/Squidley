import { request } from "undici";
import type { ChatMessage } from "@zensquid/core";

export interface OllamaChatArgs {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
}

export type Usage = {
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  cost: number; // local models => 0
};

export type UsageV1 = {
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  cost: number;
};

export interface OllamaChatResult {
  output: string;
  raw: unknown;
  usage: UsageV1 | null;
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function ollamaChat(args: OllamaChatArgs): Promise<OllamaChatResult> {
  const url = `${args.baseUrl.replace(/\/+$/, "")}/api/chat`;

  const body = {
    model: args.model,
    stream: false,
    messages: args.messages
  };

  const res = await request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const json = (await res.body.json()) as any;

  const output: string = json?.message?.content ?? json?.response ?? "";

  // Ollama provides these counts for /api/chat:
  // - prompt_eval_count = prompt tokens
  // - eval_count = generated tokens
  const tokens_in = toNum(json?.prompt_eval_count);
  const tokens_out = toNum(json?.eval_count);
  const tokens_total = tokens_in + tokens_out;

  const usage: Usage = {
    tokens_in,
    tokens_out,
    tokens_total,
    cost: 0
  };

  return { output, raw: json, usage };
}