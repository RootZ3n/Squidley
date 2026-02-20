"use client";

import React, { useMemo, useState } from "react";

type AnyJson = any;

async function apiGet(path: string): Promise<AnyJson> {
  const r = await fetch(`/api/zsq/${path.replace(/^\/+/, "")}`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error ?? `HTTP ${r.status}`), { status: r.status, body: j });
  return j;
}

async function apiPost(path: string, body: any): Promise<AnyJson> {
  const r = await fetch(`/api/zsq/${path.replace(/^\/+/, "")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error ?? `HTTP ${r.status}`), { status: r.status, body: j });
  return j;
}

function pretty(x: any) {
  return JSON.stringify(x, null, 2);
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #333", borderRadius: 10, padding: 14, background: "#0b0b0b" }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Small({ children }: { children: React.ReactNode }) {
  return <div style={{ opacity: 0.85, fontSize: 12 }}>{children}</div>;
}

export default function ToolsPage() {
  const [policy, setPolicy] = useState<any>(null);
  const [policyErr, setPolicyErr] = useState<string>("");

  const [writePath, setWritePath] = useState("/media/zen/AI/zensquid/tmp/hello.txt");
  const [writeContent, setWriteContent] = useState("hello from web\n");
  const [writeOut, setWriteOut] = useState<any>(null);

  const [readPath, setReadPath] = useState("/media/zen/AI/zensquid/tmp/ok.txt");
  const [readOut, setReadOut] = useState<any>(null);

  const [execCwd, setExecCwd] = useState("/media/zen/AI/zensquid");
  const [execCmd, setExecCmd] = useState(`/usr/bin/env bash -lc "pwd && ls -la"`);
  const [execOut, setExecOut] = useState<any>(null);

  const [svcAction, setSvcAction] = useState<"status" | "restart" | "stop" | "start">("status");
  const [svcName, setSvcName] = useState("zensquid-api.service");
  const [svcOut, setSvcOut] = useState<any>(null);

  const [receiptId, setReceiptId] = useState("");
  const [receiptOut, setReceiptOut] = useState<any>(null);

  const denialHint = useMemo(() => {
    const o = writeOut ?? readOut ?? execOut ?? svcOut ?? receiptOut;
    if (!o) return null;
    if (o?.ok === false && o?.error === "Denied by capability gate") {
      return `Denied: ${o.capability} (${o.matched_rule}) — ${o.reason} — receipt=${o.receipt_id}`;
    }
    return null;
  }, [writeOut, readOut, execOut, svcOut, receiptOut]);

  async function refreshPolicy() {
    setPolicyErr("");
    try {
      const j = await apiGet("runtime/effective_policy");
      setPolicy(j);
    } catch (e: any) {
      setPolicyErr(pretty(e?.body ?? { error: String(e?.message ?? e) }));
    }
  }

  async function doWrite() {
    setWriteOut(null);
    try {
      setWriteOut(await apiPost("tools/fs/write", { path: writePath, content: writeContent }));
    } catch (e: any) {
      setWriteOut(e?.body ?? { ok: false, error: String(e?.message ?? e) });
    }
  }

  async function doRead() {
    setReadOut(null);
    try {
      setReadOut(await apiPost("tools/fs/read", { path: readPath }));
    } catch (e: any) {
      setReadOut(e?.body ?? { ok: false, error: String(e?.message ?? e) });
    }
  }

  async function doExec() {
    setExecOut(null);
    const parts = execCmd.trim().split(/\s+/);
    // If user gave a shell string, keep it as bash -lc
    const cmd =
      execCmd.includes("bash") && execCmd.includes("-lc")
        ? ["/usr/bin/env", "bash", "-lc", execCmd.replace(/^.*-lc\s+/, "").replace(/^"|"$/g, "")]
        : parts;

    try {
      setExecOut(await apiPost("tools/exec", { cmd, cwd: execCwd }));
    } catch (e: any) {
      setExecOut(e?.body ?? { ok: false, error: String(e?.message ?? e) });
    }
  }

  async function doSystemctl() {
    setSvcOut(null);
    try {
      setSvcOut(await apiPost("tools/systemctl/user", { action: svcAction, unit: svcName }));
    } catch (e: any) {
      setSvcOut(e?.body ?? { ok: false, error: String(e?.message ?? e) });
    }
  }

  async function fetchReceipt() {
    setReceiptOut(null);
    if (!receiptId.trim()) return;
    try {
      setReceiptOut(await apiGet(`receipts/${encodeURIComponent(receiptId.trim())}`));
    } catch (e: any) {
      setReceiptOut(e?.body ?? { ok: false, error: String(e?.message ?? e) });
    }
  }

  return (
    <div style={{ padding: 18, color: "#eaeaea", fontFamily: "ui-sans-serif, system-ui" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>ZenSquid Tools</h1>
        <Small>Safe(ish) controls. Receipts always. No token leaks.</Small>
      </div>

      {denialHint && (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, border: "1px solid #6b2" }}>
          <Small>{denialHint}</Small>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card title="Runtime / Effective Policy">
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <button onClick={refreshPolicy}>Refresh</button>
          </div>
          {policyErr ? (
            <pre style={{ whiteSpace: "pre-wrap" }}>{policyErr}</pre>
          ) : (
            <pre style={{ whiteSpace: "pre-wrap" }}>{policy ? pretty(policy) : "Click Refresh"}</pre>
          )}
        </Card>

        <Card title="FS Write">
          <Small>Writes are allowed only inside project root unless policy says otherwise.</Small>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <input value={writePath} onChange={(e) => setWritePath(e.target.value)} />
            <textarea value={writeContent} onChange={(e) => setWriteContent(e.target.value)} rows={5} />
            <button onClick={doWrite}>Write</button>
            <pre style={{ whiteSpace: "pre-wrap" }}>{writeOut ? pretty(writeOut) : ""}</pre>
          </div>
        </Card>

        <Card title="FS Read">
          <div style={{ display: "grid", gap: 8 }}>
            <input value={readPath} onChange={(e) => setReadPath(e.target.value)} />
            <button onClick={doRead}>Read</button>
            <pre style={{ whiteSpace: "pre-wrap" }}>{readOut ? pretty(readOut) : ""}</pre>
          </div>
        </Card>

        <Card title="Exec">
          <Small>Still gated by capability policy + denylist (sudo/dd/mkfs/etc).</Small>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <input value={execCwd} onChange={(e) => setExecCwd(e.target.value)} />
            <input value={execCmd} onChange={(e) => setExecCmd(e.target.value)} />
            <button onClick={doExec}>Run</button>
            <pre style={{ whiteSpace: "pre-wrap" }}>{execOut ? pretty(execOut) : ""}</pre>
          </div>
        </Card>

        <Card title="systemctl --user">
          <Small>For zensquid-api.service / zensquid-web.service etc.</Small>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <select value={svcAction} onChange={(e) => setSvcAction(e.target.value as any)}>
              <option value="status">status</option>
              <option value="restart">restart</option>
              <option value="start">start</option>
              <option value="stop">stop</option>
            </select>
            <input value={svcName} onChange={(e) => setSvcName(e.target.value)} />
            <button onClick={doSystemctl}>Execute</button>
            <pre style={{ whiteSpace: "pre-wrap" }}>{svcOut ? pretty(svcOut) : ""}</pre>
          </div>
        </Card>

        <Card title="Receipt Viewer">
          <Small>Paste a receipt_id to fetch the full receipt JSON.</Small>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <input value={receiptId} onChange={(e) => setReceiptId(e.target.value)} placeholder="e.g. JCCLzuVnhhL1" />
            <button onClick={fetchReceipt}>Fetch Receipt</button>
            <pre style={{ whiteSpace: "pre-wrap" }}>{receiptOut ? pretty(receiptOut) : ""}</pre>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Small>
          Tip: If this page works, you’ve got a clean chain: Web → Proxy (token injected) → API → Capability Gate → Receipt.
        </Small>
      </div>
    </div>
  );
}
