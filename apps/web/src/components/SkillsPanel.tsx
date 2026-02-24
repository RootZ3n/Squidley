// apps/web/src/components/SkillsPanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/api/zensquid";

type SkillRow = { name: string };

type SkillsList = {
  count: number;
  skills: SkillRow[];
};

type SkillDetail = {
  ok: boolean;
  name: string;
  root: string;
  readme_rel: string | null;
  readme: string | null;
  files: string[];
  error?: string;
};

type SkillFile = {
  ok: boolean;
  name: string;
  path: string;
  abs: string;
  bytes: number;
  content: string;
  error?: string;
};

function stripFenceIfTruncatedMd(md: string) {
  // If a file ends mid-codefence, UI shouldn't look broken.
  const fenceCount = (md.match(/```/g) ?? []).length;
  if (fenceCount % 2 === 1) return md + "\n```\n";
  return md;
}

export default function SkillsPanel() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [file, setFile] = useState<SkillFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedFilePath = useMemo(() => {
    if (!detail?.ok) return null;
    // Prefer readme_rel (now README.md or skill.md), else first file.
    return detail.readme_rel ?? detail.files?.[0] ?? null;
  }, [detail]);

  async function loadSkills() {
    const d = await apiGet<SkillsList>("/skills");
    setSkills(d.skills ?? []);
    if (!selected && d.skills?.length) setSelected(d.skills[0].name);
  }

  async function loadDetail(name: string) {
    setBusy(true);
    setErr(null);
    setDetail(null);
    setFile(null);

    try {
      const d = await apiGet<SkillDetail>(`/skills/${encodeURIComponent(name)}`);
      setDetail(d);

      const fp = (d as any)?.readme_rel ?? (d as any)?.files?.[0] ?? null;
      if (d.ok && fp) {
        const f = await apiGet<SkillFile>(
          `/skills/${encodeURIComponent(name)}/file?path=${encodeURIComponent(fp)}`
        );
        setFile(f);
      } else if (!d.ok) {
        setErr(d.error ?? "Skill not found");
      } else {
        setErr("Skill has no files");
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadSkills().catch((e) => setErr(String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadDetail(selected).catch((e) => setErr(String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div style={wrap()}>
      <div style={left()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800 }}>Skills</div>
          <button onClick={() => loadSkills()} style={btnSmall()}>
            Reload
          </button>
        </div>

        <div style={{ height: 10 }} />

        <select value={selected} onChange={(e) => setSelected(e.target.value)} style={select()}>
          {skills.length === 0 ? <option>(no skills)</option> : null}
          {skills.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>

        <div style={{ height: 10 }} />

        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {busy ? "Loading…" : selected ? `Selected: ${selected}` : "Select a skill"}
        </div>
      </div>

      <div style={right()}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800 }}>Skill Detail</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {detail?.ok ? `${detail.root}` : ""}
          </div>
        </div>

        <div style={{ height: 10 }} />

        {err ? (
          <div style={errorBox()}>{err}</div>
        ) : (
          <>
            {!detail ? (
              <div style={{ opacity: 0.75 }}>Select a skill</div>
            ) : !detail.ok ? (
              <div style={errorBox()}>{detail.error ?? "Skill not found"}</div>
            ) : (
              <>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  readme: <b>{selectedFilePath ?? "(none)"}</b>
                </div>

                <div style={{ height: 10 }} />

                <pre style={pre()}>
                  {file?.ok
                    ? stripFenceIfTruncatedMd(file.content)
                    : detail.readme
                      ? stripFenceIfTruncatedMd(detail.readme)
                      : "(no content)"}
                </pre>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** styles (plain inline, keep it simple) */
function wrap(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    gap: 14,
    alignItems: "start"
  };
}
function left(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 12
  };
}
function right(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 12,
    minHeight: 260
  };
}
function select(): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.35)",
    color: "inherit"
  };
}
function pre(): React.CSSProperties {
  return {
    margin: 0,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.35)",
    maxHeight: 520,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    lineHeight: 1.45
  };
}
function btnSmall(): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.35)",
    color: "inherit",
    cursor: "pointer"
  };
}
function errorBox(): React.CSSProperties {
  return {
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,80,80,0.35)",
    background: "rgba(255,80,80,0.12)"
  };
}
