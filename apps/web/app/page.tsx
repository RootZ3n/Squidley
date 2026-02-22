// apps/web/app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ZENSQUID_API,
  apiGet,
  chat as chatApi,
  getSkills,
  getToolsList,
  runTool as runToolApi,
  type SkillsList,
  type ChatResponse,
  type ToolListItem,
  type ToolRunResult,
  type ToolRunResponse
} from "@/app/api/zensquid";

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
    const m = goal.match(/[:“"']\s*([^"”']+)\s*["”']?$/);
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

export default function Page() {
  const [skills, setSkills] = useState<SkillsList | null>(null);

  const [selectedSkill, setSelectedSkill] = useState<string>("(none)");
  const selectedSkillForApi = useMemo(() => {
    if (!selectedSkill || selectedSkill === "(none)") return null;
    return selectedSkill;
  }, [selectedSkill]);

  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi — I’m Squidley. 🐙\nEverything stays local-first. If you want me to remember something, say: “Remember this: …”"
    }
  ]);

  const [footerStatus, setFooterStatus] = useState<string>("");

  const listRef = useRef<HTMLDivElement | null>(null);

  // --- Tool Loop state ---
  const [tab, setTab] = useState<"chat" | "tools">("chat");
  const [goal, setGoal] = useState<string>("Build web + run Playwright tests");
  const [plan, setPlan] = useState<ToolPlanV1>(() => makePlanFromGoal("Build web + run Playwright tests"));

  const [tools, setTools] = useState<ToolListItem[]>([]);
  const [adminToken, setAdminToken] = useState<string>(""); // memory-only
  const [stepState, setStepState] = useState<Record<string, StepRunState>>({});
  const [runAllBusy, setRunAllBusy] = useState(false);

  const toolLogRef = useRef<HTMLDivElement | null>(null);

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

  async function refreshFooter() {
    try {
      const h = await apiGet("/health");
      const r = await apiGet<{ count: number }>("/receipts?limit=1");
      setFooterStatus(
        `API: ${ZENSQUID_API} • Health: ${h?.ok ? "OK" : "?"} • Receipts: ${typeof r?.count === "number" ? r.count : "?"}`
      );
    } catch {
      setFooterStatus(`API: ${ZENSQUID_API}`);
    }
  }

  async function sendChat() {
    const input = chatInput.trim();
    if (!input || chatBusy) return;

    setChatBusy(true);
    setChatInput("");
    setMessages((m) => [...m, { role: "user", content: input }]);

    try {
      const res: ChatResponse = await chatApi(input, selectedSkillForApi);
      const out =
        (res as any)?.output ??
        (res as any)?.content ??
        (res as any)?.error ??
        JSON.stringify(res, null, 2);

      setMessages((m) => [...m, { role: "assistant", content: String(out ?? "") }]);
      await refreshFooter();
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

  useEffect(() => {
    refreshSkills().catch(console.error);
    refreshTools().catch(console.error);
    refreshFooter().catch(console.error);
    ensureStepStateInitialized(plan);
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

        <div style={glass()}>
          <div style={headerRow()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={statusDot()} />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={title()}>Squidley</div>
                  <div style={pill()}>Local-first</div>
                  <div style={tabsWrap()}>
                    <button style={tabBtn(tab === "chat")} onClick={() => setTab("chat")}>
                      Chat
                    </button>
                    <button style={tabBtn(tab === "tools")} onClick={() => setTab("tools")}>
                      Tool Loop
                    </button>
                  </div>
                </div>
                <div style={subtitle()}>Twilight • Calm</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={label()}>Skill</div>
              <select value={selectedSkill} onChange={(e) => setSelectedSkill(e.target.value)} style={select()}>
                <option>(none)</option>
                {(skills?.skills ?? []).map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>

              <button style={btnGhost()} onClick={() => alert("Diagnostics later 🙂")} title="Coming soon">
                Diagnostics
              </button>
            </div>
          </div>

          <div style={{ height: 10 }} />

          {tab === "chat" && (
            <div style={chatShell()}>
              <div style={{ fontWeight: 800, opacity: 0.9, marginBottom: 8 }}>Squidley</div>

              <div ref={listRef} style={messagesBox()}>
                {messages.map((m, idx) => (
                  <div key={idx} style={m.role === "user" ? rowRight() : rowLeft()}>
                    <div style={m.role === "user" ? bubbleUser() : bubbleAssistant()}>{m.content}</div>
                  </div>
                ))}
              </div>

              <div style={{ height: 10 }} />

              <div style={composerRow()}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={`Talk to Squidley… (try: "Remember this: Jeff hates drifting")`}
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
                          "Hi — I’m Squidley. 🐙\nEverything stays local-first. If you want me to remember something, say: “Remember this: …”"
                      }
                    ])
                  }
                  style={btnGhost()}
                >
                  Clear
                </button>
              </div>

              <div style={{ height: 10 }} />
              <div style={footer()}>{footerStatus || `API: ${ZENSQUID_API}`}</div>
            </div>
          )}

          {tab === "tools" && (
            <div style={toolShell()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 900, opacity: 0.92 }}>Tool Plan</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Allowlisted tools only • No shell • Receipts in{" "}
                    <code style={codeChip()}>~/.squidley/receipts</code>
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
                  onChange={(e) => setAdminToken(e.target.value)}
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
  return { minHeight: "100vh", width: "100%", position: "relative", overflow: "hidden", display: "grid", placeItems: "center" } as const;
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

function contentWrap() {
  return {
    position: "relative",
    zIndex: 1,
    width: "min(980px, 92vw)",
    display: "grid",
    justifyItems: "center",
    gap: 16,
    padding: "22px 0 26px"
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
      "radial-gradient(closest-side, rgba(255,120,220,0.16), rgba(120,180,255,0.10), rgba(0,0,0,0) 70%)",
    filter: "blur(10px)",
    transform: "translateY(10px)"
  } as const;
}

function squidImg() {
  return {
    width: "min(560px, 74vw)",
    height: "auto",
    userSelect: "none",
    filter: "drop-shadow(0px 18px 45px rgba(0,0,0,0.55))"
  } as const;
}

function glass() {
  return {
    width: "min(860px, 92vw)",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(18, 20, 34, 0.46)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
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
    background: "rgba(120, 220, 255, 0.95)",
    boxShadow: "0 0 18px rgba(120, 220, 255, 0.45)"
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
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.9)"
  } as const;
}

function tabsWrap() {
  return {
    display: "flex",
    gap: 6,
    padding: 4,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.18)"
  } as const;
}

function tabBtn(active: boolean) {
  return {
    borderRadius: 999,
    padding: "6px 10px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(120, 180, 255, 0.18)" : "rgba(255,255,255,0.06)",
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
    outline: "none"
  } as const;
}

function chatShell() {
  return { borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10, 12, 22, 0.42)", padding: 14 } as const;
}

function toolShell() {
  return { borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(10, 12, 22, 0.42)", padding: 14 } as const;
}

function messagesBox() {
  return { minHeight: 160, maxHeight: "42vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4 } as const;
}

function toolLog() {
  return { minHeight: 220, maxHeight: "46vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4 } as const;
}

function rowLeft() {
  return { display: "flex", justifyContent: "flex-start" } as const;
}
function rowRight() {
  return { display: "flex", justifyContent: "flex-end" } as const;
}

function bubbleAssistant() {
  return { maxWidth: "86%", padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.92)", whiteSpace: "pre-wrap" } as const;
}

function bubbleUser() {
  return { ...bubbleAssistant(), background: "rgba(120, 180, 255, 0.12)", border: "1px solid rgba(120, 180, 255, 0.18)" } as const;
}

function composerRow() {
  return { display: "flex", gap: 10, alignItems: "center" } as const;
}

function composerInput() {
  return { flex: 1, borderRadius: 14, padding: "12px 12px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.92)", outline: "none" } as const;
}

function goalRow() {
  return { display: "flex", gap: 10, alignItems: "center" } as const;
}

function goalInput() {
  return { flex: 1, borderRadius: 14, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.92)", outline: "none" } as const;
}

function btnPrimary() {
  return { borderRadius: 14, padding: "10px 14px", border: "1px solid rgba(120, 180, 255, 0.30)", background: "rgba(120, 180, 255, 0.18)", color: "rgba(255,255,255,0.92)", cursor: "pointer", fontWeight: 800 } as const;
}

function btnGhost() {
  return { borderRadius: 14, padding: "10px 14px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.9)", cursor: "pointer", fontWeight: 800 } as const;
}

function btnTiny() {
  return { borderRadius: 10, padding: "5px 10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.9)", cursor: "pointer", fontWeight: 800, fontSize: 12 } as const;
}

function footer() {
  return { fontSize: 12, opacity: 0.8, paddingTop: 2, color: "rgba(255,255,255,0.82)" } as const;
}

function cornerMark() {
  return { position: "fixed", left: 14, bottom: 10, zIndex: 2, fontWeight: 900, opacity: 0.25, letterSpacing: 1, color: "rgba(255,255,255,0.7)" } as const;
}

function planMeta() {
  return { display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 } as const;
}

function codeChip() {
  return { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12, background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.10)", padding: "2px 6px", borderRadius: 10, color: "rgba(255,255,255,0.92)" } as const;
}

function stepCard() {
  return { borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", padding: 12 } as const;
}

function stepHeader() {
  return { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } as const;
}

function miniPill() {
  return { fontSize: 12, padding: "4px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.18)", color: "rgba(255,255,255,0.9)" } as const;
}

function badgeIdle() {
  return { width: 10, height: 10, borderRadius: 999, background: "rgba(255,255,255,0.28)" } as const;
}

function badgeInfo() {
  return { width: 10, height: 10, borderRadius: 999, background: "rgba(120, 220, 255, 0.95)", boxShadow: "0 0 16px rgba(120, 220, 255, 0.35)" } as const;
}

function badgeOk() {
  return { width: 10, height: 10, borderRadius: 999, background: "rgba(120, 255, 190, 0.95)", boxShadow: "0 0 16px rgba(120, 255, 190, 0.35)" } as const;
}

function badgeWarn() {
  return { width: 10, height: 10, borderRadius: 999, background: "rgba(255, 210, 120, 0.95)", boxShadow: "0 0 16px rgba(255, 210, 120, 0.35)" } as const;
}

function badgeBad() {
  return { width: 10, height: 10, borderRadius: 999, background: "rgba(255, 120, 140, 0.95)", boxShadow: "0 0 16px rgba(255, 120, 140, 0.35)" } as const;
}

function resultBox() {
  return { borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.18)", padding: 10 } as const;
}

function kvRow() {
  return { display: "grid", gridTemplateColumns: "auto 1fr auto 1fr auto 1fr", gap: 8, alignItems: "center", fontSize: 12 } as const;
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