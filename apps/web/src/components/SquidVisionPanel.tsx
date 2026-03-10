// apps/web/src/components/SquidVisionPanel.tsx
"use client";

import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentRun = {
  name: string;
  status: string;
  model: string | null;
  provider: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  estimated_cost: number | null;
  duration_ms: number | null;
  surfaced_to_user: boolean | null;
  created_at: string | null;
  receipt_id: string | null;
};

type ChatRun = {
  tier: string | null;
  model: string | null;
  provider: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string | null;
  receipt_id: string | null;
};

type Snapshot = {
  ok: boolean;
  awareness: { skills: number; agents: number; tools: number; agent_list: string[] };
  last_agent: AgentRun | null;
  last_chat: ChatRun | null;
};

type TierInfo = { name: string; provider: string; model: string };
type StatusData = { tiers: TierInfo[] };

type ModelCost = {
  model: string;
  provider: string;
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  cost: number;
};

type TodayData = {
  ok: boolean;
  date: string;
  totals: { tokens_in: number; tokens_out: number; tokens_total: number; cost: number };
  models: ModelCost[];
  active_model: string;
  active_provider: string;
  active_tier: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "unknown";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function fmt$(c: number): string {
  if (c === 0) return "$0.00";
  if (c < 0.0001) return "<$0.0001";
  return `$${c.toFixed(4)}`;
}

function fmtN(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

function tierRole(name: string): string {
  const roles: Record<string, string> = {
    local: "Local reflex",
    chat: "Primary chat",
    chat_fallback: "Fallback",
    plan: "Planner",
    build: "Builder",
    coder: "Coder",
    "claude-sonnet": "Sonnet",
    "claude-opus": "Opus",
    big_brain: "Big brain"
  };
  return roles[name] ?? name;
}

function providerColor(provider: string): string {
  const colors: Record<string, string> = {
    ollama:       "rgba(80,200,120,0.12)",
    modelstudio:  "rgba(100,160,255,0.12)",
    anthropic:    "rgba(220,140,60,0.12)",
    openai:       "rgba(100,220,180,0.12)"
  };
  return colors[provider] ?? "rgba(180,180,180,0.1)";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 12,
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 10
    }}>
      <div style={{ fontWeight: 700, fontSize: 11, opacity: 0.5, letterSpacing: 1.5, textTransform: "uppercase" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
      <span style={{ opacity: 0.65 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    completed: { bg: "rgba(80,220,120,0.2)",  label: "✅ completed" },
    failed:    { bg: "rgba(255,80,80,0.2)",   label: "❌ failed" },
    running:   { bg: "rgba(100,180,255,0.2)", label: "⏳ running" }
  };
  const s = map[status] ?? { bg: "rgba(180,180,180,0.15)", label: `⚪ ${status}` };
  return (
    <span style={{ background: s.bg, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function SurfacedPill({ surfaced }: { surfaced: boolean | null }) {
  if (surfaced === null) return <span style={{ opacity: 0.4, fontSize: 12 }}>—</span>;
  return (
    <span style={{
      background: surfaced ? "rgba(80,220,120,0.15)" : "rgba(255,160,0,0.2)",
      borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600
    }}>
      {surfaced ? "👁 surfaced" : "⚠️ not surfaced"}
    </span>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

type Props = { adminToken?: string };

export default function SquidVisionPanel({ adminToken = "" }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus]     = useState<StatusData | null>(null);
  const [today, setToday]       = useState<TodayData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState<string | null>(null);
  const [agentsExpanded, setAgentsExpanded] = useState(false);

  async function zget<T>(path: string, withAdmin = false): Promise<T> {
    const headers: Record<string, string> = {};
    if (withAdmin && adminToken) headers["x-zensquid-admin-token"] = adminToken;
    const r = await fetch(`/api/zsq/${path.replace(/^\/+/, "")}`, { cache: "no-store", headers });
    const text = await r.text();
    try { return JSON.parse(text) as T; }
    catch { throw new Error(`Bad JSON from ${path}: ${text}`); }
  }

  async function refresh() {
    setErr(null);
    try {
      const [snap, st, td] = await Promise.all([
        zget<Snapshot>("/squidvision/snapshot"),
        zget<StatusData>("/status"),
        zget<TodayData>("/skills/token-monitor/today", true)
      ]);
      setSnapshot(snap);
      setStatus(st);
      setToday(td);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); const id = setInterval(refresh, 12000); return () => clearInterval(id); }, []);

  if (loading) return <div style={{ padding: 24, opacity: 0.5 }}>👁 Loading Squidvision…</div>;

  if (err) return (
    <div style={{ padding: 24 }}>
      <div style={{ color: "red", marginBottom: 8 }}>Error loading Squidvision</div>
      <div style={{ fontFamily: "monospace", fontSize: 12 }}>{err}</div>
      <button onClick={refresh} style={{ marginTop: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer" }}>Retry</button>
    </div>
  );

  const a = snapshot?.awareness;
  const lastAgent = snapshot?.last_agent;
  const lastChat = snapshot?.last_chat;
  const tiers = status?.tiers ?? [];
  const todayModels = (today?.models ?? []).filter(m => m.tokens_total > 0);

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>👁 Squidvision</div>
        <button onClick={refresh} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", fontSize: 13 }}>
          Refresh
        </button>
      </div>

      {/* Awareness */}
      <Card title="Awareness">
        <Row label="Skills loaded"    value={a?.skills ?? "—"} />
        <Row label="Agents available" value={a?.agents ?? "—"} />
        <Row label="Tools available"  value={a?.tools ?? "—"} />
      </Card>

      {/* Brain map */}
      <Card title="Brain Map">
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {tiers.map((t) => (
            <div key={t.name} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: providerColor(t.provider), borderRadius: 8, padding: "6px 10px", fontSize: 13
            }}>
              <span style={{ opacity: 0.65, minWidth: 110 }}>{tierRole(t.name)}</span>
              <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{t.model}</span>
              <span style={{ opacity: 0.45, fontSize: 11, minWidth: 80, textAlign: "right" }}>{t.provider}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Today's spend */}
      <Card title={`Today's Spend — ${today?.date ?? "—"}`}>
        <Row
          label="Total today"
          value={<span style={{ fontWeight: 800, fontSize: 15 }}>{fmt$(today?.totals.cost ?? 0)}</span>}
        />
        <Row
          label="Tokens in / out"
          value={`${fmtN(today?.totals.tokens_in ?? null)} / ${fmtN(today?.totals.tokens_out ?? null)}`}
        />
        {todayModels.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            <div style={{ fontSize: 11, opacity: 0.45, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 }}>By model</div>
            {todayModels.map((m) => (
              <div key={m.model} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: providerColor(m.provider), borderRadius: 8, padding: "5px 10px", fontSize: 12
              }}>
                <span style={{ fontFamily: "monospace" }}>{m.model}</span>
                <span style={{ opacity: 0.55 }}>{m.tokens_total.toLocaleString()} tok</span>
                <span style={{ fontWeight: 700 }}>{fmt$(m.cost)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Last Agent Run */}
      <Card title="Last Agent Run">
        {!lastAgent ? (
          <div style={{ opacity: 0.5, fontSize: 14 }}>No agent runs recorded yet.</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{lastAgent.name}</span>
              <StatusPill status={lastAgent.status} />
              <SurfacedPill surfaced={lastAgent.surfaced_to_user} />
              <span style={{ fontSize: 12, opacity: 0.5 }}>{timeAgo(lastAgent.created_at)}</span>
            </div>
            <Row label="Model"         value={lastAgent.model ? `${lastAgent.provider} / ${lastAgent.model}` : "—"} />
            <Row label="Tokens in / out" value={`${fmtN(lastAgent.tokens_in)} / ${fmtN(lastAgent.tokens_out)}`} />
            <Row label="Est. cost"     value={fmt$(lastAgent.estimated_cost ?? 0)} />
            <Row label="Duration"      value={lastAgent.duration_ms ? `${(lastAgent.duration_ms / 1000).toFixed(1)}s` : "—"} />
            {lastAgent.receipt_id && (
              <Row label="Receipt" value={<span style={{ fontFamily: "monospace", fontSize: 12 }}>{lastAgent.receipt_id}</span>} />
            )}
          </>
        )}
      </Card>

      {/* Last Chat */}
      <Card title="Last Chat">
        {!lastChat ? (
          <div style={{ opacity: 0.5, fontSize: 14 }}>No chat receipts found.</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{lastChat.provider} / {lastChat.model}</span>
              <span style={{ fontSize: 12, opacity: 0.5 }}>{timeAgo(lastChat.created_at)}</span>
            </div>
            <Row label="Tier"          value={lastChat.tier ?? "—"} />
            <Row label="Tokens in / out" value={`${fmtN(lastChat.tokens_in)} / ${fmtN(lastChat.tokens_out)}`} />
            {lastChat.receipt_id && (
              <Row label="Receipt" value={<span style={{ fontFamily: "monospace", fontSize: 12 }}>{lastChat.receipt_id}</span>} />
            )}
          </>
        )}
      </Card>

      {/* Agent list */}
      <Card title={`Agents (${a?.agents ?? 0})`}>
        <button
          onClick={() => setAgentsExpanded(!agentsExpanded)}
          style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, opacity: 0.7, padding: 0 }}
        >
          {agentsExpanded ? "▾ Hide list" : "▸ Show all agents"}
        </button>
        {agentsExpanded && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {(a?.agent_list ?? []).map((name) => (
              <span key={name} style={{
                background: "rgba(100,180,255,0.12)",
                border: "1px solid rgba(100,180,255,0.2)",
                borderRadius: 8, padding: "4px 10px", fontSize: 12, fontFamily: "monospace"
              }}>
                {name}
              </span>
            ))}
          </div>
        )}
      </Card>

    </div>
  );
}
