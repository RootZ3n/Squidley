"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ZENSQUID_API,
  apiGet,
  getSkills,
  getToolsList,
  runTool as runToolApi,
  getOnboarding,
  completeOnboarding,
  resetOnboarding,
  type SkillsList,
  type ChatResponse,
  type ToolListItem,
  type ToolRunResult,
  type ToolRunResponse,
  type OnboardingResponse,
  type OnboardingMission
} from "@/api/zensquid";

import StatusWidget from "./components/StatusWidget";
import ReceiptsPanel from "./components/ReceiptsPanel";
import BuildPanel from "./components/BuildPanel";
import DiagnosticsPanel from "./components/DiagnosticsPanel";

type Msg = { role: "assistant" | "user"; content: string };

const SQUIDLEY_SRC = "/squidley.png";

type ToolPlanStep = {
  step_id: string;
  title: string;
  tool_id: string;
  args: string[];
  on_fail?: "stop" | "continue";
};

type ToolPlanV1 = {
  schema: "squidley.toolplan.v1";
  plan_id: string;
  created_at: string;
  workspace: "squidley";
  goal: string;
  steps: ToolPlanStep[];
};

type StepRunState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; result: ToolRunResult }
  | { state: "error"; error: string; receipt_id: string | null };

type StepExecOutcome =
  | { kind: "done"; result: ToolRunResult }
  | { kind: "error"; error: string; receipt_id: string | null };

type StatusTier = {
  name: string;
  provider: string;
  model: string;
};

type StatusResponse = {
  ok: boolean;
  meta?: {
    local_first?: boolean;
  };
  recommended_default_tier?: {
    name?: string;
    provider: string;
    model: string;
  } | null;
  tiers?: StatusTier[];
};

type ImageIteration = {
  n: number;
  prompt: string;
  file: string;
  vl_description: string;
  qc_pass: boolean;
  qc_notes: string;
  elapsed_ms: number;
};

function uuidish() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function makePlanFromGoal(goalRaw: string): ToolPlanV1 {
  const goal = (goalRaw || "").trim() || "Run a safe local tool plan";
  const g = goal.toLowerCase();

  const steps: ToolPlanStep[] = [];

  steps.push({
    step_id: "git.status",
    title: "Check repo status",
    tool_id: "git.status",
    args: [],
    on_fail: "stop"
  });

  if (g.includes("build") || g.includes("web") || g.includes("playwright") || g.includes("test")) {
    steps.push({
      step_id: "web.build",
      title: "Build web UI (Next.js)",
      tool_id: "web.build",
      args: [],
      on_fail: "stop"
    });
    steps.push({
      step_id: "web.pw",
      title: "Run Playwright tests",
      tool_id: "web.pw",
      args: [],
      on_fail: "stop"
    });
  }

  if (g.includes("search") || g.includes("ripgrep") || g.includes("rg") || g.includes("find")) {
    let q = "TODO";
    const m = goal.match(/[:""']\s*([^""']+)\s*[""']?$/);
    if (m?.[1]) q = m[1].trim();
    steps.push({
      step_id: `rg.search.${steps.length + 1}`,
      title: `Search codebase (rg) for "${q}"`,
      tool_id: "rg.search",
      args: [q, "."],
      on_fail: "continue"
    });
  }

  if (steps.length === 1) {
    steps.push({
      step_id: "git.log",
      title: "Show recent commits",
      tool_id: "git.log",
      args: [],
      on_fail: "continue"
    });
  }

  return {
    schema: "squidley.toolplan.v1",
    plan_id: uuidish(),
    created_at: new Date().toISOString(),
    workspace: "squidley",
    goal,
    steps
  };
}

async function copyText(s: string) {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    return false;
  }
}

function formatStatusLine(s: any): string {
  const rec = s?.recommended_default_tier;
  const hb = s?.heartbeat;
  const eff = s?.effective;

  const active = rec?.model ? String(rec.model) : "—";
  const heartbeat = hb?.model ? String(hb.model) : "—";
  const zone = eff?.safety_zone ? String(eff.safety_zone) : "—";
  const strict =
    typeof eff?.strict_local_only === "boolean" ? (eff.strict_local_only ? "Local-only" : "Cloud-eligible") : "—";

  return `Active: ${active} • Heartbeat: ${heartbeat} • ${zone} • ${strict}`;
}

function isLocalCommand(input: string): "status" | "health" | null {
  const s = (input || "").trim().toLowerCase();
  if (s === "/status" || s === "status") return "status";
  if (s === "/health" || s === "health") return "health";
  return null;
}

function abbrev(s: string, max = 24) {
  const str = String(s ?? "").trim();
  if (!str) return "—";
  if (str.length <= max) return str;
  const head = Math.max(10, Math.floor(max * 0.62));
  const tail = Math.max(6, max - head - 1);
  return `${str.slice(0, head)}…${str.slice(-tail)}`;
}

export default function Page() {
  const [skills, setSkills] = useState<SkillsList | null>(null);

  const [selectedSkill, setSelectedSkill] = useState<string>("(none)");
  const selectedSkillForApi = useMemo(() => {
    if (!selectedSkill || selectedSkill === "(none)") return null;
    return selectedSkill;
  }, [selectedSkill]);

  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [buildPreview, setBuildPreview] = useState<string | null>(null);
  const [buildBriefBusy, setBuildBriefBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [pendingAgentName, setPendingAgentName] = useState<string | null>(null);
  const [pendingImagePrompt, setPendingImagePrompt] = useState<string | null>(null);

  // ── Image state ──────────────────────────────────────────────────────────
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<string | null>(null);
  const [imageIterations, setImageIterations] = useState<ImageIteration[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [comfyState, setComfyState] = useState<"unknown"|"stopped"|"starting"|"ready"|"stopping">("unknown");
  const [comfyStateMsg, setComfyStateMsg] = useState<string>("");
  const [imagePromptInput, setImagePromptInput] = useState("");

  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi — I'm Squidley. 🐙\nUI shortcuts:\n• /status\n• /health"
    }
  ]);

  const [footerStatus, setFooterStatus] = useState<string>("");
  const [tokenStats, setTokenStats] = useState<{
    active_model: string | null;
    active_tier: string | null;
    active_provider: string | null;
    tokens_in: number;
    tokens_out: number;
    cost: number;
    count: number;
  } | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  const [tab, setTab] = useState<"chat" | "tools" | "learn" | "image" | "receipts" | "build" | "diagnostics">("chat");
  const [goal, setGoal] = useState<string>("Build web + run Playwright tests");
  const [plan, setPlan] = useState<ToolPlanV1>(() => makePlanFromGoal("Build web + run Playwright tests"));

  const [tools, setTools] = useState<ToolListItem[]>([]);
  const [adminToken, setAdminToken] = useState<string>(() => typeof window !== "undefined" ? sessionStorage.getItem("squidley_admin_token") ?? "" : "");
  const [stepState, setStepState] = useState<Record<string, StepRunState>>({});
  const [runAllBusy, setRunAllBusy] = useState(false);

  const toolLogRef = useRef<HTMLDivElement | null>(null);

  const [onboarding, setOnboarding] = useState<OnboardingResponse | null>(null);
  const [learnBusy, setLearnBusy] = useState(false);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [brain, setBrain] = useState<string>("auto");

  function ensureStepStateInitialized(p: ToolPlanV1) {
    setStepState((prev) => {
      const next = { ...prev };
      for (const s of p.steps) {
        if (!next[s.step_id]) next[s.step_id] = { state: "idle" };
      }
      return next;
    });
  }

  async function refreshSkills() {
    const s = await getSkills();
    setSkills(s);
  }

  async function refreshTools() {
    try {
      const t = await getToolsList();
      setTools(Array.isArray(t?.tools) ? t.tools : []);
    } catch {
      setTools([]);
    }
  }

  async function fetchTokenStats() {
    try {
      const res = await fetch(`${ZENSQUID_API}/skills/token-monitor/today`, {
        headers: { "x-zensquid-admin-token": "8675309abc123easy" }
      });
      const json = await res.json();
      if (json?.ok) {
        setTokenStats({
          active_model: json.active_model,
          active_tier: json.active_tier,
          active_provider: json.active_provider,
          tokens_in: json.totals?.tokens_in ?? 0,
          tokens_out: json.totals?.tokens_out ?? 0,
          cost: json.totals?.cost ?? 0,
          count: json.count ?? 0,
        });
      }
    } catch {}
  }

  async function refreshFooter() {
    try {
      const h = await apiGet("/health");
      const r = await apiGet<{ count: number }>("/receipts?limit=1");
      setFooterStatus(
        `API: ${ZENSQUID_API} • Health: ${h?.ok ? "OK" : "?"} • Receipts: ${
          typeof r?.count === "number" ? r.count : "?"
        }`
      );
    } catch {
      setFooterStatus(`API: ${ZENSQUID_API}`);
    }
  }

  async function refreshOnboarding() {
    setLearnBusy(true);
    try {
      const o = await getOnboarding();
      setOnboarding(o);
      if (o && (o as any).ok && !(o as any).onboarding?.completed) {
        const first = (o as any).content?.starter_missions?.[0]?.id;
        if (!selectedMissionId && first) setSelectedMissionId(first);
      }
    } finally {
      setLearnBusy(false);
    }
  }

  async function refreshStatus() {
    try {
      const s = await apiGet<StatusResponse>("/status");
      setStatus(s);
    } catch {
      // ignore
    }
  }

  const tiers: StatusTier[] = useMemo(() => {
    const t = status?.tiers;
    return Array.isArray(t) ? t : [];
  }, [status?.tiers]);

  const recommended = status?.recommended_default_tier ?? null;

  const brainOptions = useMemo(() => {
    const opts: { value: string; label: string; title?: string }[] = [];
    const recLabel = recommended?.model ? `${abbrev(recommended.model, 26)} (${recommended.provider})` : "—";
    opts.push({
      value: "auto",
      label: `Auto (recommended: ${recLabel})`,
      title: "Use router recommended tier (config-driven)."
    });

    for (const t of tiers) {
      opts.push({
        value: t.name,
        label: `${t.name} — ${abbrev(t.model, 28)} (${t.provider})`,
        title: `Force tier "${t.name}"\nprovider: ${t.provider}\nmodel: ${t.model}`
      });
    }

    return opts;
  }, [tiers, recommended?.model, recommended?.provider]);

  function tierByName(name: string): StatusTier | null {
    if (!name) return null;
    const t = tiers.find((x) => x.name === name);
    return t ?? null;
  }

  // ── Image generation ──────────────────────────────────────────────────────
  const comfyLockRef = useRef(false);

  async function ensureComfyUI(): Promise<boolean> {
    if (comfyLockRef.current) return false;
    comfyLockRef.current = true;
    try {
      const statusRes = await fetch(`${ZENSQUID_API}/tools/run`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zensquid-admin-token": "8675309abc123easy" },
        body: JSON.stringify({ workspace: "squidley", tool_id: "comfyui.status", args: {} })
      });
      const statusJson = await statusRes.json();
      if (statusJson?.ok) { setComfyState("ready"); setComfyStateMsg(""); return true; }
      setComfyState("starting");
      setComfyStateMsg("Starting ComfyUI…");
      await fetch(`${ZENSQUID_API}/tools/run`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zensquid-admin-token": "8675309abc123easy" },
        body: JSON.stringify({ workspace: "squidley", tool_id: "comfyui.start", args: {} })
      });
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        setComfyStateMsg(`Starting ComfyUI… ${i + 1}s`);
        const r = await fetch(`${ZENSQUID_API}/tools/run`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-zensquid-admin-token": "8675309abc123easy" },
          body: JSON.stringify({ workspace: "squidley", tool_id: "comfyui.status", args: {} })
        });
        const rj = await r.json();
        if (rj?.ok) { setComfyState("ready"); setComfyStateMsg(""); return true; }
      }
      setComfyState("stopped");
      setComfyStateMsg("ComfyUI failed to start");
      return false;
    } finally {
      comfyLockRef.current = false;
    }
  }

  async function stopComfyUI() {
    if (comfyLockRef.current || comfyState === "stopped" || imageBusy) return;
    comfyLockRef.current = true;
    try {
      setComfyState("stopping");
      await fetch(`${ZENSQUID_API}/tools/run`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zensquid-admin-token": "8675309abc123easy" },
        body: JSON.stringify({ workspace: "squidley", tool_id: "comfyui.stop", args: {} })
      });
      setComfyState("stopped");
    } finally {
      comfyLockRef.current = false;
    }
  }

  async function handleImageGenerate(overridePrompt?: string) {
    const prompt = (overridePrompt ?? imagePromptInput).trim() || pendingImagePrompt || "";
    if (!prompt || imageBusy) return;
    if (comfyState !== "ready") {
      const ok = await ensureComfyUI();
      if (!ok) return;
    }
    setImageBusy(true);
    setImagePromptInput("");
    setTab("image");
    try {
      const res = await fetch(`/api/zsq/image/generate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zensquid-admin-token": adminToken },
        body: JSON.stringify({
          prompt,
          intent: prompt,
          max_iterations: 3,
          output: "squidley_ui"
        }),
      });
      const json = await res.json().catch(() => ({})) as any;
      if (json?.ok) {
        const filename = json.file?.split("/").pop();
        setImageUrl(json.image_url ?? (filename ? `/image/output/${filename}` : null));
        setImageFile(json.file ?? null);
        setImageIterations(json.iterations ?? []);
        setPendingImagePrompt(null);
      } else {
        setMessages(m => [...m, { role: "assistant", content: `🎨 Generation failed: ${json?.error ?? "unknown"}` }]);
        setTab("chat");
      }
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", content: `🎨 Error: ${String(e?.message ?? e)}` }]);
      setTab("chat");
    } finally {
      setImageBusy(false);
    }
  }

  async function handleSendToBuild() {
    if (messages.length < 2 || buildBriefBusy) return;
    setBuildBriefBusy(true);
    try {
      const history = messages.map(m => `${m.role === "user" ? "Jeff" : "Squidley"}: ${m.content}`).join("\n\n");
      const res = await fetch(`${ZENSQUID_API}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zensquid-admin-token": adminToken },
        body: JSON.stringify({
          input: `Summarize this conversation into a concise build brief for a developer. Include: what was discussed, what needs to be built, key requirements and constraints. Max 150 words. Plain text, no headers.\n\n${history}`,
          mode: "force_tier",
          force_tier: "claude-sonnet",
          reason: "build handoff summary",
          session_id: "build-handoff-" + Date.now()
        })
      });
      const json = await res.json();
      setBuildPreview(json.output ?? "Could not generate brief.");
    } catch {
      setBuildPreview("Error generating brief.");
    } finally {
      setBuildBriefBusy(false);
    }
  }

  function confirmSendToBuild() {
    if (!buildPreview) return;
    // BuildPanel will pick this up via localStorage-free approach: tab switch + URL param
    sessionStorage.setItem("squidley_build_brief", buildPreview);
    setBuildPreview(null);
    setTab("build");
  }

  async function sendChat() {
    const input = chatInput.trim();
    if (!input || chatBusy) return;

    setChatBusy(true);
    setChatInput("");
    setMessages((m) => [...m, { role: "user", content: input }]);

    try {
      const cmd = isLocalCommand(input);
      if (cmd === "health") {
        const h = await apiGet("/health");
        const out = `Health: ${h?.ok ? "OK ✅" : "??"} • API: ${ZENSQUID_API}`;
        setMessages((m) => [...m, { role: "assistant", content: out }]);
        await refreshFooter();
        return;
      }

      if (cmd === "status") {
        const s = await apiGet("/status");
        const line = formatStatusLine(s);
        const buildSha = s?.build?.sha ?? s?.meta?.build?.sha ?? "—";
        const buildAt = s?.build?.at ?? s?.meta?.build?.at ?? "—";
        const out = `Squidley Status\n${line}\nBuild: ${buildSha} • ${buildAt}`;
        setMessages((m) => [...m, { role: "assistant", content: out }]);
        await refreshFooter();
        await refreshStatus();
        return;
      }

      const forced = brain !== "auto" ? brain : null;
      const forcedTier = forced ? tierByName(forced) : null;
      const mode = forced ? "force_tier" : "auto";
      const force_tier = forced ? forced : undefined;
      const isNonLocal = forcedTier ? forcedTier.provider !== "ollama" : false;
      const reason = isNonLocal ? "User selected tier in UI" : undefined;

      const payload: any = {
        input,
        selected_skill: selectedSkillForApi,
        mode,
        force_tier,
        reason,
        session_id: sessionId ?? undefined,
        pending_plan: pendingPlanId ?? undefined,
        pending_agent: pendingAgentName ?? undefined
      };

      // AFTER
      const res = await fetch(`${ZENSQUID_API}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-zensquid-admin-token": adminToken },
        body: JSON.stringify(payload)
      });

      const json = (await res.json().catch(() => ({}))) as ChatResponse & any;
      const isError = !res.ok || json?.statusCode >= 400;
      const out = isError
        ? `⚠️ ${json?.message ?? json?.error ?? `HTTP ${res.status}`}${json?.receipt_id ? `\nReceipt: ${json.receipt_id}` : ""}${json?.tier ? `\nTier: ${json.tier} (${json.provider})` : ""}`
        : json?.output ?? json?.content ?? JSON.stringify(json, null, 2);





      setMessages((m) => [...m, { role: "assistant", content: String(out ?? "") }]);
      if (json?.session_id) setSessionId(json.session_id);
      if (json?.pending_plan !== undefined) setPendingPlanId(json.pending_plan);
      if (json?.pending_agent !== undefined) setPendingAgentName(json.pending_agent);
      if (json?.pending_image !== undefined) setPendingImagePrompt(json.pending_image);

      // If image was generated directly, switch to image tab
      if (json?.image_ok && json?.image_url) {
        const filename = json.image_file?.split("/").pop();
        setImageUrl(json.image_url ?? (filename ? `/image/output/${filename}` : null));
        setImageFile(json.image_file ?? null);
        setImageIterations(json.image_iterations ?? []);
        setPendingImagePrompt(null);
        setTab("image");
      }

      // If image pending, show hint in chat
      if (json?.pending_image) {
        setMessages(m => [...m, {
          role: "assistant",
          content: `🎨 Ready to generate — say "yes" to start, or switch to the Image tab to type a prompt directly.`
        }]);
      }

      await refreshFooter();
      fetchTokenStats().catch(console.error);
      await refreshStatus();
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${String(e?.message ?? e)}` }]);
    } finally {
      setChatBusy(false);
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }), 50);
    }
  }

  function generatePlan() {
    const p = makePlanFromGoal(goal);
    setPlan(p);
    ensureStepStateInitialized(p);
    setTimeout(() => toolLogRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 10);
  }

  async function runStep(s: ToolPlanStep): Promise<StepExecOutcome> {
    setStepState((prev) => ({ ...prev, [s.step_id]: { state: "running" } }));

    if (!adminToken.trim()) {
      const errMsg = "Admin token required to run tools.";
      setStepState((prev) => ({ ...prev, [s.step_id]: { state: "error", error: errMsg, receipt_id: null } }));
      return { kind: "error", error: errMsg, receipt_id: null };
    }

    const resp: ToolRunResponse = await runToolApi(
      { workspace: plan.workspace, tool_id: s.tool_id, args: s.args },
      adminToken.trim()
    );

    if ((resp as any)?.ok === true && (resp as any)?.result) {
      const r = (resp as any).result as ToolRunResult;
      setStepState((prev) => ({ ...prev, [s.step_id]: { state: "done", result: r } }));
      await refreshFooter();
      setTimeout(() => toolLogRef.current?.scrollTo({ top: toolLogRef.current.scrollHeight, behavior: "smooth" }), 50);
      return { kind: "done", result: r };
    }

    const e = resp as any;
    const errMsg = String(e?.error ?? "Tool failed");
    const rid = (e?.receipt_id ?? null) as string | null;
    setStepState((prev) => ({ ...prev, [s.step_id]: { state: "error", error: errMsg, receipt_id: rid } }));
    await refreshFooter();
    setTimeout(() => toolLogRef.current?.scrollTo({ top: toolLogRef.current.scrollHeight, behavior: "smooth" }), 50);
    return { kind: "error", error: errMsg, receipt_id: rid };
  }

  async function runAll() {
    if (runAllBusy) return;
    setRunAllBusy(true);

    try {
      for (const s of plan.steps) {
        const outcome = await runStep(s);

        const shouldStop =
          (outcome.kind === "error" || (outcome.kind === "done" && outcome.result.ok === false)) &&
          s.on_fail !== "continue";

        if (shouldStop) break;
      }
    } finally {
      setRunAllBusy(false);
    }
  }

  const missionList: OnboardingMission[] =
    onboarding && (onboarding as any).ok ? ((onboarding as any).content?.starter_missions ?? []) : [];

  const selectedMission: OnboardingMission | null =
    selectedMissionId ? missionList.find((m) => m.id === selectedMissionId) ?? null : null;

  useEffect(() => {
    refreshSkills().catch(console.error);
    refreshTools().catch(console.error);
    refreshFooter().catch(console.error);
    fetchTokenStats().catch(console.error);
    refreshOnboarding().catch(console.error);
    refreshStatus().catch(console.error);
    ensureStepStateInitialized(plan);

    const t = setInterval(() => {
  if (!document.hidden) refreshStatus().catch(() => {});
}, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }), 50);
  }, [messages.length]);

  return (
    <div style={root()}>
      <div style={bgLayer()} aria-hidden />
      <div style={vignette()} aria-hidden />
      <div style={starsLayer()} />
      <div style={grain()} />

      <div style={contentWrap()}>
        <div style={squidBlock()}>
          <div style={squidAura()} aria-hidden />
          <img src={SQUIDLEY_SRC} alt="Squidley" style={squidImg()} draggable={false} />
        </div>

        <div style={glassMini()}>
          <StatusWidget />
        </div>

        <div style={glass()}>
          <div style={headerRow()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={statusDot()} />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={title()} data-testid="app-title">
                    Squidley
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={pill()} title="Select which tier to use for chat (cloud or local).">
                      Brain
                    </div>
                    <select
                      value={brain}
                      onChange={(e) => setBrain(e.target.value)}
                      style={select()}
                      title="Auto uses router recommendation. Selecting a tier forces that tier for chat."
                    >
                      {brainOptions.map((o) => (
                        <option key={o.value} value={o.value} title={o.title}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                </div>
                <div style={subtitle()}>Twilight • Calm</div>
              </div>
            </div>


          </div>
          <div style={{ ...tabsWrap(), marginTop: 8 }}>
            <button data-testid="tab-chat" style={tabBtn(tab === "chat", "100,200,255")} onClick={() => setTab("chat")}>Chat</button>
            <button data-testid="tab-tools" style={tabBtn(tab === "tools", "160,100,255")} onClick={() => setTab("tools")}>Tool Loop</button>
            <button data-testid="tab-learn" style={tabBtn(tab === "learn", "80,220,160")} onClick={() => { setTab("learn"); refreshOnboarding().catch(console.error); }}>Learn</button>
            <button data-testid="tab-image" style={tabBtn(tab === "image", "255,180,60")} onClick={() => setTab("image")}>{pendingImagePrompt ? "🎨 Image •" : "🎨 Image"}</button>
            <button data-testid="tab-receipts" style={tabBtn(tab === "receipts", "255,100,140")} onClick={() => setTab("receipts")}>🧾 Receipts</button>
            <button data-testid="tab-build" style={tabBtn(tab === "build", "255,140,40")} onClick={() => setTab("build")}>🔨 Build</button>
            <button data-testid="tab-diagnostics" style={tabBtn(tab === "diagnostics", "100,220,160")} onClick={() => setTab("diagnostics")}>🩺 Diagnostics</button>
          </div>

          <div style={{ height: 10 }} />

          {/* ── Chat tab ── */}
          {tab === "chat" && (
            <div style={chatShell()} data-testid="chat-panel">
              <div style={{ fontWeight: 800, opacity: 0.9, marginBottom: 8 }}>Squidley</div>

              <div ref={listRef} style={messagesBox()}>
                {messages.map((m, idx) => (
                  <div key={idx} style={m.role === "user" ? rowRight() : rowLeft()}>
                    <div style={m.role === "user" ? bubbleUser() : bubbleAssistant()}>{m.content}</div>
                  </div>
                ))}
              </div>

              <div style={{ height: 10 }} />

              {pendingImagePrompt && (
                <div style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,180,100,0.25)",
                  background: "rgba(255,180,100,0.08)",
                  fontSize: 12,
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap"
                }}>
                  <span style={{ opacity: 0.85 }}>🎨 Image pending: <i>"{pendingImagePrompt.slice(0, 60)}{pendingImagePrompt.length > 60 ? "…" : ""}"</i></span>
                  <button style={btnTiny()} onClick={() => handleImageGenerate(pendingImagePrompt)}>
                    Generate now
                  </button>
                  <button style={btnTiny()} onClick={() => setPendingImagePrompt(null)}>
                    Dismiss
                  </button>
                </div>
              )}

              <div style={composerRow()}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={`Talk to Squidley… (try /status or "draw me a squid")`}
                  style={composerInput()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <button onClick={sendChat} style={btnPrimary()} disabled={chatBusy}>
                  {chatBusy ? "Sending…" : "Send"}
                </button>
                
                <button
                  onClick={() =>
                    setMessages([
                      {
                        role: "assistant",
                        content:
                          "Hi — I'm Squidley. 🐙\nUI shortcuts:\n• /status\n• /health"
                      }
                    ])
                  }
                  style={btnGhost()}
                >
                  Clear
                </button>
                {messages.length > 1 && (
                  <button
                    onClick={handleSendToBuild}
                    disabled={buildBriefBusy}
                    style={{
                      ...btnGhost(),
                      borderColor: "rgba(255,140,80,0.35)",
                      color: buildBriefBusy ? "rgba(255,255,255,0.4)" : "rgba(255,180,120,0.9)",
                    }}
                    title="Summarize conversation and send to Build tab"
                  >
                    {buildBriefBusy ? "Preparing…" : "→ Build"}
                  </button>
                )}
              </div>

              <div style={{ height: 10 }} />
              {tokenStats ? (
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12, opacity: 0.85, paddingTop: 2 }}>
                  <span style={{ color: tokenStats.active_provider === "ollama" ? "rgba(120,255,190,0.9)" : tokenStats.active_provider === "anthropic" ? "rgba(180,140,255,0.9)" : "rgba(255,200,100,0.9)", fontWeight: 700 }}>
                    {tokenStats.active_model ?? "—"}
                  </span>
                  <span style={{ opacity: 0.5 }}>•</span>
                  <span style={{ opacity: 0.7 }}>Today: {tokenStats.count} calls</span>
                  <span style={{ opacity: 0.5 }}>•</span>
                  <span style={{ opacity: 0.7 }}>↑{(tokenStats.tokens_in / 1000).toFixed(1)}k ↓{(tokenStats.tokens_out / 1000).toFixed(1)}k</span>
                  {tokenStats.cost > 0 && <>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span style={{ color: tokenStats.cost > 1.0 ? "rgba(255,160,100,0.9)" : "rgba(120,220,150,0.9)", fontWeight: 700 }}>
                      ${tokenStats.cost.toFixed(4)}
                    </span>
                  </>}
                  {footerStatus && <>
                    <span style={{ opacity: 0.5 }}>•</span>
                    <span style={{ opacity: 0.6 }}>{footerStatus}</span>
                  </>}
                </div>
              ) : (
                <div style={footer()}>{footerStatus || `API: ${ZENSQUID_API}`}</div>
              )}
            </div>
          )}

                    {/* ── Send to Build preview modal ── */}
          {buildPreview && (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(4px)", display: "flex", alignItems: "center",
              justifyContent: "center", zIndex: 999, padding: 16
            }}>
              <div style={{
                background: "rgba(12,16,28,0.97)", border: "1px solid rgba(255,140,80,0.25)",
                borderRadius: 18, maxWidth: 560, width: "100%", overflow: "hidden",
                boxShadow: "0 24px 60px rgba(0,0,0,0.6)"
              }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontWeight: 900, fontSize: 15, color: "rgba(255,180,120,0.95)" }}>→ Send to Build</div>
                  <div style={{ fontSize: 12, opacity: 0.55, marginTop: 3 }}>This brief will be pre-loaded in the Build tab</div>
                </div>
                <div style={{ padding: "16px 20px", maxHeight: 300, overflowY: "auto" }}>
                  <pre style={{
                    margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    fontSize: 13, lineHeight: 1.6, color: "rgba(220,230,255,0.88)",
                    fontFamily: "inherit"
                  }}>{buildPreview}</pre>
                </div>
                <div style={{
                  padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.07)",
                  display: "flex", gap: 10, justifyContent: "flex-end"
                }}>
                  <button onClick={() => setBuildPreview(null)} style={btnGhost()}>Cancel</button>
                  <button onClick={confirmSendToBuild} style={{
                    ...btnPrimary(),
                    background: "rgba(255,140,80,0.25)",
                    borderColor: "rgba(255,140,80,0.4)",
                    color: "rgba(255,200,150,0.95)"
                  }}>Confirm → Build</button>
                </div>
              </div>
            </div>
          )}
          {/* ── Image tab ── */}
          {tab === "image" && (
            <div style={chatShell()} data-testid="image-panel">
              <div style={{ fontWeight: 800, opacity: 0.9, marginBottom: 4 }}>Image Generation</div>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 12 }}>
                ComfyUI · SDXL · RTX 4070 · 3-iteration VL feedback loop
              </div>

              {/* Preview area */}
              <div style={{
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.30)",
                minHeight: 300,
                maxHeight: "55vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                marginBottom: 12,
                position: "relative"
              }}>
                {imageBusy && (
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,0.55)",
                    borderRadius: 16,
                    gap: 10,
                    zIndex: 2
                  }}>
                    <div style={{ fontSize: 32 }}>🎨</div>
                    <div style={{ fontSize: 13, opacity: 0.9 }}>Generating… (up to 3 iterations)</div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>VL describing · QC scoring · refining prompt</div>
                  </div>
                )}
                {imageUrl ? (
                  <img
                    src={`${ZENSQUID_API}${imageUrl}`}
                    alt="Generated"
                    style={{ maxWidth: "100%", maxHeight: "55vh", borderRadius: 14, display: "block" }}
                  />
                ) : !imageBusy ? (
                  <div style={{ opacity: 0.3, fontSize: 13, textAlign: "center", padding: 20 }}>
                    No image yet<br />
                    <span style={{ fontSize: 11 }}>Ask Squidley to draw something in chat, or type a prompt below</span>
                  </div>
                ) : null}
              </div>

              {/* ComfyUI state banner */}
              {(comfyState === "starting" || comfyState === "stopping") && (
                <div style={{ borderRadius: 10, padding: "8px 14px", marginBottom: 10,
                  background: "rgba(255,180,80,0.12)", border: "1px solid rgba(255,180,80,0.25)",
                  fontSize: 13, color: "rgba(255,200,120,0.9)" }}>
                  ⏳ {comfyStateMsg}
                </div>
              )}
              {comfyState === "stopped" && comfyStateMsg && (
                <div style={{ borderRadius: 10, padding: "8px 14px", marginBottom: 10,
                  background: "rgba(255,80,80,0.10)", border: "1px solid rgba(255,80,80,0.20)",
                  fontSize: 13, color: "rgba(255,140,140,0.9)" }}>
                  ⚠️ {comfyStateMsg}
                </div>
              )}
              {/* Iteration gallery */}
              {imageIterations.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.6, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                    {imageIterations.length} iteration{imageIterations.length > 1 ? "s" : ""} — {imageIterations[imageIterations.length - 1]?.qc_pass ? "✅ QC passed" : "⚠️ QC partial"}
                  </div>
                  <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
                    {imageIterations.map((it) => (
                      <div key={it.n} style={{ flexShrink: 0, borderRadius: 10, overflow: "hidden",
                        border: it.qc_pass ? "2px solid rgba(80,200,120,0.4)" : "2px solid rgba(255,180,80,0.3)",
                        background: "rgba(0,0,0,0.3)", width: 160, cursor: "pointer" }}
                        onClick={() => setImageUrl(`/image/output/${it.file}`)}>
                        <img src={`${ZENSQUID_API}/image/output/${it.file}`} alt={`Iter ${it.n}`}
                          style={{ width: "100%", display: "block" }} />
                        <div style={{ padding: "6px 8px", fontSize: 11 }}>
                          <div style={{ fontWeight: 800 }}>Iter {it.n} {it.qc_pass ? "✅" : "⚠️"}</div>
                          <div style={{ opacity: 0.6 }}>{Math.round(it.elapsed_ms / 1000)}s</div>
                          {it.qc_notes && <div style={{ opacity: 0.65, fontStyle: "italic", marginTop: 2 }}>{it.qc_notes.slice(0, 60)}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Prompt / feedback input */}
              <div style={composerRow()}>
                <input
                  value={imagePromptInput}
                  onChange={(e) => setImagePromptInput(e.target.value)}
                  placeholder={
                    pendingImagePrompt
                      ? `Pending: "${pendingImagePrompt.slice(0, 50)}${pendingImagePrompt.length > 50 ? "…" : ""}" — press Generate or type new prompt`
                      : imageUrl
                      ? "Describe changes or a new image…"
                      : "Describe what to generate…"
                  }
                  style={composerInput()}
                  disabled={imageBusy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleImageGenerate();
                    }
                  }}
                />
                <button
                  onClick={() => handleImageGenerate()}
                  style={btnPrimary()}
                  disabled={imageBusy || (!imagePromptInput.trim() && !pendingImagePrompt)}
                >
                  {imageBusy ? "Generating…" : imageUrl ? "Regenerate" : "Generate"}
                </button>
                {imageUrl && !imageBusy && (
                  <a
                    href={`${ZENSQUID_API}${imageUrl}`}
                    download
                    style={{ ...btnGhost(), textDecoration: "none", display: "inline-block" }}
                  >
                    Save
                  </a>
                )}
              </div>

              <div style={{ height: 10 }} />
              <div style={footer()}>{footerStatus || `API: ${ZENSQUID_API}`}</div>
            </div>
          )}
          
          {tab === "receipts" && <ReceiptsPanel />}
          {tab === "build" && <BuildPanel adminToken={adminToken} />}
          {tab === "diagnostics" && <DiagnosticsPanel />}
          
          {/* ── Tool Loop tab ── */}
          {tab === "tools" && (
            <div style={toolShell()} data-testid="tools-panel">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 900, opacity: 0.92 }}>Tool Plan</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Allowlisted tools only • No shell • Receipts in <code style={codeChip()}>~/.squidley/receipts</code>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button style={btnGhost()} onClick={generatePlan}>
                    Generate Plan
                  </button>
                  <button style={btnPrimary()} onClick={runAll} disabled={runAllBusy || plan.steps.length === 0}>
                    {runAllBusy ? "Running…" : "Run All"}
                  </button>
                </div>
              </div>

              <div style={{ height: 10 }} />

              <div style={goalRow()}>
                <div style={label()}>Goal</div>
                <input value={goal} onChange={(e) => setGoal(e.target.value)} style={goalInput()} />
              </div>

              <div style={{ height: 10 }} />

              <div style={goalRow()}>
                <div style={label()}>Admin token</div>
                <input
                  value={adminToken}
                  onChange={(e) => { setAdminToken(e.target.value); sessionStorage.setItem("squidley_admin_token", e.target.value); }}
                  placeholder="x-zensquid-admin-token (memory only)"
                  style={goalInput()}
                  type="password"
                  autoComplete="off"
                />
                <button style={btnGhost()} onClick={() => setAdminToken("")}>
                  Clear
                </button>
              </div>

              <div style={{ height: 10 }} />

              <div style={planMeta()}>
                <div style={{ opacity: 0.85 }}>
                  <span style={{ opacity: 0.7 }}>plan_id:</span> <code style={codeChip()}>{plan.plan_id}</code>
                </div>
                <div style={{ opacity: 0.85 }}>
                  <span style={{ opacity: 0.7 }}>workspace:</span> <code style={codeChip()}>{plan.workspace}</code>
                </div>
                <div style={{ opacity: 0.85 }}>
                  <span style={{ opacity: 0.7 }}>tools:</span> <code style={codeChip()}>{tools.length}</code>{" "}
                  <button style={btnTiny()} onClick={refreshTools} title="Refresh tools list">
                    Refresh
                  </button>
                </div>
              </div>

              <div style={{ height: 10 }} />

              <div ref={toolLogRef} style={toolLog()}>
                {plan.steps.map((s) => {
                  const st = stepState[s.step_id] ?? { state: "idle" as const };
                  const running = st.state === "running";
                  const done = st.state === "done";
                  const err = st.state === "error";

                  const badge =
                    running
                      ? badgeInfo()
                      : done && st.result.ok
                      ? badgeOk()
                      : done && !st.result.ok
                      ? badgeWarn()
                      : err
                      ? badgeBad()
                      : badgeIdle();

                  return (
                    <div key={s.step_id} style={stepCard()}>
                      <div style={stepHeader()}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <div style={badge} />
                          <div style={{ fontWeight: 900, opacity: 0.92 }}>{s.title}</div>
                          <div style={miniPill()}>
                            <code style={codeChip()}>{s.tool_id}</code>
                          </div>
                          {s.args?.length ? (
                            <div style={miniPill()}>
                              <span style={{ opacity: 0.75 }}>args:</span>{" "}
                              <code style={codeChip()}>{JSON.stringify(s.args)}</code>
                            </div>
                          ) : null}
                        </div>

                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <button style={btnPrimary()} disabled={running || runAllBusy} onClick={() => runStep(s)}>
                            {running ? "Running…" : "Run"}
                          </button>
                        </div>
                      </div>

                      {(done || err) && <div style={{ height: 10 }} />}

                      {done && (
                        <div style={resultBox()}>
                          <div style={kvRow()}>
                            <div style={kvKey()}>ok</div>
                            <div style={kvVal()}>{String(st.result.ok)}</div>
                            <div style={kvKey()}>duration</div>
                            <div style={kvVal()}>{st.result.duration_ms}ms</div>
                            <div style={kvKey()}>receipt</div>
                            <div style={kvVal()}>
                              <code style={codeChip()}>{st.result.receipt_id}</code>{" "}
                              <button
                                style={btnTiny()}
                                onClick={async () => {
                                  const ok = await copyText(st.result.receipt_id);
                                  alert(ok ? "Copied receipt_id" : "Copy failed");
                                }}
                              >
                                Copy
                              </button>
                            </div>
                          </div>

                          {(st.result.stdout || st.result.stderr) && <div style={{ height: 10 }} />}

                          {st.result.stdout ? (
                            <div style={{ marginBottom: 10 }}>
                              <div style={ioLabel()}>stdout</div>
                              <pre style={ioBox()}>{st.result.stdout}</pre>
                            </div>
                          ) : null}

                          {st.result.stderr ? (
                            <div>
                              <div style={ioLabel()}>stderr</div>
                              <pre style={ioBox()}>{st.result.stderr}</pre>
                            </div>
                          ) : null}
                        </div>
                      )}

                      {err && (
                        <div style={resultBox()}>
                          <div style={kvRow()}>
                            <div style={kvKey()}>error</div>
                            <div style={kvVal()}>{st.error}</div>
                            <div style={kvKey()}>receipt</div>
                            <div style={kvVal()}>
                              <code style={codeChip()}>{st.receipt_id ?? "null"}</code>{" "}
                              {st.receipt_id ? (
                                <button
                                  style={btnTiny()}
                                  onClick={async () => {
                                    const ok = await copyText(st.receipt_id || "");
                                    alert(ok ? "Copied receipt_id" : "Copy failed");
                                  }}
                                >
                                  Copy
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ height: 10 }} />
              <div style={footer()}>{footerStatus || `API: ${ZENSQUID_API}`}</div>
            </div>
          )}

          {/* ── Learn tab ── */}
          {tab === "learn" && (
            <div style={toolShell()} data-testid="learn-panel">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900, opacity: 0.92 }}>Learn</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Your "how to use Squidley" page — backed by the API (so it can't drift quietly).
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button style={btnTiny()} onClick={refreshOnboarding} disabled={learnBusy}>
                    {learnBusy ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>

              <div style={{ height: 10 }} />

              {onboarding && (onboarding as any).ok ? (
                <>
                  <div style={resultBox()}>
                    <div style={kvRow()}>
                      <div style={kvKey()}>completed</div>
                      <div style={kvVal()} data-testid="onboarding-completed">
                        {String((onboarding as any).onboarding?.completed)}
                      </div>
                      <div style={kvKey()}>completed_at</div>
                      <div style={kvVal()}>
                        <code style={codeChip()}>{(onboarding as any).onboarding?.completed_at ?? "null"}</code>
                      </div>
                      <div style={kvKey()}>version</div>
                      <div style={kvVal()}>
                        <code style={codeChip()}>{String((onboarding as any).onboarding?.version ?? "?")}</code>
                      </div>
                    </div>

                    <div style={{ height: 10 }} />

                    <div style={goalRow()}>
                      <div style={label()}>Admin token</div>
                      <input
                        value={adminToken}
                        onChange={(e) => setAdminToken(e.target.value)}
                        placeholder="x-zensquid-admin-token (memory only)"
                        style={goalInput()}
                        type="password"
                        autoComplete="off"
                      />
                      <button
                        style={btnGhost()}
                        disabled={!adminToken.trim()}
                        onClick={async () => {
                          if (!adminToken.trim()) return;
                          await completeOnboarding(adminToken.trim());
                          await refreshOnboarding();
                          await refreshFooter();
                        }}
                      >
                        Mark Complete
                      </button>
                      <button
                        style={btnGhost()}
                        disabled={!adminToken.trim()}
                        onClick={async () => {
                          if (!adminToken.trim()) return;
                          await resetOnboarding(adminToken.trim());
                          await refreshOnboarding();
                          await refreshFooter();
                        }}
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div style={{ height: 10 }} />

                  <div style={resultBox()}>
                    <div style={{ fontWeight: 900, marginBottom: 8, opacity: 0.9 }}>Principles</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {((onboarding as any).content?.principles ?? []).map((p: any) => (
                        <div key={p.title} style={stepCard()}>
                          <div style={{ fontWeight: 900, opacity: 0.92 }}>{p.title}</div>
                          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{p.body}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ height: 10 }} />

                  <div style={resultBox()}>
                    <div style={{ fontWeight: 900, marginBottom: 8, opacity: 0.9 }}>Quick commands</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {((onboarding as any).content?.quick_commands ?? []).map((q: any) => (
                        <div key={q.title} style={stepCard()}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 900, opacity: 0.92 }}>{q.title}</div>
                            <button
                              style={btnTiny()}
                              onClick={async () => {
                                const ok = await copyText(q.cmd);
                                alert(ok ? "Copied command" : "Copy failed");
                              }}
                            >
                              Copy
                            </button>
                          </div>
                          <pre style={ioBox()}>{q.cmd}</pre>
                          {q.note ? <div style={{ fontSize: 12, opacity: 0.75 }}>{q.note}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ height: 10 }} />

                  <div style={resultBox()} data-testid="missions">
                    <div style={{ fontWeight: 900, marginBottom: 8, opacity: 0.9 }}>Starter missions</div>

                    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12 }}>
                      <div style={{ display: "grid", gap: 8 }}>
                        {missionList.map((m) => (
                          <button
                            key={m.id}
                            data-testid={`mission-${m.id}`}
                            style={{
                              ...btnGhost(),
                              textAlign: "left",
                              background:
                                selectedMissionId === m.id ? "rgba(120, 180, 255, 0.18)" : "rgba(255,255,255,0.06)"
                            }}
                            onClick={() => setSelectedMissionId(m.id)}
                          >
                            <div style={{ fontWeight: 900 }}>{m.title}</div>
                            <div style={{ fontSize: 12, opacity: 0.75 }}>
                              {m.difficulty} • ~{m.eta_minutes} min
                            </div>
                          </button>
                        ))}
                      </div>

                      <div style={stepCard()}>
                        {selectedMission ? (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div>
                                <div style={{ fontWeight: 900, opacity: 0.92 }} data-testid="mission-title">
                                  {selectedMission.title}
                                </div>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>
                                  id: <code style={codeChip()}>{selectedMission.id}</code> •{" "}
                                  {selectedMission.difficulty} • ~{selectedMission.eta_minutes} min
                                </div>
                              </div>
                              <button
                                style={btnTiny()}
                                onClick={() => {
                                  const next = makePlanFromGoal(selectedMission.title);
                                  setTab("tools");
                                  setGoal(selectedMission.title);
                                  setPlan(next);
                                  ensureStepStateInitialized(next);
                                }}
                              >
                                Send to Tool Plan
                              </button>
                            </div>

                            <div style={{ height: 10 }} />

                            <div style={{ fontWeight: 900, opacity: 0.85, marginBottom: 6 }}>Teaches</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {selectedMission.teaches.map((t) => (
                                <span key={t} style={miniPill()}>
                                  {t}
                                </span>
                              ))}
                            </div>

                            <div style={{ height: 10 }} />

                            <div style={{ fontWeight: 900, opacity: 0.85, marginBottom: 6 }}>Definition of done</div>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, opacity: 0.85 }}>
                              {selectedMission.definition_of_done.map((d) => (
                                <li key={d} style={{ marginBottom: 6 }}>
                                  {d}
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : (
                          <div style={{ fontSize: 12, opacity: 0.8 }}>Select a mission on the left.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={resultBox()}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {learnBusy ? "Loading onboarding…" : "No onboarding data (API unavailable?)"}
                  </div>
                  <div style={{ height: 10 }} />
                  <button style={btnGhost()} onClick={refreshOnboarding}>
                    Try again
                  </button>
                </div>
              )}

              <div style={{ height: 10 }} />
              <div style={footer()}>{footerStatus || `API: ${ZENSQUID_API}`}</div>
            </div>
          )}
        </div>
      </div>

      <div style={cornerMark()} aria-hidden>
        N
      </div>
    </div>
  );
}

/** ---------------- styles ---------------- */

function root() {
  return {
    minHeight: "100vh",
    width: "100%",
    position: "relative",
    overflow: "hidden",
    display: "grid",
    placeItems: "center"
  } as const;
}

function bgLayer() {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    backgroundColor: "#2a4aa0",
    backgroundImage: `
      radial-gradient(900px 520px at 50% 18%, rgba(255, 150, 235, 0.55), rgba(0,0,0,0) 62%),
      radial-gradient(900px 620px at 20% 35%, rgba(120, 200, 255, 0.40), rgba(0,0,0,0) 66%),
      radial-gradient(900px 620px at 80% 32%, rgba(170, 150, 255, 0.34), rgba(0,0,0,0) 68%),
      linear-gradient(180deg, rgba(44, 78, 158, 1), rgba(20, 34, 80, 1))
    `,
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed"
  } as const;
}

function vignette() {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 2,
    pointerEvents: "none",
    backgroundImage:
      "radial-gradient(1200px 700px at 50% 45%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.10) 70%, rgba(0,0,0,0.16) 100%)"
  } as const;
}

function starsLayer() {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 1,
    pointerEvents: "none",
    opacity: 0.22,
    backgroundImage: `
      radial-gradient(2px 2px at 12% 22%, rgba(255,255,255,0.55) 0, rgba(255,255,255,0) 60%),
      radial-gradient(1px 1px at 28% 14%, rgba(255,255,255,0.40) 0, rgba(255,255,255,0) 60%),
      radial-gradient(1px 1px at 41% 33%, rgba(255,255,255,0.35) 0, rgba(255,255,255,0) 60%),
      radial-gradient(2px 2px at 63% 18%, rgba(255,255,255,0.45) 0, rgba(255,255,255,0) 60%),
      radial-gradient(1px 1px at 77% 27%, rgba(255,255,255,0.30) 0, rgba(255,255,255,0) 60%),
      radial-gradient(2px 2px at 86% 12%, rgba(255,255,255,0.40) 0, rgba(255,255,255,0) 60%),
      radial-gradient(1px 1px at 18% 58%, rgba(255,255,255,0.25) 0, rgba(255,255,255,0) 60%),
      radial-gradient(2px 2px at 52% 62%, rgba(255,255,255,0.32) 0, rgba(255,255,255,0) 60%),
      radial-gradient(1px 1px at 73% 70%, rgba(255,255,255,0.22) 0, rgba(255,255,255,0) 60%),
      radial-gradient(2px 2px at 92% 64%, rgba(255,255,255,0.28) 0, rgba(255,255,255,0) 60%)
    `,
    backgroundRepeat: "no-repeat"
  } as const;
}

function grain() {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 2,
    pointerEvents: "none",
    opacity: 0.06,
    backgroundImage: `
      repeating-linear-gradient(0deg,
        rgba(255,255,255,0.06) 0px,
        rgba(255,255,255,0.06) 1px,
        rgba(0,0,0,0) 2px,
        rgba(0,0,0,0) 6px)
    `
  } as const;
}

function glassMini() {
  return {
    width: "min(860px, 92vw)",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(18, 20, 34, 0.46)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    boxShadow: "0 18px 55px rgba(0,0,0,0.35)",
    padding: 10,
    marginTop: -6
  } as const;
}

function contentWrap() {
  return {
    position: "relative",
    zIndex: 1,
    width: "min(980px, 92vw)",
    display: "grid",
    justifyItems: "center",
    gap: 0,
    padding: "4px 0 26px"
  } as const;
}

function squidBlock() {
  return { position: "relative", display: "grid", placeItems: "center" } as const;
}

function squidAura() {
  return {
    position: "absolute",
    width: "min(620px, 78vw)",
    height: "min(360px, 46vw)",
    borderRadius: 999,
    background:
      "radial-gradient(closest-side, rgba(255,160,60,0.30), rgba(255,80,180,0.18), rgba(80,200,255,0.14), rgba(120,255,160,0.08), rgba(0,0,0,0) 70%)",
    filter: "blur(18px)",
    transform: "translateY(30px)"
  } as const;
}

function squidImg() {
  return {
    width: "min(440px, 62vw)",
    height: "auto",
    userSelect: "none",
    marginBottom: -40,
    filter: "drop-shadow(0px 14px 40px rgba(0,0,0,0.6)) drop-shadow(0px 0px 50px rgba(255,160,60,0.28)) drop-shadow(0px 0px 80px rgba(120,220,255,0.15))"
  } as const;
}

function glass() {
  return {
    width: "min(860px, 92vw)",
    borderRadius: 18,
    border: "1px solid rgba(255,160,60,0.35)",
    background: "rgba(14, 16, 30, 0.82)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: "0 0 0 1px rgba(255,150,50,0.18), 0 0 30px rgba(255,130,30,0.22), 0 0 80px rgba(255,100,20,0.12), 0 30px 80px rgba(0,0,0,0.60)",
    padding: 14
  } as const;
}

function headerRow() {
  return { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } as const;
}

function statusDot() {
  return {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "rgba(100, 240, 180, 0.95)",
    boxShadow: "0 0 14px rgba(100, 240, 180, 0.55), 0 0 4px rgba(255,200,80,0.3)"
  } as const;
}

function title() {
  return { fontWeight: 900, fontSize: 18, letterSpacing: 0.2, color: "rgba(255,255,255,0.92)" } as const;
}

function subtitle() {
  return { fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.85)" } as const;
}

function pill() {
  return {
    fontSize: 12,
    padding: "5px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,160,60,0.30)",
    background: "rgba(255,140,40,0.12)",
    color: "rgba(255,200,120,0.95)"
  } as const;
}

function tabsWrap() {
  return {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
    padding: 4,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.18)"
  } as const;
}

function tabBtn(active: boolean, accent?: string) {
  return {
    borderRadius: 999,
    padding: "6px 10px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(120, 180, 255, 0.20)" : "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800
  } as const;
}

function label() {
  return { fontSize: 12, opacity: 0.8, color: "rgba(255,255,255,0.85)" } as const;
}

function select() {
  return {
    borderRadius: 12,
    padding: "8px 10px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.20)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
    maxWidth: "min(520px, 72vw)"
  } as const;
}

function chatShell() {
  return {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10, 12, 22, 0.42)",
    padding: 14
  } as const;
}

function toolShell() {
  return {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(10, 12, 22, 0.42)",
    padding: 14
  } as const;
}

function messagesBox() {
  return {
    minHeight: 160,
    maxHeight: "42vh",
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingRight: 4
  } as const;
}

function toolLog() {
  return {
    minHeight: 220,
    maxHeight: "46vh",
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingRight: 4
  } as const;
}

function rowLeft() {
  return { display: "flex", justifyContent: "flex-start" } as const;
}
function rowRight() {
  return { display: "flex", justifyContent: "flex-end" } as const;
}

function bubbleAssistant() {
  return {
    maxWidth: "86%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    whiteSpace: "pre-wrap"
  } as const;
}

function bubbleUser() {
  return {
    ...bubbleAssistant(),
    background: "rgba(255,150,50,0.10)",
    border: "1px solid rgba(255,150,50,0.20)"
  } as const;
}

function composerRow() {
  return { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const } as const;
}

function composerInput() {
  return {
    flex: 1,
    borderRadius: 14,
    padding: "12px 12px",
    border: "1px solid rgba(255,160,60,0.22)",
    background: "rgba(0,0,0,0.32)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)"
  } as const;
}

function goalRow() {
  return { display: "flex", gap: 10, alignItems: "center" } as const;
}

function goalInput() {
  return {
    flex: 1,
    borderRadius: 14,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.25)",
    color: "rgba(255,255,255,0.92)",
    outline: "none"
  } as const;
}

function btnPrimary() {
  return {
    borderRadius: 14,
    padding: "10px 14px",
    border: "1px solid rgba(255,160,60,0.40)",
    background: "rgba(255,140,40,0.22)",
    color: "rgba(255,220,160,0.98)",
    cursor: "pointer",
    fontWeight: 800,
    boxShadow: "0 2px 12px rgba(255,120,30,0.18)"
  } as const;
}

function btnGhost() {
  return {
    borderRadius: 14,
    padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.9)",
    cursor: "pointer",
    fontWeight: 800
  } as const;
}

function btnTiny() {
  return {
    borderRadius: 10,
    padding: "5px 10px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.9)",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12
  } as const;
}

function footer() {
  return { fontSize: 12, opacity: 0.8, paddingTop: 2, color: "rgba(255,255,255,0.82)" } as const;
}

function cornerMark() {
  return {
    position: "fixed",
    left: 14,
    bottom: 10,
    zIndex: 2,
    fontWeight: 900,
    opacity: 0.25,
    letterSpacing: 1,
    color: "rgba(255,255,255,0.7)"
  } as const;
}

function planMeta() {
  return { display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 } as const;
}

function codeChip() {
  return {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(255,255,255,0.10)",
    padding: "2px 6px",
    borderRadius: 10,
    color: "rgba(255,255,255,0.92)"
  } as const;
}

function stepCard() {
  return {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    padding: 12
  } as const;
}

function stepHeader() {
  return { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } as const;
}

function miniPill() {
  return {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.18)",
    color: "rgba(255,255,255,0.9)"
  } as const;
}

function badgeIdle() {
  return { width: 10, height: 10, borderRadius: 999, background: "rgba(255,255,255,0.28)" } as const;
}

function badgeInfo() {
  return {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "rgba(120, 220, 255, 0.95)",
    boxShadow: "0 0 16px rgba(120, 220, 255, 0.35)"
  } as const;
}

function badgeOk() {
  return {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "rgba(120, 255, 190, 0.95)",
    boxShadow: "0 0 16px rgba(120, 255, 190, 0.35)"
  } as const;
}

function badgeWarn() {
  return {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "rgba(255, 210, 120, 0.95)",
    boxShadow: "0 0 16px rgba(255, 210, 120, 0.35)"
  } as const;
}

function badgeBad() {
  return {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "rgba(255, 120, 140, 0.95)",
    boxShadow: "0 0 16px rgba(255, 120, 140, 0.35)"
  } as const;
}

function resultBox() {
  return {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.18)",
    padding: 10
  } as const;
}

function kvRow() {
  return {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto 1fr auto 1fr",
    gap: 8,
    alignItems: "center",
    fontSize: 12
  } as const;
}

function kvKey() {
  return { opacity: 0.7 } as const;
}

function kvVal() {
  return { opacity: 0.92, overflowWrap: "anywhere" } as const;
}

function ioLabel() {
  return { fontSize: 12, fontWeight: 900, opacity: 0.85, marginBottom: 6 } as const;
}

function ioBox() {
  return {
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: 12,
    lineHeight: 1.35,
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.92)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  } as const;
}
