// apps/web/app/components/DiagnosticsPanel.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ZENSQUID_API } from "@/api/zensquid";

// PRIVATE-BUILD ONLY:
// Hardcoded admin token is intentionally allowed for local convenience in this branch.
// MUST be removed before any public/Pop Tart branch or shared deployment.
const ADMIN_TOKEN = "8675309abc123easy";

type CheckStatus = "pass" | "warn" | "fail";
type Check = { id: string; status: CheckStatus; detail: string };
type DoctorReport = {
  ok: boolean;
  summary: { pass: number; warn: number; fail: number };
  checks: Check[];
  fetched_at?: string;
};

type DiagMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
};

function uid() { return Math.random().toString(36).slice(2, 10); }

const CHECK_GROUPS: { label: string; prefix: string; color: string }[] = [
  { label: "Config",    prefix: "config",   color: "140,120,255" },
  { label: "Runtime",   prefix: "runtime",  color: "80,200,255"  },
  { label: "Dirs",      prefix: "dir",      color: "100,220,160" },
  { label: "Services",  prefix: "systemd",  color: "255,180,60"  },
  { label: "Models",    prefix: "ollama",   color: "255,140,80"  },
  { label: "API Keys",  prefix: "apikey",   color: "200,100,255" },
  { label: "Network",   prefix: "web|searx",color: "80,200,255"  },
  { label: "Receipts",  prefix: "receipt",  color: "255,200,80"  },
  { label: "Agents",    prefix: "agent",    color: "120,255,180" },
  { label: "Memory",    prefix: "memory",   color: "160,200,255" },
  { label: "Disk",      prefix: "disk",     color: "200,160,255" },
];

function groupChecks(checks: Check[]) {
  const groups: { label: string; color: string; checks: Check[] }[] = [];
  const used = new Set<number>();

  for (const g of CHECK_GROUPS) {
    const re = new RegExp(`^(${g.prefix})`);
    const matched = checks.filter((c, i) => { if (re.test(c.id)) { used.add(i); return true; } return false; });
    if (matched.length) groups.push({ label: g.label, color: g.color, checks: matched });
  }

  // Uncategorized
  const rest = checks.filter((_, i) => !used.has(i));
  if (rest.length) groups.push({ label: "Other", color: "200,200,200", checks: rest });

  return groups;
}

function statusColor(s: CheckStatus) {
  if (s === "pass") return "100,220,160";
  if (s === "warn") return "255,200,60";
  return "255,100,100";
}

function statusIcon(s: CheckStatus) {
  if (s === "pass") return "✓";
  if (s === "warn") return "⚠";
  return "✗";
}

export default function DiagnosticsPanel({ onRequestChat }: { onRequestChat?: (msg: string) => void }) {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<DiagMessage[]>([{
    id: uid(), role: "system",
    content: "🩺 Squidley Diagnostics — ask me about system health, or run a full report.",
    ts: Date.now()
  }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId] = useState(() => "diag-" + uid());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function fetchReport() {
    setLoading(true);
    try {
      const res = await fetch(`${ZENSQUID_API}/doctor`, {
        headers: { "x-zensquid-admin-token": ADMIN_TOKEN }
      });
      const json = await res.json();
      setReport({ ...json, fetched_at: new Date().toISOString() });
    } catch (e: any) {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchReport(); }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchReport, 30000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  async function sendChat(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);

    const userMsg: DiagMessage = { id: uid(), role: "user", content: text, ts: Date.now() };
    setMessages(m => [...m, userMsg]);

    // Inject current report as context
    const reportContext = report
      ? `\n\n[Current diagnostics: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail. ${
          report.checks.filter(c => c.status !== "pass").map(c => `${c.id}: ${c.status} (${c.detail})`).join(", ") || "All checks passing."
        }]`
      : "";

    try {
      const res = await fetch(`${ZENSQUID_API}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zensquid-admin-token": ADMIN_TOKEN },
        body: JSON.stringify({
          input: text + reportContext,
          mode: "auto",
          session_id: sessionId,
          skill: "diagnostics"
        })
      });
      const json = await res.json();

      // If user asked to run diagnostics, refresh report
      if (/run\s*(diagnostics|doctor|health|check)/i.test(text)) {
        await fetchReport();
      }

      setMessages(m => [...m, {
        id: uid(), role: "assistant",
        content: json?.output ?? json?.error ?? "No response",
        ts: Date.now()
      }]);
    } catch (e: any) {
      setMessages(m => [...m, { id: uid(), role: "system", content: `⚠ ${String(e?.message ?? e)}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const groups = report ? groupChecks(report.checks) : [];
  const hasFails = (report?.summary.fail ?? 0) > 0;
  const hasWarns = (report?.summary.warn ?? 0) > 0;

  return (
    <div style={shell()}>
      {/* Header */}
      <div style={header()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>🩺</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5 }}>Squidley Diagnostics</div>
            <div style={{ fontSize: 11, opacity: 0.45 }}>system health · self-repair · doctor report</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {report && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={summaryPill("100,220,160")}>{report.summary.pass} pass</span>
              {report.summary.warn > 0 && <span style={summaryPill("255,200,60")}>{report.summary.warn} warn</span>}
              {report.summary.fail > 0 && <span style={summaryPill("255,100,100")}>{report.summary.fail} fail</span>}
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, opacity: 0.6, cursor: "pointer" }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ cursor: "pointer" }} />
            Auto
          </label>
          <button style={iconBtn()} onClick={fetchReport} disabled={loading} title="Refresh">
            {loading ? "◌" : "↺"}
          </button>
        </div>
      </div>

      {/* Body — two column */}
      <div style={body()}>

        {/* Left: report */}
        <div style={reportPanel()}>
          {!report && loading && (
            <div style={{ padding: 20, opacity: 0.5, fontSize: 13 }}>Running diagnostics…</div>
          )}
          {report && (
            <>
              {/* Status banner */}
              <div style={statusBanner(hasFails ? "255,100,100" : hasWarns ? "255,200,60" : "100,220,160")}>
                <span style={{ fontSize: 16 }}>{hasFails ? "✗" : hasWarns ? "⚠" : "✓"}</span>
                <span style={{ fontWeight: 800, fontSize: 13 }}>
                  {hasFails ? `${report.summary.fail} check(s) failing` : hasWarns ? `${report.summary.warn} warning(s)` : "All systems healthy"}
                </span>
                <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto" }}>
                  {report.fetched_at ? new Date(report.fetched_at).toLocaleTimeString() : ""}
                </span>
              </div>

              {/* Check groups */}
              <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column" as const, gap: 10 }}>
                {groups.map(g => (
                  <div key={g.label} style={groupBox(g.color)}>
                    <div style={groupHeader(g.color)}>
                      {g.label}
                      <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.6 }}>
                        {g.checks.filter(c => c.status === "pass").length}/{g.checks.length}
                      </span>
                    </div>
                    <div style={{ padding: "4px 0" }}>
                      {g.checks.map(c => (
                        <div key={c.id} style={checkRow(c.status)}>
                          <span style={{ color: `rgba(${statusColor(c.status)},0.9)`, fontSize: 12, minWidth: 14 }}>
                            {statusIcon(c.status)}
                          </span>
                          <span style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", opacity: 0.7, minWidth: 180 }}>
                            {c.id}
                          </span>
                          <span style={{ fontSize: 12, opacity: 0.55, flex: 1 }}>{c.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Self-repair actions */}
              {(hasFails || hasWarns) && (
                <div style={{ padding: "0 14px 14px" }}>
                  <div style={repairBox()}>
                    <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🔧 Self-Repair Actions</div>
                    {report.checks.filter(c => c.status !== "pass").map(c => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: `rgba(${statusColor(c.status)},0.9)`, fontFamily: "ui-monospace, monospace", flex: 1 }}>
                          {c.id}: {c.detail}
                        </span>
                        <button
                          style={btnRepair()}
                          onClick={() => sendChat(`Diagnose and fix the issue: ${c.id} — ${c.detail}`)}
                        >
                          Fix
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: chat */}
        <div style={chatPanel()}>
          <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.4, textTransform: "uppercase" as const, letterSpacing: 1, padding: "10px 14px 6px" }}>
            Diagnostics Chat
          </div>

          <div style={messageArea()}>
            {messages.map(msg => (
              <div key={msg.id} style={bubble(msg.role)}>
                <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {busy && (
              <div style={bubble("assistant")}>
                <div style={{ fontSize: 14, opacity: 0.5 }}>Thinking…</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick actions */}
          <div style={{ padding: "6px 12px", display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            {["Run full diagnostics", "Check Ollama models", "Check API keys", "Show failing checks", "Restart services"].map(q => (
              <button key={q} style={quickBtn()} onClick={() => sendChat(q)}>{q}</button>
            ))}
          </div>

          <div style={inputArea()}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              placeholder="Ask about system health… (Enter to send)"
              style={inputBox()}
              rows={2}
              disabled={busy}
            />
            <button style={sendBtn(!busy && !!input.trim())} onClick={() => sendChat()} disabled={busy || !input.trim()}>
              ▶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function shell() {
  return {
    display: "flex", flexDirection: "column" as const,
    height: "calc(100vh - 140px)",
    borderRadius: 16,
    border: "1px solid rgba(100,220,160,0.20)",
    background: "rgba(8,10,20,0.65)",
    overflow: "hidden",
  };
}

function header() {
  return {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(0,0,0,0.25)",
    flexShrink: 0,
  } as const;
}

function body() {
  return {
    display: "flex", flex: 1, overflow: "hidden",
  } as const;
}

function reportPanel() {
  return {
    width: "55%", flexShrink: 0,
    borderRight: "1px solid rgba(255,255,255,0.07)",
    overflowY: "auto" as const,
  };
}

function chatPanel() {
  return {
    flex: 1, display: "flex", flexDirection: "column" as const, overflow: "hidden",
  };
}

function statusBanner(color: string) {
  return {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 16px",
    background: `rgba(${color},0.10)`,
    borderBottom: `1px solid rgba(${color},0.20)`,
    color: `rgba(${color},0.95)`,
    flexShrink: 0,
  } as const;
}

function summaryPill(color: string) {
  return {
    padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700,
    border: `1px solid rgba(${color},0.35)`,
    background: `rgba(${color},0.12)`,
    color: `rgba(${color},0.95)`,
  } as const;
}

function groupBox(color: string) {
  return {
    borderRadius: 10, overflow: "hidden",
    border: `1px solid rgba(${color},0.15)`,
    background: `rgba(${color},0.03)`,
  } as const;
}

function groupHeader(color: string) {
  return {
    padding: "6px 12px", fontWeight: 800, fontSize: 12,
    background: `rgba(${color},0.10)`,
    borderBottom: `1px solid rgba(${color},0.10)`,
    color: `rgba(${color},0.9)`,
    display: "flex", alignItems: "center",
    textTransform: "uppercase" as const, letterSpacing: 0.8,
  } as const;
}

function checkRow(status: CheckStatus) {
  return {
    display: "flex", gap: 10, alignItems: "center",
    padding: "3px 12px",
    background: status === "fail" ? "rgba(255,80,80,0.05)" : status === "warn" ? "rgba(255,200,60,0.04)" : "transparent",
  } as const;
}

function repairBox() {
  return {
    padding: "12px 14px", borderRadius: 12,
    border: "1px solid rgba(255,180,60,0.20)",
    background: "rgba(255,160,40,0.06)",
  } as const;
}

function btnRepair() {
  return {
    borderRadius: 8, padding: "3px 10px", fontSize: 11, fontWeight: 800,
    border: "1px solid rgba(255,160,60,0.35)",
    background: "rgba(255,140,40,0.15)",
    color: "rgba(255,200,120,0.95)", cursor: "pointer",
  } as const;
}

function messageArea() {
  return {
    flex: 1, overflowY: "auto" as const,
    padding: "8px 12px",
    display: "flex", flexDirection: "column" as const, gap: 8,
  };
}

function bubble(role: string) {
  const isUser = role === "user";
  const isSystem = role === "system";
  return {
    alignSelf: isUser ? "flex-end" : "flex-start",
    maxWidth: "92%",
    borderRadius: 12, padding: "8px 12px",
    background: isSystem ? "rgba(255,255,255,0.04)" : isUser ? "rgba(255,140,40,0.15)" : "rgba(255,255,255,0.06)",
    border: isSystem ? "1px solid rgba(255,255,255,0.06)" : isUser ? "1px solid rgba(255,140,40,0.25)" : "1px solid rgba(100,220,160,0.15)",
    color: isSystem ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.92)",
    fontSize: isSystem ? 12 : 14,
  } as const;
}

function quickBtn() {
  return {
    borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700,
    border: "1px solid rgba(100,220,160,0.20)",
    background: "rgba(100,220,160,0.07)",
    color: "rgba(140,255,200,0.8)", cursor: "pointer",
  } as const;
}

function inputArea() {
  return {
    display: "flex", gap: 8, padding: "8px 12px",
    borderTop: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(0,0,0,0.20)", flexShrink: 0, alignItems: "flex-end",
  } as const;
}

function inputBox() {
  return {
    flex: 1, borderRadius: 10, padding: "8px 12px",
    border: "1px solid rgba(100,220,160,0.20)",
    background: "rgba(0,0,0,0.30)",
    color: "rgba(255,255,255,0.92)", outline: "none",
    fontSize: 13, fontFamily: "inherit", resize: "none" as const,
  };
}

function sendBtn(active: boolean) {
  return {
    borderRadius: 10, width: 38, height: 38,
    border: `1px solid rgba(100,220,160,${active ? "0.40" : "0.15"})`,
    background: active ? "rgba(100,220,160,0.15)" : "rgba(255,255,255,0.04)",
    color: active ? "rgba(140,255,200,0.95)" : "rgba(255,255,255,0.3)",
    cursor: active ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 900, flexShrink: 0,
  } as const;
}

function iconBtn() {
  return {
    borderRadius: 8, padding: "4px 8px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 14,
  } as const;
}
