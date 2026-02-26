// apps/remote/lib/format.ts
// Human-readable formatting for receipts and status.
// NO raw JSON ever surfaces to the UI — everything gets translated to plain English.

import type { Receipt } from "./api.js";

export function formatReceiptLine(r: Receipt): string {
  const time = formatTime(r.created_at);
  const kind = detectKind(r);
  const summary = summarizeReceipt(r);
  return `${time}  ${kind}  ${summary}`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "??:??:??";
  }
}

function detectKind(r: Receipt): string {
  if (r.guard_event) return "🛡  Guard";
  if (r.tool_event) return "🔧 Tool";
  const kind = r.request?.kind ?? "";
  if (kind === "heartbeat") return "💓 Heartbeat";
  if (kind === "chat") return "💬 Chat";
  if (kind === "system") return "⚙️  System";
  return "📋 Event";
}

function summarizeReceipt(r: Receipt): string {
  // Guard block
  if (r.guard_event?.blocked) {
    return `Blocked — ${r.guard_event.reason ?? "suspicious input"}`;
  }

  // Tool event
  if (r.tool_event) {
    const allowed = r.tool_event.allowed;
    const cap = r.tool_event.capability ?? "unknown action";
    const zone = r.tool_event.zone ?? "workspace";
    return allowed
      ? `Allowed "${cap}" in ${zone}`
      : `Denied "${cap}" in ${zone} — ${r.tool_event.reason ?? "policy"}`;
  }

  // Error
  if (r.error?.message) {
    return `Error — ${r.error.message.slice(0, 80)}`;
  }

  // Escalated
  if (r.decision?.escalated && r.decision.escalation_reason) {
    return `Escalation blocked — ${r.decision.escalation_reason}`;
  }

  // Heartbeat
  if (r.request?.kind === "heartbeat") {
    const ms = r.meta?.ms;
    const model = r.decision?.active_model?.label ?? r.decision?.model ?? "local model";
    return ms ? `${model} responded in ${ms}ms` : `${model} responded`;
  }

  // Chat
  const input = r.request?.input;
  if (input) {
    const preview = input.length > 60 ? input.slice(0, 60) + "…" : input;
    const model = r.decision?.active_model?.label ?? r.decision?.model ?? "local model";
    const provider = r.decision?.provider ?? "";
    const where = provider === "ollama" ? "local" : provider || "local";
    return `"${preview}" → ${model} (${where})`;
  }

  return "Activity recorded";
}

export function formatZone(zone: string): string {
  const map: Record<string, string> = {
    workspace: "Workspace — safe, read-only tools",
    diagnostics: "Diagnostics — inspection only",
    forge: "Forge — build and write enabled",
    godmode: "God Mode — all restrictions off",
  };
  return map[zone] ?? zone;
}

export function formatStrictLocal(strict: boolean): string {
  return strict ? "Local only — cloud blocked" : "Cloud allowed when needed";
}

export function formatProvider(provider: string): string {
  const map: Record<string, string> = {
    ollama: "Running locally on your machine",
    openai: "OpenAI (cloud)",
    modelstudio: "ModelStudio / DashScope (cloud)",
  };
  return map[provider] ?? provider;
}

export function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  } catch {
    return "unknown";
  }
}
