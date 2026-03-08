// apps/web/app/components/StatusWidget.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

const BAKED_API_BASE = process.env.NEXT_PUBLIC_SQUIDLEY_API_BASE || "/api/zsq";

type ModelClass = {
  provider?: string | null;
  model?: string | null;
  model_class?: string | null;
  param_b?: number | null;
  class_source?: string | null;
};

type StatusResponse = {
  ok: boolean;
  build?: { sha: string | null; at: string | null };
  meta?: {
    name?: string;
    node?: string | null;
    local_first?: boolean;
    build?: { sha: string | null; at: string | null };
  };
  effective?: {
    strict_local_only: boolean;
    strict_local_only_source: "runtime" | "config";
    safety_zone: string;
    safety_zone_source: "runtime" | "config";
  };
  heartbeat?: { provider: string; model: string } & {
    model_class?: string | null;
    param_b?: number | null;
    class_source?: string | null;
  };
  recommended_default_tier?: {
    name?: string;
    provider: string;
    model: string;
    model_class?: string | null;
    param_b?: number | null;
    class_source?: string | null;
  } | null;
};

type ReceiptLatestResponse = {
  ok: boolean;
  receipt: null | {
    receipt_id?: string | null;
    created_at?: string | null;
    request?: { kind?: string | null } | null;
    decision?: {
      provider?: string | null;
      model?: string | null;
      tier?: string | null;
      active_model?: ModelClass | null;
    } | null;
  };
};

type Light = "green" | "yellow" | "red";
type ProviderKind = "local" | "cloud" | "unknown";

function fmtTimeShort(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace("T", " ").replace(/:\d\d(\.\d+)?([+-]\d\d:\d\d|Z)?$/, "");
}

function lightTitle(light: Light) {
  if (light === "green") return "Online";
  if (light === "yellow") return "Stale";
  return "Offline";
}

function fmtClass(m?: { model_class?: string | null; param_b?: number | null } | null) {
  const c = (m?.model_class ?? "").trim();
  const b = typeof m?.param_b === "number" ? m.param_b : null;
  if (!c && !b) return "";
  if (c && b) return `${c} · ${b}B`;
  return c || (b ? `${b}B` : "");
}

function abbrevModel(model?: string | null, max = 18) {
  const str = String(model ?? "").trim();
  if (!str) return "—";
  if (str.length <= max) return str;
  const head = Math.max(8, Math.floor(max * 0.62));
  const tail = Math.max(4, max - head - 1);
  return `${str.slice(0, head)}…${str.slice(-tail)}`;
}

function providerKindFrom(provider?: string | null): ProviderKind {
  const p = String(provider ?? "").trim().toLowerCase();
  if (!p) return "unknown";
  if (p === "ollama") return "local";
  return "cloud";
}

function providerTitle(kind: ProviderKind) {
  if (kind === "local") return "Local model";
  if (kind === "cloud") return "Cloud model";
  return "Provider unknown";
}

export default function StatusWidget() {
  const base = BAKED_API_BASE;

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [latestChat, setLatestChat] = useState<ReceiptLatestResponse | null>(null);

  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(`${base}/status`, { cache: "no-store" }),
        fetch(`${base}/receipts/latest?kind=chat`, { cache: "no-store" })
      ]);

      if (!sRes.ok) throw new Error(`HTTP ${sRes.status} (/status)`);
      if (!rRes.ok) throw new Error(`HTTP ${rRes.status} (/receipts/latest)`);

      const sJson = (await sRes.json()) as StatusResponse;
      const rJson = (await rRes.json()) as ReceiptLatestResponse;

      setStatus(sJson);
      setLatestChat(rJson);
      setError(null);
      if (sJson?.ok) setLastOkAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch status");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  const light: Light = useMemo(() => {
    if (error) return "red";
    if (!lastOkAt) return "yellow";
    const ageMs = Date.now() - lastOkAt;
    if (ageMs < 6000) return "green";
    if (ageMs < 20000) return "yellow";
    return "red";
  }, [error, lastOkAt]);

  const name = status?.meta?.name ?? "Squidley";
  const node = status?.meta?.node ?? "—";
  const build = status?.build ?? status?.meta?.build ?? { sha: null, at: null };

  const zone = status?.effective?.safety_zone ?? "—";
  const strict = status?.effective?.strict_local_only;
  const strictSource = status?.effective?.strict_local_only_source ?? null;
  const zoneSource = status?.effective?.safety_zone_source ?? null;

  const hb = status?.heartbeat ?? null;

  // ✅ CURRENT MODEL = last chat receipt decision
  const receiptDecision = latestChat?.receipt?.decision ?? null;
  const receiptModel = receiptDecision?.model ? String(receiptDecision.model) : "";
  const receiptProvider = receiptDecision?.provider ? String(receiptDecision.provider) : "";

  // fallback to status recommended default tier if we don't have a receipt yet
  const rec = status?.recommended_default_tier ?? null;
  const fallbackModel = rec?.model ? String(rec.model) : "";
  const fallbackProvider = rec?.provider ? String(rec.provider) : "";

  const currentModelFull = receiptModel || fallbackModel || "";
  const currentProvider = receiptModel ? receiptProvider : fallbackProvider;
  const currentKind = providerKindFrom(currentProvider);

  const currentShort = currentModelFull ? abbrevModel(currentModelFull, 18) : "—";
  const currentTitle =
    currentModelFull
      ? `Current chat model: ${currentModelFull}\nProvider: ${currentProvider}${
          receiptDecision?.active_model ? `\nClass: ${fmtClass(receiptDecision.active_model)}` : ""
        }`
      : "Current chat model: —";

  const hbShort = hb?.model ? abbrevModel(String(hb.model), 18) : "—";
  const hbKind = providerKindFrom(hb?.provider ?? null);
  const hbTitle = hb
    ? `Heartbeat model: ${hb.model}\nProvider: ${hb.provider}${fmtClass(hb) ? `\nClass: ${fmtClass(hb)}` : ""}`
    : "Heartbeat model: —";

  const buildSha = build?.sha ?? "—";
  const buildAt = fmtTimeShort(build?.at);

  return (
    <div
      style={{
        width: "100%",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        padding: "10px 12px",
        background: "rgba(0,0,0,0.22)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)"
      }}
      aria-label="Squidley status"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div
          title={lightTitle(light)}
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: light === "green" ? "#2bd576" : light === "yellow" ? "#f6c445" : "#ff4d4d",
            boxShadow:
              light === "green"
                ? "0 0 10px rgba(43,213,118,0.55)"
                : light === "yellow"
                ? "0 0 10px rgba(246,196,69,0.45)"
                : "0 0 10px rgba(255,77,77,0.45)"
          }}
        />
        <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>
          {name} <span style={{ opacity: 0.7, fontWeight: 600 }}>({node})</span>
        </div>

        <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.78, whiteSpace: "nowrap" }}>
          build <b>{buildSha}</b> · {buildAt}
        </div>
      </div>

      <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <MiniChip
          label="Current"
          value={currentShort}
          title={`${providerTitle(currentKind)}\n${currentTitle}`}
          kind={currentKind}
        />
        <MiniChip
          label="Heartbeat"
          value={hbShort}
          title={`${providerTitle(hbKind)}\n${hbTitle}`}
          kind={hbKind}
        />
        <MiniChip label="Zone" value={String(zone)} title={zoneSource ? `src: ${zoneSource}` : undefined} />
        <MiniChip
          label="Strict"
          value={typeof strict === "boolean" ? (strict ? "ON" : "OFF") : "—"}
          title={strictSource ? `src: ${strictSource}` : undefined}
        />
      </div>

      {error ? (
        <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,180,180,0.95)" }}>
          <b>Status:</b> {error} · API base <code style={{ opacity: 0.9 }}>{base}</code>
        </div>
      ) : null}
    </div>
  );
}

function MiniChip(props: { value: string; label?: string; title?: string; kind?: ProviderKind }) {
  const hasLabel = Boolean((props.label ?? "").trim());
  const kind: ProviderKind = props.kind ?? "unknown";

  const dotStyle =
    kind === "local"
      ? {
          background: "rgba(120, 255, 190, 0.95)",
          boxShadow: "0 0 12px rgba(120, 255, 190, 0.35)"
        }
      : kind === "cloud"
      ? {
          background: "rgba(170, 150, 255, 0.95)",
          boxShadow: "0 0 12px rgba(170, 150, 255, 0.35)"
        }
      : {
          background: "rgba(255,255,255,0.35)",
          boxShadow: "0 0 10px rgba(255,255,255,0.15)"
        };

  return (
    <div
      style={{
        display: "flex",
        gap: hasLabel ? 8 : 0,
        alignItems: "baseline",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.05)",
        maxWidth: "100%"
      }}
      title={props.title ?? undefined}
    >
      {/* provider dot */}
      <span
        aria-hidden
        style={{
          width: 9,
          height: 9,
          borderRadius: 999,
          display: "inline-block",
          transform: "translateY(1px)",
          ...dotStyle
        }}
      />

      {hasLabel ? <span style={{ fontSize: 11, opacity: 0.72, whiteSpace: "nowrap" }}>{props.label}</span> : null}

      <span style={{ fontSize: 12, fontWeight: 800, wordBreak: "break-word" }}>{props.value}</span>
    </div>
  );
}