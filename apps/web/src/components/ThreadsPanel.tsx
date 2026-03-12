import { useState, useEffect } from "react";

const API = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:18790`
  : "http://localhost:18790";

interface Thread {
  thread_id: string; title: string;
  status: "active"|"parked"|"closed";
  tags: string[]; summary: string;
  open_loops: string[]; last_touched: string;
  is_active: boolean;
}

const card = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(180,140,255,0.08)" : "rgba(255,255,255,0.03)",
  border: `1px solid ${active ? "rgba(180,140,255,0.4)" : "rgba(255,255,255,0.08)"}`,
  borderRadius: 12, padding: "12px 14px", cursor: "pointer",
});
const badge = (color: string): React.CSSProperties => ({
  display: "inline-block", padding: "2px 8px", borderRadius: 20,
  fontSize: 11, background: color, color: "rgba(255,255,255,0.85)", marginRight: 4,
});
const btn = (primary = false): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 10,
  border: primary ? "none" : "1px solid rgba(255,255,255,0.12)",
  background: primary ? "rgba(180,140,255,0.18)" : "rgba(255,255,255,0.05)",
  color: primary ? "rgba(180,140,255,0.95)" : "rgba(255,255,255,0.7)",
  cursor: "pointer", fontSize: 13, fontWeight: primary ? 600 : 400,
});
const inp: React.CSSProperties = {
  background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10, padding: "10px 12px", color: "rgba(255,255,255,0.9)",
  fontSize: 13, width: "100%", boxSizing: "border-box" as const,
};
const statusColor = (s: string) =>
  s === "active" ? "rgba(100,220,100,0.35)" :
  s === "parked" ? "rgba(255,180,60,0.35)" : "rgba(180,180,180,0.25)";

export default function ThreadsPanel() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string|null>(null);
  const [selected, setSelected] = useState<Thread|null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newLoop, setNewLoop] = useState("");
  const [editingLoop, setEditingLoop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/threads`);
      const j = await r.json();
      if (j.ok) {
        setThreads(j.threads);
        setActiveId(j.active_id);
        setSelected((prev: Thread|null) => {
          if (!prev) return prev;
          return j.threads.find((t: Thread) => t.thread_id === prev.thread_id) ?? prev;
        });
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function activate(id: string) {
    setBusy(true);
    await fetch(`${API}/threads/${id}/activate`, { method: "POST" });
    setActiveId(id);
    setThreads(prev => prev.map(t => ({ ...t, is_active: t.thread_id === id })));
    setMsg("✅ Active thread switched"); setTimeout(() => setMsg(""), 2500);
    setBusy(false);
  }

  async function createThread() {
    if (!newTitle.trim()) return;
    setBusy(true);
    const r = await fetch(`${API}/threads`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        tags: newTags.split(",").map((t: string) => t.trim()).filter(Boolean),
        summary: newSummary.trim(),
        open_loops: newLoop.trim() ? [newLoop.trim()] : [],
        set_active: true,
      }),
    });
    const j = await r.json();
    if (j.ok) {
      setCreating(false);
      setNewTitle(""); setNewTags(""); setNewSummary(""); setNewLoop("");
      await load(); setSelected(j.thread);
      setMsg("✅ Thread created"); setTimeout(() => setMsg(""), 2500);
    }
    setBusy(false);
  }

  async function updateStatus(id: string, status: string) {
    setBusy(true);
    await fetch(`${API}/threads/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load(); setBusy(false);
  }

  async function deleteThread(id: string) {
    if (!confirm("Delete this thread permanently?")) return;
    setBusy(true);
    await fetch(`${API}/threads/${id}`, { method: "DELETE" });
    setSelected(null); await load(); setBusy(false);
  }

  async function addLoop() {
    if (!selected || !newLoop.trim()) return;
    setBusy(true);
    await fetch(`${API}/threads/${selected.thread_id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ open_loops: [...selected.open_loops, newLoop.trim()] }),
    });
    setNewLoop(""); setEditingLoop(false); await load(); setBusy(false);
  }

  async function removeLoop(idx: number) {
    if (!selected) return;
    await fetch(`${API}/threads/${selected.thread_id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ open_loops: selected.open_loops.filter((_: any, i: number) => i !== idx) }),
    });
    await load();
  }

  return (
    <div style={{ display: "flex", gap: 16, height: "100%", fontFamily: "inherit" }}>
      <div style={{ width: 270, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "rgba(180,140,255,0.9)", fontWeight: 700, fontSize: 15 }}>🧵 Threads</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={load} style={btn()} disabled={loading}>↻</button>
            <button onClick={() => setCreating(true)} style={btn(true)}>+ New</button>
          </div>
        </div>
        {msg && <div style={{ color: "rgba(100,220,100,0.9)", fontSize: 12 }}>{msg}</div>}
        {loading && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Loading…</div>}
        {threads.length === 0 && !loading && (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No threads yet.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", flex: 1 }}>
          {threads.map(t => (
            <div key={t.thread_id} style={card(t.is_active)} onClick={() => setSelected(t)}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                <span style={{ color: t.is_active ? "rgba(180,140,255,0.95)" : "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 600, flex: 1 }}>
                  {t.is_active ? "● " : ""}{t.title}
                </span>
                <span style={badge(statusColor(t.status))}>{t.status}</span>
              </div>
              {t.tags.length > 0 && <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{t.tags.join(", ")}</div>}
              {t.open_loops.length > 0 && <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,200,80,0.7)" }}>{t.open_loops.length} open loop{t.open_loops.length !== 1 ? "s" : ""}</div>}
              <div style={{ marginTop: 4, fontSize: 10, color: "rgba(255,255,255,0.22)" }}>{new Date(t.last_touched).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {creating ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ color: "rgba(180,140,255,0.9)", fontWeight: 700, fontSize: 15 }}>New Thread</span>
            <input placeholder="Title *" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={inp} />
            <input placeholder="Tags (comma separated)" value={newTags} onChange={e => setNewTags(e.target.value)} style={inp} />
            <textarea placeholder="Summary (optional)" value={newSummary} onChange={e => setNewSummary(e.target.value)} rows={3} style={{ ...inp, resize: "vertical" as const }} />
            <input placeholder="First open loop (optional)" value={newLoop} onChange={e => setNewLoop(e.target.value)} style={inp} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={createThread} style={btn(true)} disabled={busy || !newTitle.trim()}>{busy ? "Creating…" : "Create + Set Active"}</button>
              <button onClick={() => setCreating(false)} style={btn()}>Cancel</button>
            </div>
          </div>
        ) : selected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: selected.is_active ? "rgba(180,140,255,0.95)" : "rgba(255,255,255,0.9)" }}>
                  {selected.is_active ? "● " : ""}{selected.title}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>
                  {selected.thread_id} · {new Date(selected.last_touched).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, justifyContent: "flex-end" }}>
                {!selected.is_active && <button onClick={() => activate(selected.thread_id)} style={btn(true)} disabled={busy}>Set Active</button>}
                <button onClick={() => updateStatus(selected.thread_id, selected.status === "active" ? "parked" : "active")} style={btn()} disabled={busy}>
                  {selected.status === "active" ? "Park" : "Reactivate"}
                </button>
                <button onClick={() => deleteThread(selected.thread_id)} style={{ ...btn(), color: "rgba(255,100,100,0.8)" }} disabled={busy}>Delete</button>
              </div>
            </div>

            {selected.tags.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {selected.tags.map((tag: string) => <span key={tag} style={badge("rgba(100,150,255,0.25)")}>{tag}</span>)}
              </div>
            )}

            {selected.summary && (
              <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 1 }}>Summary</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>{selected.summary}</div>
              </div>
            )}

            <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,200,80,0.15)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "rgba(255,200,80,0.7)", textTransform: "uppercase" as const, letterSpacing: 1 }}>Open Loops ({selected.open_loops.length})</div>
                <button onClick={() => setEditingLoop(true)} style={{ ...btn(), fontSize: 11, padding: "4px 10px" }}>+ Add</button>
              </div>
              {selected.open_loops.length === 0 && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No open loops — clear.</div>}
              {selected.open_loops.map((loop: string, i: number) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>→ {loop}</span>
                  <button onClick={() => removeLoop(i)} style={{ background: "none", border: "none", color: "rgba(255,100,100,0.6)", cursor: "pointer", fontSize: 18, padding: "0 4px" }}>×</button>
                </div>
              ))}
              {editingLoop && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input placeholder="New open loop…" value={newLoop} onChange={e => setNewLoop(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addLoop(); }} autoFocus style={{ ...inp, flex: 1 }} />
                  <button onClick={addLoop} style={btn(true)} disabled={busy}>Add</button>
                  <button onClick={() => { setEditingLoop(false); setNewLoop(""); }} style={btn()}>×</button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, marginTop: 20 }}>Select a thread to view, or create a new one.</div>
        )}
      </div>
    </div>
  );
}
