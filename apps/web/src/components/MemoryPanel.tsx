// apps/web/src/components/MemoryPanel.tsx
"use client";

import { useMemo, useState } from "react";
import { ZENSQUID_API } from "@/app/api/zensquid";

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

type SearchResult = { path: string; snippet: string };

export default function MemoryPanel() {
  const [adminToken, setAdminToken] = useState("");
  const [folder, setFolder] = useState("general");
  const [filePath, setFilePath] = useState("general/hello.md");
  const [search, setSearch] = useState("squidley");

  const [entries, setEntries] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);

  const headers = useMemo(() => {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (adminToken.trim()) h["x-zensquid-admin-token"] = adminToken.trim();
    return h;
  }, [adminToken]);

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.25)",
    color: "white",
    outline: "none" as const
  };

  async function loadFolder() {
    setBusy(true);
    setLast(null);

    try {
      // Try common endpoint name first:
      const url = `${ZENSQUID_API}/memory/list?folder=${encodeURIComponent(folder)}`;
      const res = await fetch(url, { headers });
      const text = await res.text();
      const json = safeJsonParse(text);

      if (res.ok && json?.ok && Array.isArray(json?.entries)) {
        setEntries(json.entries);
        setLast({ ok_http: true, status: res.status, url, response: json });
      } else {
        // If list endpoint isn't implemented, show response clearly
        setEntries([]);
        setLast({ ok_http: res.ok, status: res.status, url, response: json ?? text });
      }
    } catch (e: any) {
      setEntries([]);
      setLast({ error: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  async function doSearch() {
    setBusy(true);
    setLast(null);

    try {
      const url = `${ZENSQUID_API}/memory/search?q=${encodeURIComponent(search)}&folder=${encodeURIComponent(folder)}`;
      const res = await fetch(url, { headers });
      const text = await res.text();
      const json = safeJsonParse(text);

      if (res.ok && json?.ok && Array.isArray(json?.results)) {
        const results: SearchResult[] = json.results;
        setEntries(results.map((r) => r.path));
      }
      setLast({ ok_http: res.ok, status: res.status, url, response: json ?? text });
    } catch (e: any) {
      setLast({ error: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  async function loadFile() {
    setBusy(true);
    setLast(null);

    try {
      const url = `${ZENSQUID_API}/memory/read?path=${encodeURIComponent(filePath)}`;
      const res = await fetch(url, { headers });
      const text = await res.text();
      const json = safeJsonParse(text);

      if (res.ok && json?.ok && typeof json?.content === "string") {
        setContent(json.content);
      }
      setLast({ ok_http: res.ok, status: res.status, url, response: json ?? text });
    } catch (e: any) {
      setLast({ error: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  async function saveFile() {
    setBusy(true);
    setLast(null);

    try {
      const url = `${ZENSQUID_API}/memory/write`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ path: filePath, content })
      });
      const text = await res.text();
      const json = safeJsonParse(text);

      setLast({ ok_http: res.ok, status: res.status, url, response: json ?? text });
    } catch (e: any) {
      setLast({ error: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Memory (markdown)</div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Admin token</div>
        <input
          style={inputStyle}
          placeholder="paste ZENSQUID_ADMIN_TOKEN here"
          value={adminToken}
          onChange={(e) => setAdminToken(e.target.value)}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Folder</div>
          <input style={inputStyle} value={folder} onChange={(e) => setFolder(e.target.value)} />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>File path (relative to memory/)</div>
          <input style={inputStyle} value={filePath} onChange={(e) => setFilePath(e.target.value)} />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Search</div>
          <input style={inputStyle} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, justifyContent: "flex-end" }}>
        <button onClick={() => loadFolder()} disabled={busy} style={btn()}>
          Load folder
        </button>
        <button onClick={() => doSearch()} disabled={busy} style={btn()}>
          Search
        </button>
        <button onClick={() => saveFile()} disabled={busy} style={btn()}>
          Save
        </button>
        <button onClick={() => loadFile()} disabled={busy} style={btn()}>
          Load file
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Entries</div>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              background: "rgba(0,0,0,0.2)",
              padding: 10,
              minHeight: 180,
              maxHeight: 220,
              overflow: "auto"
            }}
          >
            {entries.length === 0 ? (
              <div style={{ opacity: 0.7, fontSize: 12 }}>No entries yet.</div>
            ) : (
              entries.map((e) => (
                <div
                  key={e}
                  style={{
                    fontSize: 12,
                    padding: "6px 8px",
                    borderRadius: 10,
                    cursor: "pointer",
                    background: "rgba(255,255,255,0.06)",
                    marginBottom: 6
                  }}
                  onClick={() => {
                    // make it easy to click a search result and load it
                    const rel = e.replace(/^memory\//, "");
                    setFilePath(rel);
                  }}
                  title="Click to set file path"
                >
                  {e}
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Content</div>
          <textarea
            style={{
              width: "100%",
              minHeight: 220,
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(0,0,0,0.25)",
              color: "white",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
            }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
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
          maxHeight: 180,
          overflow: "auto",
          fontSize: 12
        }}
      >
        {last === null ? "// last response…" : JSON.stringify(last, null, 2)}
      </pre>
    </div>
  );
}

function btn() {
  return {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.10)",
    color: "white",
    cursor: "pointer",
    fontSize: 12
  } as const;
}
