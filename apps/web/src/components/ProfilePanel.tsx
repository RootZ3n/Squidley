"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/app/api/zensquid";

export default function ProfilePanel() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  async function load() {
    setErr("");
    try {
      const d = await apiGet("/agent/profile");
      setData(d);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>Squidley Profile</div>
        <button onClick={load}>Reload</button>
      </div>

      {err ? (
        <pre style={{ marginTop: 10, padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
          ERROR: {err}
        </pre>
      ) : null}

      {data ? (
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>SOUL.md</div>
            <pre style={{ whiteSpace: "pre-wrap", padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
              {data.soul || "// empty"}
            </pre>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>IDENTITY.md</div>
            <pre style={{ whiteSpace: "pre-wrap", padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
              {data.identity || "// empty"}
            </pre>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10, opacity: 0.8 }}>Loading…</div>
      )}
    </div>
  );
}
