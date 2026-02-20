export type TierName = string;

export type ProviderName = "ollama" | "openai" | "anthropic";

export interface TierConfig {
  name: TierName;
  provider: ProviderName;
  model: string;
  role?: string;
}

export interface ZenSquidConfig {
  meta: {
    name: string;
    node: string;
    local_first: boolean;
  };
  tiers: TierConfig[];
  budgets: {
    monthly_usd: number;
    escalation_requires_reason: boolean;
  };
  providers: {
    ollama: { base_url: string };
    openai: { env_key: string };
    anthropic: { env_key: string };
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  input: string;
  mode?: "auto" | "force_local" | "force_tier";
  force_tier?: TierName;
  reason?: string;
}

export interface ChatResponse {
  output: string;
  tier: TierName;
  provider: ProviderName;
  model: string;
  receipt_id: string;
  escalated: boolean;
  escalation_reason?: string;
}

export interface ReceiptV1 {
  schema: "zensquid.receipt.v1";
  receipt_id: string;
  created_at: string;
  node: string;

  request: {
    input: string;
    mode: string;
    force_tier?: string;
    reason?: string;
  };

  decision: {
    tier: string;
    provider: ProviderName;
    model: string;
    escalated: boolean;
    escalation_reason?: string;
  };

  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cost_usd?: number;
  };

  provider_response?: unknown;
}
