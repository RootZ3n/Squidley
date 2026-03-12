// apps/web/src/components/PlannerPanel.tsx
// Planner tab — Squidley interviews you, crystallizes a plan, optional Sonnet deep review

import { useState, useRef, useEffect } from "react";

const API = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:18790`
  : "http://localhost:18790";

interface Message { role: "user" | "assistant"; content: string; }
interface Props { adminToken?: string; pendingPlanId?: string | null; onPlanApproved?: () => void; onPlanDenied?: () => void; }

const PLANNER_CONTEXT = `You are Squidley in ARCHITECT MODE.
Your job right now is NOT to answer questions or run tools.
Your job is to deeply understand what Jeff wants to build or solve before anything gets planned.
RULES FOR THIS MODE:
- Ask ONE focused question at a time. Never stack questions.
- Listen carefully to the answers and build on them.
- Push back if something is vague or contradictory.
- Connect what Jeff says to what you know about his existing systems (Squidley, Krakzen, Mushin OS, the lab).
- When you have enough to write a real plan — say so. Don't drag it out.
- When Jeff says he's ready, or you feel you have enough, say: "I think I have what I need. Want me to crystallize this into a plan?"
WHAT YOU'RE BUILDING TOWARD:
A structured plan with: goal, why it matters, affected systems, ordered steps, risks, and open questions.
Start by asking what Jeff wants to work on today. One question. Then listen.`;

const inp: React.CSSProperties = {
  background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10, padding: "10px 12px", color: "rgba(255,255,255,0.9)",
  fontSize: 13, fontFamily: "inherit",
};

const btnStyle = (accent: string, disabled = false): React.CSSProperties => ({
  padding: "8px 16px", borderRadius: 10, border: "none",
  background: disabled ? "rgba(255,255,255,0.05)" : `rgba(${accent},0.18)`,
  color: disabled ? "rgba(255,255,255,0.3)" : `rgba(${accent},0.95)`,
  cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
  fontFamily: "inherit",
});

const bubble = (role: "user" | "assistant"): React.CSSProperties => ({
  maxWidth: "85%", alignSelf: role === "user" ? "flex-end" : "flex-start",
  background: role === "user" ? "rgba(255,160,60,0.12)" : "rgba(255,255,255,0.05)",
  border: `1px solid ${role === "user" ? "rgba(255,160,60,0.2)" : "rgba(255,255,255,0.08)"}`,
  borderRadius: role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
  padding: "10px 14px", fontSize: 13, lineHeight: 1.6,
  color: "rgba(255,255,255,0.9)", whiteSpace: "pre-wrap" as const,
});

const planBox: React.CSSProperties = {
  background: "rgba(0,0,0,0.25)", border: "1px solid rgba(100,200,255,0.2)",
  borderRadius: 12, padding: "14px 16px", fontSize: 13,
  color: "rgba(255,255,255,0.85)", whiteSpace: "pre-wrap" as const, lineHeight: 1.7,
};

export default function PlannerPanel({ adminToken = "" }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [crystallizing, setCrystallizing] = useState(false);
  const [deepReviewing, setDeepReviewing] = useState(false);
  const [sessionId] = useState(() => `planner-${Date.now()}`);
  const listRef = useRef<HTMLDivElement>(null);

  // Kick off the interview on mount
  useEffect(() => {
    if (messages.length === 0) startInterview();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, plan]);

  async function callChat(userMsg: string, history: Message[]): Promise<string> {
    const r = await fetch(`${API}/planner/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-zensquid-admin-token": adminToken },
      body: JSON.stringify({
        message: userMsg,
        session_id: sessionId,
        tier: "chat",
        context_hint: PLANNER_CONTEXT,
      }),
    });
    const j = await r.json().catch(() => ({})) as any;
    return j?.output ?? j?.response ?? j?.content ?? j?.message ?? "⚠️ No response";
  }

  async function startInterview() {
    setBusy(true);
    try {
      const reply = await callChat(
        "[SYSTEM: Begin the planning interview. Ask Jeff what he wants to work on today. One question only.]",
        []
      );
      setMessages([{ role: "assistant", content: reply }]);
    } catch (e: any) {
      setMessages([{ role: "assistant", content: `⚠️ ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!input.trim() || busy) return;
    const userMsg = input.trim();
    setInput("");
    const next: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(next);
    setBusy(true);
    try {
      const reply = await callChat(userMsg, next);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setMessages([...next, { role: "assistant", content: `⚠️ ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function crystallize() {
    setCrystallizing(true);
    setPlan(null);
    const transcript = messages.map(m => `${m.role === "user" ? "Jeff" : "Squidley"}: ${m.content}`).join("\n\n");
    const prompt = `Based on this planning conversation, produce a structured plan.

CONVERSATION:
${transcript}

OUTPUT FORMAT (use these exact headers):
## Goal
## Why It Matters
## Affected Systems
## Ordered Steps
## Risks
## Open Questions

Be specific. Use what was actually discussed. Do not invent anything not mentioned.`;

    try {
      const r = await fetch(`${API}/planner/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zensquid-admin-token": adminToken },
        body: JSON.stringify({
          message: prompt,
          session_id: `${sessionId}-crystallize`,
          tier: "chat",
        }),
      });
      const j = await r.json().catch(() => ({})) as any;
      setPlan(j?.output ?? j?.response ?? j?.content ?? "⚠️ No plan returned");
    } catch (e: any) {
      setPlan(`⚠️ ${e.message}`);
    } finally {
      setCrystallizing(false);
    }
  }

  async function deepReview() {
    if (!plan) return;
    setDeepReviewing(true);
    const prompt = `You are a senior systems architect reviewing a plan written by an AI assistant.
The plan was created for Jeff, a self-taught systems builder working on Squidley (AI orchestration platform), Krakzen (AI security tool), and Mushin OS (sovereign Debian-based AI OS).

Review this plan critically:
${plan}

Look for: logical gaps, missing steps, risks not mentioned, better sequencing, architecture conflicts with existing systems.
Be direct. Be specific. Rewrite the plan if it needs it.`;

    try {
      const r = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zensquid-admin-token": adminToken },
        body: JSON.stringify({
          message: prompt,
          session_id: `${sessionId}-deepreview`,
          tier: "claude-sonnet",
        }),
      });
      const j = await r.json().catch(() => ({})) as any;
      setPlan(j?.output ?? j?.response ?? j?.content ?? "⚠️ No response");
    } catch (e: any) {
      setPlan(`⚠️ ${e.message}`);
    } finally {
      setDeepReviewing(false);
    }
  }

  function reset() {
    setMessages([]);
    setPlan(null);
    setInput("");
    setTimeout(() => startInterview(), 50);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 480, gap: 0, fontFamily: "inherit" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: "rgba(255,160,60,0.95)", fontWeight: 700, fontSize: 15 }}>📋 Planner</span>
        <div style={{ display: "flex", gap: 8 }}>
          {messages.length > 2 && !plan && (
            <button onClick={crystallize} style={btnStyle("100,200,255", crystallizing)} disabled={crystallizing || busy}>
              {crystallizing ? "Crystallizing…" : "✦ Crystallize Plan"}
            </button>
          )}
          <button onClick={reset} style={btnStyle("255,255,255")} disabled={busy}>↺ New Session</button>
        </div>
      </div>

      {/* ── Chat transcript ── */}
      <div ref={listRef} style={{ flex: "1 1 0", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12, minHeight: 0, maxHeight: 360 }}>
        {messages.map((m, i) => (
          <div key={i} style={bubble(m.role)}>{m.content}</div>
        ))}
        {busy && <div style={{ ...bubble("assistant"), opacity: 0.5 }}>▍</div>}

        {/* ── Plan output ── */}
        {plan && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <div style={{ fontSize: 11, color: "rgba(100,200,255,0.7)", textTransform: "uppercase" as const, letterSpacing: 1 }}>
              {deepReviewing ? "Deep reviewing with Sonnet…" : "Crystallized Plan"}
            </div>
            <div style={planBox}>{plan}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              <button onClick={deepReview} style={btnStyle("180,120,255", deepReviewing)} disabled={deepReviewing}>
                {deepReviewing ? "Reviewing…" : "🔬 Deep Review (Sonnet)"}
              </button>
              <button onClick={crystallize} style={btnStyle("100,200,255", crystallizing)} disabled={crystallizing}>
                {crystallizing ? "…" : "↺ Re-crystallize"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Input ── */}
      {!plan && (
        <div style={{ display: "flex", gap: 8, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Answer Squidley's question…"
            style={{ ...inp, flex: 1 }}
            disabled={busy}
            autoFocus
          />
          <button onClick={send} style={btnStyle("255,160,60", busy || !input.trim())} disabled={busy || !input.trim()}>
            Send
          </button>
        </div>
      )}
      {plan && (
        <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          Plan crystallized. Continue the conversation or start a new session.
        </div>
      )}
    </div>
  );
}
