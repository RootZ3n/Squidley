// apps/api/src/types.ts

export type RequestKind = "chat" | "heartbeat" | "tool" | "system";

export type SafetyZone = "workspace" | "forge" | "unsafe";

export type Receipt = {
  id: string;
  ts: string; // ISO
  request: {
    kind: RequestKind;
    route: string;
    method: string;
    ip?: string;
  };
  policy: {
    strict_local_only: boolean;
    safety_zone: SafetyZone;
    escalation_requires_reason: boolean;
  };
  model?: {
    provider: string; // "ollama" | "openai" | ...
    model: string;
  };
  ok: boolean;
  ms: number;
  error?: {
    message: string;
    code?: string;
  };
  // Freeform, but should stay small
  meta?: Record<string, unknown>;
};

export type RuntimeOverrides = {
  strict_local_only?: boolean | null;
  safety_zone?: SafetyZone | null;
};

export type Budgets = {
  escalation_requires_reason?: boolean;
  strict_local_only?: boolean;
};

export type Snapshot = {
  ok?: boolean;
  node?: string;
  ollama_base?: string;

  budgets?: Budgets;

  runtime?: RuntimeOverrides;

  effective?: {
    strict_local_only?: boolean;
    strict_local_only_source?: string;

    safety_zone?: SafetyZone;
    safety_zone_source?: string;

    escalation_requires_reason?: boolean;
    escalation_requires_reason_source?: string;
  };
};

export type HeartbeatRequest = {
  // Optional: user can override prompt for diagnostics
  prompt?: string;
};

export type HeartbeatResponse = {
  ok: boolean;
  provider: "ollama";
  model: string;
  ms: number;
  text?: string;
};
