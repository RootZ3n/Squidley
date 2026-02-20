// apps/web/src/components/ZsqHeader.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Snapshot = {
  ok: boolean;
  node: string;
  tiers: Array<{ name: string; provider: string; model: string }>;
  budgets?: any;
  runtime?: any;
  effective?: any;
};

type Doctor = {
  ok: boolean;
  summary?: { pass: number; warn: number; fail: number };
};

type RuntimeView = {
  ok: boolean;
  runtime: { strict_local_only: boolean | null; safety_zone: string | null };
  effective: {
    strict_local_only: boolean;
    strict_local_only_source: "runtime" | "config";
    safety_zone: string;
    safety_zone_source: "runtime" | "config";
  };
};

async function zget<T>(path: string): Promise<T> {
  const r = await fetch(`/api/zsq/${path.replace(/^\/+/, "")}`, { cache: "no-store" });
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Bad JSON from /api/zsq/${path}: ${text}`);
  }
}

async function zpost<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`/api/zsq/${path.replace(/^\/+/, "")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Bad JSON from POST /api/zsq/${path}: ${text}`);
  }
}

export default function ZsqHeader() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [runtime, setRuntime] = useState<RuntimeView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [chatMode, setChatMode] = useState<"auto" | "force_local" | "force_tier">("auto");
  const [forceTier, setForceTier] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [chatOut, setChatOut] = useState<string>("");
  const [chatMeta, setChatMeta] = useState<{ tier?: string; provider?: string; model?: string; escalation_reason?: string }>(
    {}
  );

  const tiers = snapshot?.tiers ?? [];
  const tierNames = useMemo(() => tiers.map((t) => t.name), [tiers]);

  async function refresh() {
    setErr(null);
    try {
      const [s, d, rt] = await Promise.all([
        zget<Snapshot>("/snapshot"),
        zget<Doctor>("/doctor"),
        zget<RuntimeView>("/runtime")
      ]);
      setSnapshot(s);
      setDoctor(d);
      setRuntime(rt);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, []);

  const strictLabel = runtime
    ? `${String(runtime.effective.strict_local_only)} (source=${runtime.effective.strict_local_only_source})`
    : "?";

  const safetyLabel = runtime
    ? `${runtime.effective.safety_zone} (source=${runtime.effective.safety_zone_source})`
    : "unknown";

  async function setStrict(value: boolean | null) {
    setBusy("strict");
    setErr(null);
    try {
      await zpost("/budgets/strict_local_only", { value });
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function setSafetyZone(value: string | null) {
    setBusy("zone");
    setErr(null);
    try {
      await zpost("/runtime/safety_zone", { value });
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function sendChat() {
    const input = chatInput.trim();
    if (!input) return;

    setBusy("chat");
    setErr(null);
    setChatOut("");
    setChatMeta({});

    try {
      const payload: any = { input, mode: chatMode };

      if (chatMode === "force_tier") payload.force_tier = (forceTier || "").trim() || undefined;
      if ((reason || "").trim()) payload.reason = reason.trim();

      const r = await zpost<any>("/chat", payload);
      setChatOut(String(r?.output ?? ""));
      setChatMeta({
        tier: r?.tier,
        provider: r?.provider,
        model: r?.model,
        escalation_reason: r?.escalation_reason
      });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      style={{
        border: "1px solid rgba(0,0,0,0.15)",
        borderRadius: 12,
        padding: 16
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>ZenSquid</div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Chip label="API" value="/api/zsq → 18790" />
          <Chip label="Node" value={snapshot?.node ?? "?"} />
          <Chip label="Strict" value={strictLabel} />
          <Chip label="Zone" value={safetyLabel} />
          <Chip
            label="Doctor"
            value={
              doctor?.summary
                ? `ok=${String(doctor.ok)} pass=${doctor.summary.pass} warn=${doctor.summary.warn} fail=${doctor.summary.fail}`
                : `ok=${String(doctor?.ok ?? "?")}`
            }
          />
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={!!busy} onClick={() => refresh()} style={btn()}>
            Refresh
          </button>

          <button disabled={busy === "strict"} onClick={() => setStrict(true)} style={btn()}>
            Local ON
          </button>
          <button disabled={busy === "strict"} onClick={() => setStrict(false)} style={btn()}>
            Local OFF
          </button>
          <button disabled={busy === "strict"} onClick={() => setStrict(null)} style={btn()}>
            Local CLEAR
          </button>

          <select
            disabled={busy === "zone"}
            value={runtime?.runtime?.safety_zone ?? ""}
            onChange={(e) => setSafetyZone(e.target.value ? e.target.value : null)}
            style={{
              ...btn(),
              paddingRight: 28
            }}
          >
            <option value="">Zone: (no override)</option>
            <option value="workspace">workspace</option>
            <option value="forge">forge</option>
          </select>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid rgba(255,0,0,0.25)" }}>
          <div style={{ fontWeight: 700 }}>Error</div>
          <div style={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>{err}</div>
        </div>
      )}

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask ZenSquid… (infra/tooling → local; code/diffs → coder; otherwise router decides)"
            rows={3}
            style={{
              width: "100%",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              padding: 10,
              resize: "vertical"
            }}
          />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 12, opacity: 0.8 }}>Mode</label>
            <select value={chatMode} onChange={(e) => setChatMode(e.target.value as any)} style={btn()}>
              <option value="auto">auto</option>
              <option value="force_local">force_local</option>
              <option value="force_tier">force_tier</option>
            </select>

            <label style={{ fontSize: 12, opacity: 0.8 }}>Tier</label>
            <select
              value={forceTier}
              onChange={(e) => setForceTier(e.target.value)}
              disabled={chatMode !== "force_tier"}
              style={btn()}
            >
              <option value="">(choose)</option>
              {tierNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>

            <label style={{ fontSize: 12, opacity: 0.8 }}>Reason</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Required for cloud escalation"
              style={{
                ...btn(),
                width: 260,
                cursor: "text"
              }}
            />

            <button disabled={busy === "chat"} onClick={sendChat} style={btn(true)}>
              Send
            </button>
          </div>

          {(chatMeta?.tier || chatOut) && (
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 12,
                padding: 12
              }}
            >
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, opacity: 0.85 }}>
                {chatMeta?.tier && <span><b>tier</b>={chatMeta.tier}</span>}
                {chatMeta?.provider && <span><b>provider</b>={chatMeta.provider}</span>}
                {chatMeta?.model && <span><b>model</b>={<span style={{ fontFamily: "monospace" }}>{chatMeta.model}</span>}</span>}
                {chatMeta?.escalation_reason && <span><b>why</b>={chatMeta.escalation_reason}</span>}
              </div>

              <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{chatOut}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 12,
        display: "flex",
        gap: 8,
        alignItems: "center"
      }}
    >
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function btn(primary = false): React.CSSProperties {
  return {
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.15)",
    padding: "8px 10px",
    background: primary ? "rgba(0,0,0,0.06)" : "transparent",
    cursor: "pointer",
    fontSize: 13
  };
}
