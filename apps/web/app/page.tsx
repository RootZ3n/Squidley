// apps/web/app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ZENSQUID_API,
  apiGet,
  chat as chatApi,
  getAgentProfile,
  getSkills,
  type AgentProfile,
  type SkillsList,
  type ChatResponse
} from "@/app/api/zensquid";

import ToolPanel from "@/components/ToolPanel";
import SkillsPanel from "@/components/SkillsPanel";
import MemoryPanel from "@/components/MemoryPanel";
import ProfilePanel from "@/components/ProfilePanel";

type ReceiptRow = {
  receipt_id: string;
  created_at: string;
  kind: string | null;
  tier: string;
  provider: string;
  model: string;
  escalated?: boolean;
  escalation_reason?: string | null;
  tool?: { allowed: boolean; capability: string } | null;
  input_preview?: string | null;
};

export default function Page() {
  const [health, setHealth] = useState<any>(null);
  const [heartbeat, setHeartbeat] = useState<any>(null);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [skills, setSkills] = useState<SkillsList | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [chatOutput, setChatOutput] = useState<ChatResponse | null>(null);
  const [chatBusy, setChatBusy] = useState(false);

  const [selectedSkill, setSelectedSkill] = useState<string>("(none)");
  const selectedSkillForApi = useMemo(() => {
    if (!selectedSkill || selectedSkill === "(none)") return null;
    return selectedSkill;
  }, [selectedSkill]);

  async function refreshAll() {
    const h = await apiGet("/health");
    setHealth(h);

    const r = await apiGet<{ count: number; receipts: ReceiptRow[] }>("/receipts?limit=50");
    setReceipts(r.receipts);

    const p = await getAgentProfile();
    setProfile(p);

    const s = await getSkills();
    setSkills(s);
  }

  async function runHeartbeat() {
    const hb = await fetch(`${ZENSQUID_API}/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Return exactly: OK" })
    }).then((r) => r.json());
    setHeartbeat(hb);

    const r = await apiGet<{ count: number; receipts: ReceiptRow[] }>("/receipts?limit=50");
    setReceipts(r.receipts);
  }

  async function sendChat() {
    const input = chatInput.trim();
    if (!input) return;

    setChatBusy(true);
    setChatOutput(null);

    try {
      const res = await chatApi(input, selectedSkillForApi);
      setChatOutput(res);

      const r = await apiGet<{ count: number; receipts: ReceiptRow[] }>("/receipts?limit=50");
      setReceipts(r.receipts);
    } catch (e: any) {
      setChatOutput({ error: String(e?.message ?? e) } as any);
    } finally {
      setChatBusy(false);
    }
  }

  useEffect(() => {
    refreshAll().catch(console.error);
  }, []);

  return (
    <div style={{ padding: 18, maxWidth: 1280, margin: "0 auto", color: "#111" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>ZenSquid</div>
          <div style={{ opacity: 0.8 }}>API: {ZENSQUID_API}</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => refreshAll()} style={btn()}>
            Refresh
          </button>
          <button onClick={() => runHeartbeat()} style={btn()}>
            Heartbeat
          </button>
          <button
            onClick={() => apiGet("/receipts?limit=50").then((r: any) => setReceipts(r.receipts))}
            style={btn()}
          >
            Receipts
          </button>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel title="Status">
          <pre style={pre()}>{JSON.stringify({ health }, null, 2)}</pre>
        </Panel>

        <Panel
          title="Receipts (latest)"
          right={
            <button
              onClick={() => apiGet("/receipts?limit=50").then((r: any) => setReceipts(r.receipts))}
              style={btnSmall()}
            >
              Reload
            </button>
          }
        >
          <div style={{ maxHeight: 350, overflow: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            {receipts.map((r) => (
              <div key={r.receipt_id} style={card()}>
                <div style={{ fontWeight: 700, color: "#111" }}>{r.receipt_id}</div>
                <div style={{ opacity: 0.85, fontSize: 12, color: "#222" }}>
                  {new Date(r.created_at).toLocaleString()} • kind={r.kind ?? "?"} • tier={r.tier} • model={r.model}
                </div>
                <div style={{ marginTop: 6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "#111" }}>
                  {r.input_preview ?? ""}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Heartbeat">
          <pre style={pre()}>{heartbeat === null ? "null" : JSON.stringify(heartbeat, null, 2)}</pre>
        </Panel>

        <Panel title="Chat">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Skill context:{" "}
              <span style={{ fontWeight: 800 }}>{selectedSkillForApi ? selectedSkillForApi : "(none)"}</span>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <select value={selectedSkill} onChange={(e) => setSelectedSkill(e.target.value)} style={select()}>
                <option>(none)</option>
                {(skills?.skills ?? []).map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Talk to Squidley… (try: 'Remember this: Jeff hates drifting')"
              style={input()}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!chatBusy) sendChat();
                }
              }}
            />
            <button onClick={() => sendChat()} style={btn()} disabled={chatBusy}>
              {chatBusy ? "Sending…" : "Send"}
            </button>
            <button onClick={() => setChatOutput(null)} style={btn()}>
              Clear
            </button>
          </div>

          <div style={{ height: 10 }} />
          <pre style={pre()}>{chatOutput === null ? "null" : JSON.stringify(chatOutput, null, 2)}</pre>
        </Panel>
      </div>

      <div style={{ height: 14 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel title="Squidley Profile">
          <ProfilePanel />
        </Panel>

        <Panel title="Chat Intel (Option 1)">
          <pre style={pre()}>
            {chatOutput?.context ? JSON.stringify(chatOutput.context, null, 2) : "No context yet. Send a chat message."}
          </pre>
        </Panel>

        <Panel title="Skills">
          <SkillsPanel />
        </Panel>

        <Panel title="Memory (markdown)">
          <MemoryPanel />
        </Panel>

        <Panel title="Tool Panel (admin token)">
          <ToolPanel />
        </Panel>
      </div>
    </div>
  );
}

function Panel(props: { title: string; right?: any; children: any }) {
  return (
    <div style={panel()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 800, color: "#111" }}>{props.title}</div>
        {props.right ?? null}
      </div>
      {props.children}
    </div>
  );
}

function panel() {
  return {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 12,
    padding: 14,
    background: "rgba(255,255,255,0.92)",
    color: "#111"
  } as const;
}
function pre() {
  return {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: "rgba(0,0,0,0.04)",
    border: "1px solid rgba(0,0,0,0.06)",
    padding: 10,
    borderRadius: 10,
    fontSize: 12,
    margin: 0,
    color: "#111"
  } as const;
}
function btn() {
  return {
    border: "1px solid rgba(0,0,0,0.18)",
    background: "white",
    borderRadius: 10,
    padding: "8px 10px",
    cursor: "pointer",
    color: "#111"
  } as const;
}
function btnSmall() {
  return {
    ...btn(),
    padding: "6px 8px",
    fontSize: 12
  } as const;
}
function input() {
  return {
    flex: 1,
    border: "1px solid rgba(0,0,0,0.18)",
    borderRadius: 10,
    padding: "10px 12px",
    outline: "none",
    background: "white",
    color: "#111"
  } as const;
}
function select() {
  return {
    border: "1px solid rgba(0,0,0,0.18)",
    borderRadius: 10,
    padding: "8px 10px",
    background: "white",
    color: "#111"
  } as const;
}
function card() {
  return {
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: 12,
    padding: 10,
    background: "white",
    color: "#111"
  } as const;
}
