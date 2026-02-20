import { request } from "undici";
import type { ChatMessage } from "@zensquid/core";

export interface OllamaChatArgs {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
}

export interface OllamaChatResult {
  output: string;
  raw: unknown;
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

  const output: string =
    json?.message?.content ??
    json?.response ??
    "";

  return { output, raw: json };
}
