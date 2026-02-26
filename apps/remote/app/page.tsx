"use client";
// apps/remote/app/page.tsx
// Squidley Remote Cockpit
// Designed for iPad / phone use over Tailscale.
// No raw JSON ever shown — everything in plain English.

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type HealthData = { ok: boolean; name?: string; error?: string };

type SnapshotData = {
  ok: boolean;
  node?: string;
  budgets?: { strict_local_only: boolean };
  runtime?: { safety_zone: string };
  tiers?: Array<{ name: string; provider: string; model: string }>;
  onboarding?: { completed: boolean };
  error?: string;
};

type Receipt = {
  receipt_id: string;
  created_at: string;
  request?: { input?: string; kind?: string };
  decision?: { provider?: string; model?: string; escalated?: boolean; escalation_reason?: string | null; active_model?: { label?: string } };
  guard_event?: { blocked: boolean; reason?: string };
  tool_event?: { zone?: string; capability?: string; allowed?: boolean; reason?: string };
  error?: { message?: string };
  meta?: { ms?: number };
};

type RunResult = {
  ok: boolean;
  summary?: { pass: number; fail: number; steps_ran: number; halted: boolean; goal: string };
  results?: Array<{ ok: boolean; tool: string; error?: string; output?: { stdout?: string; stderr?: string } }>;
  error?: string;
};

// ── Formatters (no raw JSON, ever) ────────────────────────────────────────────

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return "??:??:??"; }
}

function timeAgo(iso: string): string {
  try {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  } catch { return ""; }
}

function fmtReceipt(r: Receipt): { label: string; summary: string; kind: "blocked" | "denied" | "allowed" | "chat" | "default" } {
  const time = fmtTime(r.created_at);

  if (r.guard_event?.blocked) {
    return { label: `${time}  🛡 Guard`, summary: `Blocked — ${r.guard_event.reason ?? "suspicious input"}`, kind: "blocked" };
  }

  if (r.tool_event) {
    const cap = r.tool_event.capability ?? "action";
    const zone = r.tool_event.zone ?? "workspace";
    if (!r.tool_event.allowed) {
      return { label: `${time}  🔧 Tool`, summary: `Denied "${cap}" in ${zone} — ${r.tool_event.reason ?? "policy"}`, kind: "denied" };
    }
    return { label: `${time}  🔧 Tool`, summary: `Allowed "${cap}" in ${zone}`, kind: "allowed" };
  }

  if (r.error?.message) {
    return { label: `${time}  ⚠️  Error`, summary: r.error.message.slice(0, 100), kind: "denied" };
  }

  if (r.decision?.escalated && r.decision.escalation_reason) {
    return { label: `${time}  🚫 Blocked`, summary: r.decision.escalation_reason, kind: "blocked" };
  }

  if (r.request?.kind === "heartbeat") {
    const ms = r.meta?.ms;
    const model = r.decision?.active_model?.label ?? r.decision?.model ?? "local model";
    return { label: `${time}  💓 Heartbeat`, summary: ms ? `${model} responded in ${ms}ms` : `${model} responded`, kind: "allowed" };
  }

  const input = r.request?.input;
  if (input) {
    const preview = input.length > 55 ? input.slice(0, 55) + "…" : input;
    const where = r.decision?.provider === "ollama" ? "local" : (r.decision?.provider ?? "local");
    const model = r.decision?.active_model?.label ?? r.decision?.model ?? "model";
    return { label: `${time}  💬 Chat`, summary: `"${preview}" → ${model} (${where})`, kind: "chat" };
  }

  return { label: `${time}  📋 Event`, summary: "Activity recorded", kind: "default" };
}

function fmtZone(zone: string): string {
  const map: Record<string, string> = {
    workspace: "Workspace (safe)",
    diagnostics: "Diagnostics (read-only)",
    forge: "Forge (build mode)",
    godmode: "God Mode (unrestricted)",
  };
  return map[zone] ?? zone;
}

function fmtRunResult(result: RunResult): string {
  if (!result) return "No result";
  if (result.error) return `Error: ${result.error}`;

  const lines: string[] = [];

  if (result.summary) {
    const s = result.summary;
    lines.push(`Goal: ${s.goal}`);
    lines.push(`Steps ran: ${s.steps_ran}  ✓ ${s.pass}  ✗ ${s.fail}${s.halted ? "  (halted)" : ""}`);
    lines.push("");
  }

  if (result.results) {
    for (const r of result.results) {
      lines.push(`${r.ok ? "✓" : "✗"} ${r.tool}`);
      if (!r.ok && r.error) lines.push(`  Error: ${r.error}`);
      if (r.output?.stdout?.trim()) {
        const out = r.output.stdout.trim().slice(0, 300);
        lines.push(`  Output: ${out}${r.output.stdout.trim().length > 300 ? "…" : ""}`);
      }
      if (r.output?.stderr?.trim()) {
        lines.push(`  Stderr: ${r.output.stderr.trim().slice(0, 200)}`);
      }
    }
  }

  return lines.join("\n") || (result.ok ? "Completed successfully" : "Failed");
}

// ── Quick Launch definitions ───────────────────────────────────────────────────

const LAUNCHES = [
  {
    id: "smoke",
    title: "Check repo",
    sub: "git.status",
    steps: [{ tool: "git.status" }],
    goal: "Check repo status",
  },
  {
    id: "build",
    title: "Build web UI",
    sub: "web.build",
    steps: [{ tool: "web.build" }],
    goal: "Build web UI",
  },
  {
    id: "tests",
    title: "Run tests",
    sub: "web.pw",
    steps: [{ tool: "web.pw" }],
    goal: "Run Playwright tests",
  },
  {
    id: "full",
    title: "Build + Test",
    sub: "web.build → web.pw",
    steps: [{ tool: "web.build" }, { tool: "web.pw" }],
    goal: "Build web UI then run tests",
  },
] as const;

// ── Component ──────────────────────────────────────────────────────────────────

export default function CockpitPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);
  const [heartbeatResult, setHeartbeatResult] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [h, s, r] = await Promise.all([
        fetch("/api/health").then((x) => x.json()).catch(() => ({ ok: false, error: "unreachable" })),
        fetch("/api/snapshot").then((x) => x.json()).catch(() => ({ ok: false })),
        fetch("/api/receipts?limit=15").then((x) => x.json()).catch(() => ({ ok: false, receipts: [] })),
      ]);
      setHealth(h);
      setSnapshot(s);
      setReceipts(Array.isArray(r?.receipts) ? r.receipts : []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      setHealth({ ok: false, error: "Could not reach Squidley" });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh every 15s
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function pingHeartbeat() {
    setHeartbeatLoading(true);
    setHeartbeatResult(null);
    try {
      const res = await fetch("/api/heartbeat", { method: "POST" }).then((x) => x.json());
      if (res.ok) {
        const ms = res.ms ? ` (${res.ms}ms)` : "";
        const model = res.active_model?.label ?? res.model ?? "local model";
        setHeartbeatResult(`✓ ${model} is alive${ms}`);
      } else {
        setHeartbeatResult(`✗ Heartbeat failed — ${res.error ?? "no response"}`);
      }
    } catch {
      setHeartbeatResult("✗ Could not reach Squidley");
    } finally {
      setHeartbeatLoading(false);
      setTimeout(refresh, 1000);
    }
  }

  async function launch(id: string, steps: readonly { tool: string }[], goal: string) {
    setRunLoading(id);
    setRunResult(null);
    try {
      const res = await fetch("/api/autonomy/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, steps, stop_on_fail: true }),
      }).then((x) => x.json());

      setRunResult({ id, text: fmtRunResult(res), ok: Boolean(res.ok) });
    } catch (e: any) {
      setRunResult({ id, text: `Could not run — ${e?.message ?? "error"}`, ok: false });
    } finally {
      setRunLoading(null);
      setTimeout(refresh, 1000);
    }
  }

  const alive = health?.ok === true;
  const zone = snapshot?.runtime?.safety_zone ?? "workspace";
  const strictLocal = snapshot?.budgets?.strict_local_only ?? false;
  const onboarded = snapshot?.onboarding?.completed ?? false;
  const currentModel = snapshot?.tiers?.find((t) => t.name === "local")?.model ?? "unknown";

  return (
    <main className="cockpit">
      {/* Header */}
      <div className="cockpit-header">
        <div className="cockpit-title">
          🐙 Squidley Remote
        </div>
        <div className="cockpit-build">
          {lastUpdated ? `Updated ${lastUpdated}` : loading ? "Loading…" : ""}
        </div>
      </div>

      {/* System Status */}
      <div className="card">
        <div className="card-title">System Status</div>
        <div className="status-grid">
          <div className="status-pill">
            <span className="pill-label">Squidley</span>
            <span className={`pill-value ${alive ? "green" : "red"}`}>
              {loading ? "Checking…" : alive ? "● Online" : "● Offline"}
            </span>
          </div>
          <div className="status-pill">
            <span className="pill-label">Active Zone</span>
            <span className="pill-value blue">{fmtZone(zone)}</span>
          </div>
          <div className="status-pill">
            <span className="pill-label">Cloud Access</span>
            <span className={`pill-value ${strictLocal ? "yellow" : "green"}`}>
              {strictLocal ? "Blocked (local only)" : "Allowed"}
            </span>
          </div>
          <div className="status-pill">
            <span className="pill-label">Setup</span>
            <span className={`pill-value ${onboarded ? "green" : "yellow"}`}>
              {onboarded ? "Complete" : "Not finished"}
            </span>
          </div>
        </div>
      </div>

      {/* Active Model */}
      {snapshot?.ok && (
        <div className="card">
          <div className="card-title">Active Model</div>
          <div className="status-row">
            <span className={`status-dot ${alive ? "dot-green" : "dot-muted"}`}></span>
            <span className="status-value">{currentModel}</span>
            <span className="status-label">running locally via Ollama</span>
          </div>
        </div>
      )}

      {/* Heartbeat */}
      <div className="card">
        <div className="card-title">Heartbeat Check</div>
        <div className="btn-row" style={{ marginBottom: heartbeatResult ? 10 : 0 }}>
          <button className="btn btn-primary" onClick={pingHeartbeat} disabled={heartbeatLoading}>
            {heartbeatLoading ? <><span className="spinner"></span> Pinging…</> : "Ping Squidley"}
          </button>
        </div>
        {heartbeatResult && (
          <div className={`run-result ${heartbeatResult.startsWith("✓") ? "success" : "failure"}`}>
            {heartbeatResult}
          </div>
        )}
      </div>

      {/* Quick Launch */}
      <div className="card">
        <div className="card-title">Quick Launch</div>
        <div className="launch-grid">
          {LAUNCHES.map((l) => (
            <button
              key={l.id}
              className="launch-btn"
              onClick={() => launch(l.id, l.steps, l.goal)}
              disabled={runLoading !== null || !alive}
            >
              <div className="launch-btn-title">
                {runLoading === l.id ? <><span className="spinner"></span> Running…</> : l.title}
              </div>
              <div className="launch-btn-sub">{l.sub}</div>
            </button>
          ))}
        </div>

        {runResult && (
          <div style={{ marginTop: 12 }}>
            <div className={`run-result ${runResult.ok ? "success" : "failure"}`}>
              {runResult.text}
            </div>
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="card">
        <div className="refresh-row" style={{ marginBottom: 10 }}>
          <span className="card-title" style={{ marginBottom: 0 }}>Activity Log</span>
          <button className="btn" onClick={refresh} style={{ padding: "4px 10px", fontSize: 12 }}>
            Refresh
          </button>
        </div>

        {receipts.length === 0 ? (
          <div className="empty">No activity yet</div>
        ) : (
          <div className="activity-list">
            {receipts.map((r) => {
              const { label, summary, kind } = fmtReceipt(r);
              return (
                <div key={r.receipt_id} className={`activity-item ${kind}`}>
                  <div style={{ color: "var(--text-muted)", marginBottom: 2, fontSize: 11 }}>{label}</div>
                  <div>{summary}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", paddingBottom: 24 }}>
        Squidley Remote · port 3002 · local-first · {receipts.length} recent events
      </div>
    </main>
  );
}
