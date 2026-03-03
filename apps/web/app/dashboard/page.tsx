"use client";

import { useEffect, useState, useCallback } from "react";

type Receipt = {
  receipt_id: string;
  created_at: string;
  decision: {
    tier: string;
    provider: string;
    model: string;
    escalated: boolean;
    escalation_reason?: string;
  };
  request: {
    kind: string;
    mode: string;
  };
  error: string | null;
};

type ReceiptsResponse = {
  ok: boolean;
  count: number;
  receipts: Receipt[];
};

const COST_PER_1K: Record<string, number> = {
  ollama: 0,
  openai: 0.000375,      // avg of $0.00015 input + $0.0006 output @ ~500in/300out
  modelstudio: 0.00032,
};

function estimateCost(receipts: Receipt[]): number {
  return receipts.reduce((sum, r) => {
    const rate = COST_PER_1K[r.decision?.provider] ?? 0;
    return sum + rate * 0.8; // ~800 tokens avg per request
  }, 0);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TIER_COLORS: Record<string, string> = {
  local: "#4ade80",
  chat: "#60a5fa",
  plan: "#f59e0b",
  big_brain: "#f43f5e",
  build: "#a78bfa",
  unknown: "#6b7280",
};

const PROVIDER_ICONS: Record<string, string> = {
  ollama: "⬡",
  openai: "◎",
  modelstudio: "◈",
};

export default function DashboardPage() {
  const [data, setData] = useState<ReceiptsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchReceipts = useCallback(async () => {
    const apiUrl = (window as any).__SQUIDLEY_API_URL ?? "/api/zsq";
    try {
      const res = await fetch(`${apiUrl}/receipts?limit=500`);
      const json: ReceiptsResponse = await res.json();
      if (!json.ok) throw new Error("API returned ok:false");
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReceipts();
    const iv = setInterval(fetchReceipts, 30_000);
    return () => clearInterval(iv);
  }, [fetchReceipts]);

  const receipts = data?.receipts ?? [];

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);

  const todayReceipts = receipts.filter((r) => r.created_at?.startsWith(todayStr));
  const weekReceipts = receipts.filter((r) => new Date(r.created_at) >= weekAgo);

  const tierCounts: Record<string, number> = {};
  const providerCounts: Record<string, number> = {};
  for (const r of receipts) {
    const t = r.decision?.tier ?? "unknown";
    const p = r.decision?.provider ?? "unknown";
    tierCounts[t] = (tierCounts[t] ?? 0) + 1;
    providerCounts[p] = (providerCounts[p] ?? 0) + 1;
  }

  const localCount = providerCounts["ollama"] ?? 0;
  const cloudCount = receipts.length - localCount;
  const cloudPct = receipts.length ? Math.round((cloudCount / receipts.length) * 100) : 0;
  const localPct = 100 - cloudPct;

  const totalCost = estimateCost(receipts);
  const todayCost = estimateCost(todayReceipts);

  const sortedTiers = Object.entries(tierCounts).sort((a, b) => b[1] - a[1]);
  const maxTierCount = sortedTiers[0]?.[1] ?? 1;
  const recent = receipts.slice(0, 12);

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#080b0f",
      color: "#c9d1d9",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      padding: "0",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1a2332",
        padding: "20px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "linear-gradient(180deg, #0d1117 0%, #080b0f 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "24px" }}>🦑</span>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#e6edf3", letterSpacing: "-0.5px" }}>
              Squidley
            </div>
            <div style={{ fontSize: "11px", color: "#4ade80", letterSpacing: "2px", textTransform: "uppercase" }}>
              Token Monitor
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px", color: "#6b7280" }}>
          <span>Auto-refresh 30s</span>
          <div style={{
            width: "8px", height: "8px", borderRadius: "50%",
            backgroundColor: error ? "#f43f5e" : "#4ade80",
            boxShadow: error ? "0 0 8px #f43f5e" : "0 0 8px #4ade80",
          }} />
          <span style={{ color: "#8b949e" }}>
            {lastRefresh.toLocaleTimeString()}
          </span>
          <button onClick={fetchReceipts} style={{
            background: "#1a2332", border: "1px solid #2d3748", color: "#8b949e",
            padding: "4px 10px", borderRadius: "4px", cursor: "pointer", fontSize: "11px",
          }}>
            ↺ refresh
          </button>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 40px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "80px", color: "#4ade80" }}>
            Loading receipts...
          </div>
        )}
        {error && (
          <div style={{
            background: "#1a0a0a", border: "1px solid #f43f5e33",
            borderRadius: "8px", padding: "16px", color: "#f43f5e", marginBottom: "24px",
          }}>
            ⚠ {error}
          </div>
        )}

        {!loading && data && (
          <>
            {/* Hero row — local vs cloud */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px", marginBottom: "24px" }}>
              {[
                { label: "Total Requests", value: receipts.length.toLocaleString(), sub: "all time", accent: "#e6edf3" },
                { label: "Today", value: todayReceipts.length.toLocaleString(), sub: todayStr, accent: "#60a5fa" },
                { label: "This Week", value: weekReceipts.length.toLocaleString(), sub: "last 7 days", accent: "#a78bfa" },
                { label: "Est. Total Cost", value: `$${totalCost.toFixed(4)}`, sub: `$${todayCost.toFixed(4)} today`, accent: "#f59e0b" },
              ].map((card) => (
                <div key={card.label} style={{
                  background: "#0d1117", border: "1px solid #1a2332",
                  borderRadius: "10px", padding: "20px",
                }}>
                  <div style={{ fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: card.accent, lineHeight: 1 }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: "11px", color: "#4b5563", marginTop: "6px" }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Local vs Cloud split */}
            <div style={{
              background: "#0d1117", border: "1px solid #1a2332",
              borderRadius: "10px", padding: "24px", marginBottom: "24px",
            }}>
              <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "16px" }}>
                Local vs Cloud Split
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "12px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    height: "28px", borderRadius: "6px", background: "#1a2332",
                    overflow: "hidden", display: "flex",
                  }}>
                    <div style={{
                      width: `${localPct}%`, background: "linear-gradient(90deg, #166534, #4ade80)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: 700, color: "#fff",
                      transition: "width 0.5s ease",
                    }}>
                      {localPct > 10 ? `${localPct}%` : ""}
                    </div>
                    <div style={{
                      width: `${cloudPct}%`, background: "linear-gradient(90deg, #1e3a5f, #60a5fa)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", fontWeight: 700, color: "#fff",
                      transition: "width 0.5s ease",
                    }}>
                      {cloudPct > 10 ? `${cloudPct}%` : ""}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "24px", fontSize: "13px" }}>
                <span><span style={{ color: "#4ade80" }}>⬡ Local (ollama)</span> — {localCount} requests · $0.00</span>
                <span><span style={{ color: "#60a5fa" }}>◎ Cloud (openai + modelstudio)</span> — {cloudCount} requests · ${estimateCost(receipts.filter(r => r.decision?.provider !== "ollama")).toFixed(4)}</span>
              </div>
            </div>

            {/* Tier breakdown + Provider breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "16px", marginBottom: "24px" }}>
              {/* Tier breakdown */}
              <div style={{
                background: "#0d1117", border: "1px solid #1a2332",
                borderRadius: "10px", padding: "24px",
              }}>
                <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "16px" }}>
                  Tier Breakdown
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {sortedTiers.map(([tier, count]) => (
                    <div key={tier}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "13px" }}>
                        <span style={{ color: TIER_COLORS[tier] ?? "#6b7280" }}>{tier}</span>
                        <span style={{ color: "#8b949e" }}>{count} <span style={{ color: "#4b5563" }}>({Math.round(count / receipts.length * 100)}%)</span></span>
                      </div>
                      <div style={{ height: "6px", background: "#1a2332", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${(count / maxTierCount) * 100}%`,
                          background: TIER_COLORS[tier] ?? "#6b7280",
                          borderRadius: "3px",
                          transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Provider breakdown */}
              <div style={{
                background: "#0d1117", border: "1px solid #1a2332",
                borderRadius: "10px", padding: "24px",
              }}>
                <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "16px" }}>
                  Provider Breakdown
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {Object.entries(providerCounts).sort((a, b) => b[1] - a[1]).map(([provider, count]) => (
                    <div key={provider} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "18px", width: "24px", textAlign: "center" }}>
                        {PROVIDER_ICONS[provider] ?? "○"}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", color: "#e6edf3", marginBottom: "2px" }}>{provider}</div>
                        <div style={{ fontSize: "11px", color: "#4b5563" }}>
                          {count} req · est. ${estimateCost(receipts.filter(r => r.decision?.provider === provider)).toFixed(4)}
                        </div>
                      </div>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#8b949e" }}>{count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div style={{
              background: "#0d1117", border: "1px solid #1a2332",
              borderRadius: "10px", padding: "24px",
            }}>
              <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "16px" }}>
                Recent Activity
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                {recent.map((r, i) => (
                  <div key={r.receipt_id ?? i} style={{
                    display: "grid",
                    gridTemplateColumns: "90px 80px 1fr 80px",
                    gap: "16px",
                    padding: "8px 10px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    background: i % 2 === 0 ? "transparent" : "#0a0f16",
                    alignItems: "center",
                  }}>
                    <span style={{
                      color: TIER_COLORS[r.decision?.tier] ?? "#6b7280",
                      fontWeight: 600,
                    }}>
                      {r.decision?.tier ?? "?"}
                    </span>
                    <span style={{ color: "#6b7280" }}>
                      {PROVIDER_ICONS[r.decision?.provider] ?? "○"} {r.decision?.provider ?? "?"}
                    </span>
                    <span style={{ color: "#8b949e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.decision?.model ?? "unknown"}
                      {r.decision?.escalated && r.decision?.provider !== "ollama" && (
                        <span style={{ color: "#f59e0b", marginLeft: "8px", fontSize: "10px" }}>↑ cloud</span>
                      )}
                    </span>
                    <span style={{ color: "#4b5563", textAlign: "right" }}>
                      {timeAgo(r.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
