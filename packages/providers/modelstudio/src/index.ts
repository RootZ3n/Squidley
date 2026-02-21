import type { ChatMessage } from "@zensquid/core";

export type ModelStudioOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
};

type ModelStudioChoice = {
  message?: {
    content?: string;
  };
};

type ModelStudioUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type ModelStudioResponse = {
  choices?: ModelStudioChoice[];
  usage?: ModelStudioUsage;
};

export async function modelstudioChat(opts: ModelStudioOptions) {
  const { baseUrl, apiKey, model, messages } = opts;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ModelStudio error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as ModelStudioResponse;

  const content =
    json.choices?.[0]?.message?.content ?? "";

  return {
    content,
    raw: json,
    usage: json.usage
  };
}
