// apps/web/src/components/ToolPanel.tsx
"use client";

import { useMemo, useState } from "react";
import { ZENSQUID_API } from "@/app/api/zensquid";

type Mode = "fs.write" | "fs.read" | "exec" | "systemctl.user";

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export default function ToolPanel() {
  const [mode, setMode] = useState<Mode>("fs.write");
  const [adminToken, setAdminToken] = useState<string>("");

  const [path, setPath] = useState<string>("/media/zen/AI/zensquid/tmp/ui-test.txt");
  const [content, setContent] = useState<string>("hello from UI");

  const [cmd, setCmd] = useState<string>("pwd && ls -la");
  const [unit, setUnit] = useState<string>("zensquid-api.service");
  const [action, setAction] = useState<string>("status"); // status|restart|stop|start

  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<any>(null);

  const headers = useMemo(() => {
    const h: Record<string, string> = { "content-type": "application/json" };
    // IMPORTANT: this is the header your API expects
    if (adminToken.trim()) h["x-zensquid-admin-token"] = adminToken.trim();
    return h;
  }, [adminToken]);

  async function run() {
    setBusy(true);
    setOutput(null);

    try {
      let url = "";
      let body: any = {};

      if (mode === "fs.write") {
        url = `${ZENSQUID_API}/tools/fs/write`;
        body = { path, content };
      } else if (mode === "fs.read") {
        url = `${ZENSQUID_API}/tools/fs/read`;
        body = { path };
      } else if (mode === "exec") {
        // this matches the button label "exec" you already have in UI
        // If your API expects a different shape, the response will say so.
        url = `${ZENSQUID_API}/tools/exec`;
        body = { cmd };
      } else if (mode === "systemctl.user") {
        url = `${ZENSQUID_API}/tools/systemctl/user`;
        body = { unit, action };
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });

      const text = await res.text();
      const json = safeJsonParse(text);

      setOutput({
        ok_http: res.ok,
        status: res.status,
        url,
        sent: { mode, ...(mode === "fs.write" ? { path, content } : {}) },
        response: json ?? text
      });
    } catch (e: any) {
      setOutput({ error: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  const btn = (active: boolean) => ({
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
    fontSize: 12
  });

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    outline: "none" as const
  };

  const labelStyle = { fontSize: 12, opacity: 0.85, marginBottom: 6 };

  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>Tool Panel · admin token required</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <button style={btn(mode === "fs.write")} onClick={() => setMode("fs.write")}>
          fs.write
        </button>
        <button style={btn(mode === "fs.read")} onClick={() => setMode("fs.read")}>
          fs.read
        </button>
        <button style={btn(mode === "exec")} onClick={() => setMode("exec")}>
          exec
        </button>
        <button style={btn(mode === "systemctl.user")} onClick={() => setMode("systemctl.user")}>
          systemctl.user
        </button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={labelStyle}>Admin token</div>
        <input
          style={inputStyle}
          placeholder="paste ZENSQUID_ADMIN_TOKEN here"
          value={adminToken}
          onChange={(e) => setAdminToken(e.target.value)}
        />
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
          Sent as header: <code>x-zensquid-admin-token</code>
        </div>
      </div>

      {mode === "fs.write" || mode === "fs.read" ? (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={labelStyle}>Path</div>
            <input style={inputStyle} value={path} onChange={(e) => setPath(e.target.value)} />
          </div>

          {mode === "fs.write" ? (
            <div style={{ marginBottom: 10 }}>
              <div style={labelStyle}>Content</div>
              <textarea
                style={{ ...inputStyle, minHeight: 110, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {mode === "exec" ? (
        <div style={{ marginBottom: 10 }}>
          <div style={labelStyle}>Command</div>
          <textarea
            style={{ ...inputStyle, minHeight: 90, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
          />
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            Endpoint: <code>{ZENSQUID_API}/tools/exec</code>
          </div>
        </div>
      ) : null}

      {mode === "systemctl.user" ? (
        <div style={{ marginBottom: 10 }}>
          <div style={labelStyle}>Unit</div>
          <input style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} />

          <div style={{ height: 10 }} />

          <div style={labelStyle}>Action</div>
          <input style={inputStyle} value={action} onChange={(e) => setAction(e.target.value)} />

          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            Endpoint: <code>{ZENSQUID_API}/tools/systemctl/user</code>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => run()}
          disabled={busy}
          style={{
            padding: "8px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.10)",
            color: "white",
            cursor: busy ? "not-allowed" : "pointer"
          }}
        >
          {busy ? "Running…" : "Run"}
        </button>

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Endpoint:{" "}
          <code>
            {mode === "fs.write"
              ? "/tools/fs/write"
              : mode === "fs.read"
              ? "/tools/fs/read"
              : mode === "exec"
              ? "/tools/exec"
              : "/tools/systemctl/user"}
          </code>
        </div>
      </div>

      <div style={{ height: 10 }} />

      <pre
        style={{
          padding: 12,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(0,0,0,0.25)",
          color: "white",
          maxHeight: 220,
          overflow: "auto",
          fontSize: 12
        }}
      >
        {output === null ? "// output…" : JSON.stringify(output, null, 2)}
      </pre>
    </div>
  );
}
