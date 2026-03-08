// apps/web/app/components/ReceiptsPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { ZENSQUID_API } from "@/api/zensquid";

type Receipt = {
  receipt_id: string;
  created_at: string;
  request?: { kind?: string; input?: string; mode?: string };
  decision?: {
    tier?: string;
    provider?: string;
    model?: string;
    escalated?: boolean;
    escalation_reason?: string;
  };
  error?: { message?: string };
  tool_event?: {
    allowed?: boolean;
    capability?: string;
    reason?: string;
    zone?: string;
  };
  guard_event?: {
    blocked?: boolean;
    reason?: string;
    score?: number;
  };
  meta?: { ms?: number };
};

function providerColor(provider?: string): string {
  if (!provider) return "rgba(255,255,255,0.5)";
  if (provider === "ollama") return "rgba(120,255,190,0.9)";
  if (provider === "openai") return "rgba(120,220,255,0.9)";
  if (provider === "modelstudio") return "rgba(255,200,100,0.9)";
  return "rgba(255,255,255,0.7)";
}

function kindIcon(kind?: string): string {
  if (kind === "heartbeat") return "💓";
  if (kind === "tool" || kind === "tools") return "🔧";
  if (kind === "system") return "⚙️";
  return "💬";
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function preview(s?: string, max = 80): string {
  if (!s) return "—";
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

export default function ReceiptsPanel() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [filter, setFilter] = useState<"all" | "chat" | "tool" | "error">("all");
  const [limit, setLimit] = useState(20);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${ZENSQUID_API}/receipts?limit=${limit}`, { cache: "no-store" });
      const json = await res.json();
      setReceipts(Array.isArray(json?.receipts) ? json.receipts : []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [limit]);

  const filtered = receipts.filter(r => {
    if (filter === "all") return true;
    if (filter === "chat") return r.request?.kind === "chat";
    if (filter === "tool") return r.request?.kind === "tool" || r.request?.kind === "tools";
    if (filter === "error") return !!r.error || r.tool_event?.allowed === false || r.guard_event?.blocked;
    return true;
  });

  return (
    <div style={shell()}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 900, opacity: 0.92 }}>Receipts</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>Audit trail — every decision logged</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {/* Filter buttons */}
          {(["all", "chat", "tool", "error"] as const).map(f => (
            <button key={f} style={filterBtn(filter === f)} onClick={() => setFilter(f)}>
              {f === "error" ? "⚠️ errors" : f}
            </button>
          ))}
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            style={selectStyle()}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <button style={btnTiny()} onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,100,100,0.3)", background: "rgba(255,100,100,0.08)", fontSize: 12, marginBottom: 10 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: selected && typeof window !== "undefined" && window.innerWidth >= 640 ? "1fr 1fr" : "1fr", gap: 10 }}>
        {/* Receipt list */}
        <div style={{ ...listBox(), display: selected && typeof window !== "undefined" && window.innerWidth < 640 ? "none" : "flex", flexDirection: "column" as const, gap: 6 }}>
          {filtered.length === 0 && !loading && (
            <div style={{ opacity: 0.4, fontSize: 12, padding: 12 }}>No receipts found</div>
          )}
          {filtered.map(r => {
            const hasError = !!(r.error || r.tool_event?.allowed === false || r.guard_event?.blocked);
            const isSelected = selected?.receipt_id === r.receipt_id;
            return (
              <div
                key={r.receipt_id}
                onClick={() => setSelected(isSelected ? null : r)}
                style={receiptRow(isSelected, hasError)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14 }}>{kindIcon(r.request?.kind)}</span>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>{formatDate(r.created_at)} {formatTime(r.created_at)}</span>
                  {r.decision?.provider && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: providerColor(r.decision.provider) }}>
                      {r.decision.tier ?? r.decision.provider}
                    </span>
                  )}
                  {r.meta?.ms && (
                    <span style={{ fontSize: 11, opacity: 0.5 }}>{r.meta.ms}ms</span>
                  )}
                  {hasError && <span style={{ fontSize: 11, color: "rgba(255,120,120,0.9)" }}>⚠️ error</span>}
                  {r.decision?.escalated && <span style={{ fontSize: 11, color: "rgba(255,200,100,0.9)" }}>↑ escalated</span>}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3, fontStyle: "italic" }}>
                  {preview(r.request?.input)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={detailBox()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 13 }}>Receipt Detail</div>
              <button style={btnTiny()} onClick={() => setSelected(null)}>{typeof window !== "undefined" && window.innerWidth < 640 ? "← Back" : "✕ Close"}</button>
            </div>

            <Row label="ID" value={selected.receipt_id} mono />
            <Row label="Time" value={`${formatDate(selected.created_at)} ${formatTime(selected.created_at)}`} />
            <Row label="Kind" value={selected.request?.kind ?? "—"} />
            <Row label="Mode" value={selected.request?.mode ?? "—"} />

            {selected.decision && (
              <>
                <Divider label="Decision" />
                <Row label="Tier" value={selected.decision.tier ?? "—"} />
                <Row label="Provider" value={selected.decision.provider ?? "—"} color={providerColor(selected.decision.provider)} />
                <Row label="Model" value={selected.decision.model ?? "—"} mono />
                <Row label="Escalated" value={String(selected.decision.escalated ?? false)} />
                {selected.decision.escalation_reason && (
                  <Row label="Why" value={selected.decision.escalation_reason} />
                )}
              </>
            )}

            {selected.meta?.ms && (
              <>
                <Divider label="Performance" />
                <Row label="Duration" value={`${selected.meta.ms}ms`} />
              </>
            )}

            {selected.tool_event && (
              <>
                <Divider label="Tool Event" />
                <Row label="Allowed" value={String(selected.tool_event.allowed)} color={selected.tool_event.allowed ? "rgba(120,255,190,0.9)" : "rgba(255,120,120,0.9)"} />
                <Row label="Capability" value={selected.tool_event.capability ?? "—"} />
                <Row label="Zone" value={selected.tool_event.zone ?? "—"} />
                {selected.tool_event.reason && <Row label="Reason" value={selected.tool_event.reason} />}
              </>
            )}

            {selected.guard_event && (
              <>
                <Divider label="Guard Event" />
                <Row label="Blocked" value={String(selected.guard_event.blocked)} color="rgba(255,120,120,0.9)" />
                <Row label="Score" value={String(selected.guard_event.score ?? "—")} />
                {selected.guard_event.reason && <Row label="Reason" value={selected.guard_event.reason} />}
              </>
            )}

            {selected.error && (
              <>
                <Divider label="Error" />
                <div style={{ fontSize: 12, color: "rgba(255,120,120,0.9)", padding: "6px 0", wordBreak: "break-word" }}>
                  {selected.error.message}
                </div>
              </>
            )}

            {selected.request?.input && (
              <>
                <Divider label="Input" />
                <div style={{ fontSize: 12, opacity: 0.85, padding: "6px 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontStyle: "italic" }}>
                  "{selected.request.input.slice(0, 400)}{selected.request.input.length > 400 ? "…" : ""}"
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, marginBottom: 5, fontSize: 12 }}>
      <div style={{ opacity: 0.6 }}>{label}</div>
      <div style={{ fontWeight: 600, color: color ?? "rgba(255,255,255,0.9)", fontFamily: mono ? "ui-monospace, monospace" : undefined, wordBreak: "break-all" }}>
        {value}
      </div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.5, textTransform: "uppercase", letterSpacing: 1, margin: "10px 0 6px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8 }}>
      {label}
    </div>
  );
}

function shell() {
  return {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10, 12, 22, 0.42)",
    padding: 14,
  } as const;
}

function listBox() {
  return {
    maxHeight: "52vh",
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  };
}

function detailBox() {
  return {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    padding: 12,
    maxHeight: "52vh",
    overflowY: "auto" as const,
  };
}

function receiptRow(selected: boolean, hasError: boolean) {
  return {
    borderRadius: 12,
    border: `1px solid ${hasError ? "rgba(255,100,100,0.25)" : selected ? "rgba(120,180,255,0.30)" : "rgba(255,255,255,0.08)"}`,
    background: selected ? "rgba(120,180,255,0.10)" : hasError ? "rgba(255,100,100,0.06)" : "rgba(255,255,255,0.04)",
    padding: "8px 12px",
    cursor: "pointer",
  } as const;
}

function filterBtn(active: boolean) {
  return {
    borderRadius: 10,
    padding: "5px 10px",
    border: `1px solid ${active ? "rgba(120,180,255,0.40)" : "rgba(255,255,255,0.12)"}`,
    background: active ? "rgba(120,180,255,0.15)" : "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.9)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  } as const;
}

function selectStyle() {
  return {
    borderRadius: 10,
    padding: "5px 8px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.20)",
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
  } as const;
}

function btnTiny() {
  return {
    borderRadius: 10,
    padding: "5px 10px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.9)",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
  } as const;
}
