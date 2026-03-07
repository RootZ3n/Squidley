// apps/web/app/components/BuildPanel.tsx
// Tenticode Pipeline UI — assembly line build engine
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ZENSQUID_API } from "@/api/zensquid";

const ADMIN_TOKEN = "8675309abc123easy";

// ── Types ─────────────────────────────────────────────────────────────────────

type StageStatus = "pending" | "running" | "ok" | "fail" | "skipped";

type StageResult = {
  stage: string;
  status: StageStatus;
  model?: string;
  output?: string;
  error?: string;
  receipt_id?: string;
  started_at: string;
  finished_at?: string;
};

type BuildTask = { id: string; description: string; target_files: string[]; priority: number };
type BuildPlan = { goal: string; tasks: BuildTask[]; approach: string; risks: string[] };
type PatchProposal = { task_id: string; file: string; old_str: string; new_str: string; reason: string };
type ReviewIssue = string | { severity?: string; file?: string; description?: string; [key: string]: any };
type ReviewReport = { passed: boolean; issues: ReviewIssue[]; suggestions: ReviewIssue[]; confidence: number };
type VerifyResult = { passed: boolean; lint_output?: string; errors: string[] };

type BuildRun = {
  run_id: string;
  goal: string;
  created_at: string;
  stage: string;
  stages: StageResult[];
  plan?: BuildPlan;
  patches?: PatchProposal[];
  review?: ReviewReport;
  verify?: VerifyResult;
  applied?: boolean;
  repair_count: number;
  max_repairs: number;
};

type PipelineStep = {
  id: string;
  label: string;
  description: string;
  color: string;
};

const PIPELINE_STEPS: PipelineStep[] = [
  { id: "inspect", label: "Inspect", description: "Repo scan + evidence gathering", color: "80,200,255" },
  { id: "plan",    label: "Plan",    description: "Task graph generation",          color: "140,120,255" },
  { id: "patch",   label: "Patch",   description: "Surgical code generation",       color: "255,180,60" },
  { id: "review",  label: "Review",  description: "LLM correctness check",          color: "200,100,255" },
  { id: "verify",  label: "Verify",  description: "Lint + build verification",      color: "100,220,160" },
  { id: "apply",   label: "Apply",   description: "Write patches to disk",          color: "255,120,60" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function headers() {
  return { "content-type": "application/json", "x-zensquid-admin-token": ADMIN_TOKEN };
}

async function api(method: string, path: string, body?: any) {
  const isPost = method === "POST";
  const res = await fetch(`${ZENSQUID_API}${path}`, {
    method,
    headers: headers(),
    body: isPost ? JSON.stringify(body ?? {}) : undefined,
  });
  return res.json();
}

function stageStatusForStep(stages: StageResult[], stepId: string): StageStatus {
  const s = stages.find(r => r.stage === stepId || r.stage.startsWith(stepId + ":"));
  return s?.status ?? "pending";
}

function syntaxHighlight(code: string): string {
  return code
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/(\/\/[^\n]*)/g, '<span style="color:rgba(120,200,120,0.8)">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*")/g, '<span style="color:rgba(255,200,100,0.85)">$1</span>')
    .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|from|async|await|type|interface|class)\b/g,
      '<span style="color:rgba(150,180,255,0.9)">$1</span>');
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PipelineLane({ stages, currentStage, busy }: { stages: StageResult[]; currentStage: string; busy: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "12px 16px", overflowX: "auto" }}>
      {PIPELINE_STEPS.map((step, i) => {
        const status = busy === step.id ? "running" : stageStatusForStep(stages, step.id);
        return (
          <div key={step.id} style={{ display: "flex", alignItems: "center" }}>
            <div style={pipelineNode(status, step.color)}>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.5, textTransform: "uppercase" as const }}>
                {step.label}
              </div>
              <div style={{ fontSize: 9, opacity: 0.65, marginTop: 1 }}>{statusIcon(status)}</div>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div style={pipelineConnector(status === "ok")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function statusIcon(s: StageStatus) {
  if (s === "ok") return "✓";
  if (s === "fail") return "✗";
  if (s === "running") return "◌";
  if (s === "skipped") return "–";
  return "·";
}

function StageLog({ stages }: { stages: StageResult[] }) {
  if (!stages.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 4, padding: "0 16px 8px" }}>
      {stages.map((s, i) => (
        <div key={i} style={stageLogRow(s.status)}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: stageColor(s.status), fontWeight: 700, minWidth: 120 }}>
            {s.stage}
          </span>
          <span style={{ fontSize: 11, opacity: 0.7, flex: 1 }}>{s.output ?? s.error ?? "—"}</span>
          {s.model && <span style={{ fontSize: 10, opacity: 0.4, fontFamily: "ui-monospace, monospace" }}>{s.model}</span>}
          {s.receipt_id && <span style={{ fontSize: 10, opacity: 0.3, fontFamily: "ui-monospace, monospace" }}>#{s.receipt_id.slice(-6)}</span>}
        </div>
      ))}
    </div>
  );
}

function PlanView({ plan }: { plan: BuildPlan }) {
  return (
    <div style={sectionBox("140,120,255")}>
      <div style={sectionHeader("140,120,255")}>📋 Build Plan</div>
      <div style={{ padding: "10px 14px", fontSize: 13 }}>
        <div style={{ opacity: 0.8, marginBottom: 8 }}>{plan.approach}</div>
        {plan.risks.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <span style={{ opacity: 0.5, fontSize: 11 }}>RISKS: </span>
            {plan.risks.map((r, i) => (
              <span key={i} style={{ fontSize: 11, color: "rgba(255,180,80,0.9)", marginRight: 8 }}>⚠ {r}</span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
          {plan.tasks.map((t, i) => (
            <div key={t.id} style={taskRow()}>
              <span style={{ color: "rgba(140,120,255,0.9)", fontWeight: 700, fontSize: 12, minWidth: 20 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{t.description}</div>
                <div style={{ fontSize: 11, opacity: 0.5, fontFamily: "ui-monospace, monospace", marginTop: 2 }}>
                  {t.target_files.join(", ")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PatchView({ patches, review }: { patches: PatchProposal[]; review?: ReviewReport }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  function toggle(i: number) {
    setExpanded(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }
  return (
    <div style={sectionBox("255,180,60")}>
      <div style={sectionHeader("255,180,60")}>
        🔧 Patches ({patches.length})
        {review && (
          <span style={{ marginLeft: 12, fontSize: 11, color: review.passed ? "rgba(100,220,160,0.9)" : "rgba(255,100,100,0.9)" }}>
            Review: {review.passed ? "✓ passed" : "✗ issues"} ({(review.confidence * 100).toFixed(0)}% confidence)
          </span>
        )}
      </div>
      {review && !review.passed && review.issues.length > 0 && (
        <div style={{ padding: "6px 14px", display: "flex", flexDirection: "column" as const, gap: 3 }}>
          {review.issues.map((iss, i) => {
            const text = typeof iss === "string" ? iss : `[${(iss as any).severity ?? "issue"}] ${(iss as any).file ? (iss as any).file + ": " : ""}${(iss as any).description ?? JSON.stringify(iss)}`;
            return <div key={i} style={{ fontSize: 12, color: "rgba(255,140,100,0.9)", marginBottom: 3 }}>⚠ {text}</div>;
          })}
        </div>
      )}
      <div style={{ padding: "0 14px 10px", display: "flex", flexDirection: "column" as const, gap: 6 }}>
        {patches.map((p, i) => (
          <div key={i} style={patchCard()}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 10px" }} onClick={() => toggle(i)}>
              <span style={{ fontSize: 11, color: "rgba(255,180,60,0.9)", fontFamily: "ui-monospace, monospace", flex: 1 }}>{p.file}</span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>{p.reason?.slice(0, 60)}</span>
              <span style={{ fontSize: 12, opacity: 0.5 }}>{expanded.has(i) ? "▲" : "▼"}</span>
            </div>
            {expanded.has(i) && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "8px 10px", display: "flex", flexDirection: "column" as const, gap: 6 }}>
                {p.old_str && (
                  <div>
                    <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 3 }}>REMOVE</div>
                    <pre style={diffPre("255,80,80")} dangerouslySetInnerHTML={{ __html: syntaxHighlight(p.old_str) }} />
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 3 }}>ADD</div>
                  <pre style={diffPre("80,220,120")} dangerouslySetInnerHTML={{ __html: syntaxHighlight(p.new_str) }} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function VerifyView({ verify }: { verify: VerifyResult }) {
  return (
    <div style={sectionBox(verify.passed ? "100,220,160" : "255,100,100")}>
      <div style={sectionHeader(verify.passed ? "100,220,160" : "255,100,100")}>
        {verify.passed ? "✓ Verification Passed" : "✗ Verification Failed"}
      </div>
      {verify.errors.length > 0 && (
        <div style={{ padding: "6px 14px" }}>
          {verify.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: "rgba(255,120,100,0.9)", fontFamily: "ui-monospace, monospace" }}>{e}</div>
          ))}
        </div>
      )}
      {verify.lint_output && (
        <pre style={{ margin: "0 14px 10px", fontSize: 12, opacity: 0.6, fontFamily: "ui-monospace, monospace", maxHeight: 120, overflowY: "auto" as const }}>
          {verify.lint_output.slice(0, 500)}
        </pre>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BuildPanel({ adminToken: _ }: { adminToken: string }) {
  const [goal, setGoal] = useState("");
  const [run, setRun] = useState<BuildRun | null>(null);
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [recentRuns, setRecentRuns] = useState<any[]>([]);
  const goalRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load recent runs
    api("GET", "/build/runs").then(j => { if (j.ok) setRecentRuns(j.runs ?? []); }).catch(() => {});
    // Check for brief from chat tab
    const brief = sessionStorage.getItem("squidley_build_brief");
    if (brief) { sessionStorage.removeItem("squidley_build_brief"); setGoal(brief); setTimeout(() => goalRef.current?.focus(), 100); }
  }, []);

  async function startRun() {
    if (!goal.trim() || busyStage) return;
    setError(null);
    setRun(null);
    setAwaitingApproval(false);
    setBusyStage("inspect");
    try {
      const j = await api("POST", "/build/start", { goal: goal.trim() });
      if (!j.ok) throw new Error(j.error ?? "Start failed");
      setRun({ run_id: j.run_id, goal: goal.trim(), created_at: new Date().toISOString(), stage: "inspect", stages: [j.result], plan: undefined, patches: undefined, review: undefined, verify: undefined, repair_count: 0, max_repairs: 3 });
      setBusyStage(null);
    } catch (e: any) { setError(String(e?.message ?? e)); setBusyStage(null); }
  }

  async function runStage(stage: string) {
    if (!run || busyStage) return;
    setBusyStage(stage);
    setError(null);
    try {
      const j = await api("POST", `/build/${stage}/${run.run_id}`);
      if (!j.ok && !j.result) throw new Error(j.error ?? `${stage} failed`);
      setRun(r => r ? {
        ...r,
        stage,
        stages: [...r.stages.filter(s => !s.stage.startsWith(stage)), j.result].filter(Boolean),
        plan: j.plan ?? r.plan,
        patches: j.patches ?? r.patches ?? [],
        review: j.review ?? r.review,
        verify: j.verify ?? r.verify,
      } : r);
      // After review fails, offer repair. After verify passes, offer apply.
      if (stage === "review" && j.result?.status === "fail") setAwaitingApproval(false);
      if (stage === "verify" && j.result?.status === "ok") setAwaitingApproval(true);
    } catch (e: any) { setError(String(e?.message ?? e)); }
    setBusyStage(null);
  }

  async function runRepair() {
    if (!run || busyStage) return;
    setBusyStage("repair");
    setError(null);
    try {
      const j = await api("POST", `/build/repair/${run.run_id}`);
      if (!j.ok) throw new Error(j.error ?? "Repair failed");
      setRun(r => r ? {
        ...r,
        repair_count: j.repair_count,
        patches: j.patches ?? r.patches,
        stages: [
          ...r.stages,
          j.patch,
          j.review
        ].filter(Boolean),
      } : r);
    } catch (e: any) { setError(String(e?.message ?? e)); }
    setBusyStage(null);
  }

  async function applyPatches() {
    if (!run || busyStage) return;
    setAwaitingApproval(false);
    setBusyStage("apply");
    setError(null);
    try {
      const j = await api("POST", `/build/apply/${run.run_id}`);
      setRun(r => r ? {
        ...r,
        applied: j.ok,
        stages: [...r.stages, j.result].filter(Boolean),
      } : r);
    } catch (e: any) { setError(String(e?.message ?? e)); }
    setBusyStage(null);
  }

  const currentStages = run?.stages ?? [];
  const lastStage = currentStages[currentStages.length - 1];
  const inspectDone = currentStages.some(s => s.stage === "inspect" && s.status === "ok");
  const planDone = currentStages.some(s => s.stage === "plan" && s.status === "ok");
  const patchDone = currentStages.some(s => s.stage === "patch" && s.status === "ok");
  const reviewDone = currentStages.some(s => s.stage === "review");
  const reviewPassed = currentStages.some(s => s.stage === "review" && s.status === "ok");
  const verifyDone = currentStages.some(s => s.stage === "verify");
  const verifyPassed = currentStages.some(s => s.stage === "verify" && s.status === "ok");
  const applied = run?.applied ?? false;
  const canRepair = reviewDone && !reviewPassed && (run?.repair_count ?? 0) < (run?.max_repairs ?? 3);

  return (
    <div style={shell()}>
      {/* Header */}
      <div style={header()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>🔨</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5 }}>Tenticode Build Engine</div>
            <div style={{ fontSize: 11, opacity: 0.45 }}>inspect → plan → patch → review → verify → apply</div>
          </div>
        </div>
        {run && (
          <div style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", opacity: 0.4 }}>
            {run.run_id} · repairs: {run.repair_count}/{run.max_repairs}
          </div>
        )}
      </div>

      {/* Pipeline visual */}
      {run && <PipelineLane stages={currentStages} currentStage={run.stage} busy={busyStage} />}

      {/* Stage log */}
      {currentStages.length > 0 && <StageLog stages={currentStages} />}

      {/* Scrollable content area */}
      <div style={contentArea()}>

        {/* Goal input */}
        {!run && (
          <div style={goalBox()}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, opacity: 0.7 }}>What do you want to build or fix?</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={goalRef}
                value={goal}
                onChange={e => setGoal(e.target.value)}
                onKeyDown={e => e.key === "Enter" && startRun()}
                placeholder="e.g. Add a /status endpoint that returns current tier and model"
                style={goalInput()}
              />
              <button style={btnStart(!!goal.trim() && !busyStage)} onClick={startRun} disabled={!goal.trim() || !!busyStage}>
                {busyStage === "inspect" ? "Scanning…" : "Start"}
              </button>
            </div>
            {recentRuns.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 6 }}>RECENT RUNS</div>
                {recentRuns.slice(0, 5).map(r => (
                  <div key={r.run_id} style={recentRunRow()} onClick={() => setGoal(r.goal)}>
                    <span style={{ fontSize: 12, flex: 1 }}>{r.goal}</span>
                    <span style={{ fontSize: 11, opacity: 0.4, fontFamily: "ui-monospace, monospace" }}>{r.stage}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active run controls + data */}
        {run && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, padding: "0 14px 14px" }}>

            {/* Goal bar */}
            <div style={goalBar()}>
              <span style={{ opacity: 0.5, fontSize: 11 }}>GOAL</span>
              <span style={{ fontSize: 13, flex: 1 }}>{run.goal}</span>
              <button style={btnSmallGhost()} onClick={() => { setRun(null); setError(null); }}>New run</button>
            </div>

            {/* Stage action buttons */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              {inspectDone && !planDone && (
                <button style={btnStage("140,120,255", !!busyStage)} onClick={() => runStage("plan")} disabled={!!busyStage}>
                  {busyStage === "plan" ? "Planning…" : "▶ Run Planner"}
                </button>
              )}
              {planDone && !reviewDone && (
                <button style={btnStage("200,100,255", !!busyStage)} onClick={() => runStage("review")} disabled={!!busyStage}>
                  {busyStage === "review" ? "Reviewing…" : "▶ Review Patches"}
                </button>
              )}
              {reviewPassed && !verifyDone && (
                <button style={btnStage("100,220,160", !!busyStage)} onClick={() => runStage("verify")} disabled={!!busyStage}>
                  {busyStage === "verify" ? "Verifying…" : "▶ Verify"}
                </button>
              )}
              {canRepair && (
                <button style={btnStage("255,140,60", !!busyStage)} onClick={runRepair} disabled={!!busyStage}>
                  {busyStage === "repair" ? `Repairing…` : `↺ Repair (${(run?.max_repairs ?? 3) - (run?.repair_count ?? 0)} left)`}
                </button>
              )}
            </div>

            {/* Plan */}
            {run.plan && <PlanView plan={run.plan} />}

            {/* Patches + review */}
            {run.patches && run.patches.length > 0 && <PatchView patches={run.patches} review={run.review} />}

            {/* Verify */}
            {run.verify && <VerifyView verify={run.verify} />}

            {/* Apply approval gate */}
            {awaitingApproval && !applied && (
              <div style={approvalBanner()}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>✓ Verification passed — ready to apply</div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                    {run.patches?.length} patch(es) will be written to disk. This cannot be undone automatically.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={btnApprove()} onClick={applyPatches} disabled={!!busyStage}>
                    {busyStage === "apply" ? "Applying…" : "✓ Apply Patches"}
                  </button>
                  <button style={btnDeny()} onClick={() => setAwaitingApproval(false)}>✕ Cancel</button>
                </div>
              </div>
            )}

            {/* Applied */}
            {applied && (
              <div style={appliedBanner()}>
                ✓ Patches applied successfully — {run.patches?.length} file(s) updated
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={errorBanner()}>⚠ {error}</div>
            )}
          </div>
        )}

        {!run && error && <div style={{ ...errorBanner(), margin: "0 14px" }}>⚠ {error}</div>}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function shell() {
  return {
    display: "flex", flexDirection: "column" as const,
    height: "calc(100vh - 140px)",
    borderRadius: 16,
    border: "1px solid rgba(255,140,40,0.20)",
    background: "rgba(8, 10, 20, 0.65)",
    overflow: "hidden",
  };
}

function header() {
  return {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(0,0,0,0.25)",
    flexShrink: 0,
  } as const;
}

function contentArea() {
  return { flex: 1, overflowY: "auto" as const };
}

function pipelineNode(status: StageStatus, color: string) {
  const active = status === "ok" || status === "running";
  return {
    padding: "6px 10px", borderRadius: 10, textAlign: "center" as const,
    border: `1px solid rgba(${color},${active ? "0.45" : "0.15"})`,
    background: status === "ok" ? `rgba(${color},0.18)` : status === "running" ? `rgba(${color},0.12)` : status === "fail" ? "rgba(255,80,80,0.12)" : "rgba(255,255,255,0.04)",
    color: status === "ok" ? `rgba(${color},1)` : status === "fail" ? "rgba(255,120,120,0.9)" : "rgba(255,255,255,0.5)",
    minWidth: 64, flexShrink: 0,
    boxShadow: status === "ok" ? `0 0 12px rgba(${color},0.20)` : "none",
  } as const;
}

function pipelineConnector(lit: boolean) {
  return {
    width: 24, height: 1, flexShrink: 0,
    background: lit ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
  } as const;
}

function stageLogRow(status: StageStatus) {
  return {
    display: "flex", gap: 10, alignItems: "center",
    padding: "3px 8px", borderRadius: 6,
    background: status === "fail" ? "rgba(255,80,80,0.06)" : "rgba(255,255,255,0.03)",
    border: `1px solid ${status === "fail" ? "rgba(255,80,80,0.15)" : "rgba(255,255,255,0.05)"}`,
  } as const;
}

function stageColor(s: StageStatus) {
  if (s === "ok") return "rgba(100,220,160,0.9)";
  if (s === "fail") return "rgba(255,100,100,0.9)";
  if (s === "running") return "rgba(255,200,80,0.9)";
  return "rgba(255,255,255,0.4)";
}

function goalBox() {
  return { padding: "20px 16px" };
}

function goalInput() {
  return {
    flex: 1, borderRadius: 12, padding: "10px 14px",
    border: "1px solid rgba(255,160,60,0.25)",
    background: "rgba(0,0,0,0.30)",
    color: "rgba(255,255,255,0.92)", outline: "none", fontSize: 14,
  } as const;
}

function btnStart(active: boolean) {
  return {
    borderRadius: 12, padding: "10px 20px",
    border: `1px solid rgba(255,140,40,${active ? "0.50" : "0.20"})`,
    background: active ? "rgba(255,130,30,0.22)" : "rgba(255,255,255,0.05)",
    color: active ? "rgba(255,210,150,0.98)" : "rgba(255,255,255,0.3)",
    cursor: active ? "pointer" : "not-allowed", fontWeight: 900, fontSize: 14,
    boxShadow: active ? "0 2px 16px rgba(255,120,30,0.20)" : "none",
  } as const;
}

function goalBar() {
  return {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 12px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(255,255,255,0.03)",
  } as const;
}

function btnSmallGhost() {
  return {
    borderRadius: 8, padding: "4px 10px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12, fontWeight: 700,
  } as const;
}

function btnStage(color: string, disabled: boolean) {
  return {
    borderRadius: 10, padding: "7px 14px",
    border: `1px solid rgba(${color},${disabled ? "0.15" : "0.40"})`,
    background: disabled ? "rgba(255,255,255,0.04)" : `rgba(${color},0.15)`,
    color: disabled ? "rgba(255,255,255,0.3)" : `rgba(${color},1)`,
    cursor: disabled ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 13,
  } as const;
}

function sectionBox(color: string) {
  return {
    borderRadius: 12, border: `1px solid rgba(${color},0.20)`,
    background: `rgba(${color},0.04)`, overflow: "hidden",
  } as const;
}

function sectionHeader(color: string) {
  return {
    padding: "8px 14px", fontWeight: 800, fontSize: 13,
    borderBottom: `1px solid rgba(${color},0.12)`,
    background: `rgba(${color},0.08)`,
    color: `rgba(${color},0.95)`,
    display: "flex", alignItems: "center",
  } as const;
}

function taskRow() {
  return {
    display: "flex", gap: 10, alignItems: "flex-start",
    padding: "6px 8px", borderRadius: 8,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
  } as const;
}

function patchCard() {
  return {
    borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.20)", overflow: "hidden",
  } as const;
}

function diffPre(color: string) {
  return {
    margin: 0, padding: "6px 10px", borderRadius: 6, fontSize: 12, lineHeight: 1.5,
    background: `rgba(${color},0.06)`, border: `1px solid rgba(${color},0.15)`,
    fontFamily: "ui-monospace, 'Cascadia Code', monospace",
    overflowX: "auto" as const, maxHeight: 200, overflowY: "auto" as const,
  };
}

function approvalBanner() {
  return {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 14px", borderRadius: 12,
    border: "1px solid rgba(100,220,160,0.30)",
    background: "rgba(100,220,160,0.08)",
    boxShadow: "0 0 20px rgba(100,220,160,0.08)",
  } as const;
}

function appliedBanner() {
  return {
    padding: "10px 14px", borderRadius: 10,
    border: "1px solid rgba(100,220,160,0.25)",
    background: "rgba(100,220,160,0.10)",
    color: "rgba(120,240,180,0.95)", fontSize: 13, fontWeight: 700,
  } as const;
}

function errorBanner() {
  return {
    padding: "10px 14px", borderRadius: 10,
    border: "1px solid rgba(255,100,100,0.25)",
    background: "rgba(255,100,100,0.08)",
    color: "rgba(255,140,140,0.95)", fontSize: 13,
  } as const;
}

function btnApprove() {
  return {
    borderRadius: 10, padding: "7px 16px",
    border: "1px solid rgba(100,220,160,0.35)",
    background: "rgba(100,220,160,0.15)",
    color: "rgba(140,255,190,0.95)", cursor: "pointer", fontWeight: 800, fontSize: 13,
  } as const;
}

function btnDeny() {
  return {
    borderRadius: 10, padding: "7px 14px",
    border: "1px solid rgba(255,100,100,0.25)",
    background: "rgba(255,100,100,0.08)",
    color: "rgba(255,130,130,0.9)", cursor: "pointer", fontWeight: 800, fontSize: 13,
  } as const;
}

function recentRunRow() {
  return {
    display: "flex", gap: 10, alignItems: "center",
    padding: "5px 8px", borderRadius: 7, cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.03)",
    marginBottom: 3,
  } as const;
}
