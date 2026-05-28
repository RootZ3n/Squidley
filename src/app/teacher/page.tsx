"use client";

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types (mirrored from API responses to avoid server imports in client)
// ---------------------------------------------------------------------------

interface OnboardingStage {
  id: string;
  title: string;
  objective: string;
  requiredConcepts: string[];
  userAction: string;
  squidleyExplanation: string;
  completionCriteria: string;
  nextStage?: string;
}

interface Concept {
  id: string;
  title: string;
  plainLanguageDefinition: string;
  relatedConcepts: string[];
  linkedDocs: string[];
}

interface ConceptDetail extends Concept {
  beginnerExplanation: string;
  examples: string[];
  commonMisunderstandings: string[];
  checkYourUnderstandingQuestions: string[];
}

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------

const PROGRESS_KEY = "squidley_onboarding_progress";
const SETTINGS_KEY = "squidley_teaching_settings";

interface Progress {
  currentStage: string;
  completedStages: string[];
  skippedStages: string[];
  completedConcepts: string[];
}

interface Settings {
  teachWhileChatting: boolean;
  firstRunCompleted: boolean;
  showInContextCards: boolean;
  showExplainHelpers: boolean;
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return fallback;
}

function save(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

const defaultProgress: Progress = {
  currentStage: "welcome",
  completedStages: [],
  skippedStages: [],
  completedConcepts: [],
};

const defaultSettings: Settings = {
  teachWhileChatting: true,
  firstRunCompleted: false,
  showInContextCards: true,
  showExplainHelpers: true,
};

// ---------------------------------------------------------------------------
// Onboarding wizard steps (first-run experience)
// ---------------------------------------------------------------------------

const WIZARD_STEPS = [
  {
    id: "welcome",
    title: "Welcome to Squidley",
    body: "Squidley teaches AI agents step by step.\n\nShe is not just a chatbot. She is a guided learning environment that starts you locally, teaches every concept, and eventually graduates you into cloud-powered autonomous agent workflows.\n\nLet's walk through the basics.",
  },
  {
    id: "local",
    title: "You are in Local Mode",
    body: "Right now, everything runs on your machine.\n\nSquidley uses a local AI model (via Ollama) installed on your computer. Your text never leaves your device. There is no cost. There is no cloud call.\n\nThe provenance footer on every answer confirms this: \"answered by local model only / no tool used / no cloud used.\"",
  },
  {
    id: "can-do",
    title: "What Squidley can do now",
    body: "In Local Mode, Squidley can:\n\n- Chat with your local model\n- Answer questions about herself and AI concepts (from the Teacher Layer, no model call needed)\n- Show code suggestions (single-file, via Fabrica)\n- Analyze images (Ollama vision, limited)\n- Store notes in your browser (Archivum)\n- Show receipts for every action (Tabularium)\n- Explain her own capabilities honestly (Nous)",
  },
  {
    id: "cannot-do",
    title: "What Squidley cannot do yet",
    body: "These features are planned but not implemented:\n\n- Write or read files on your computer\n- Run shell commands\n- Search the web\n- Inspect your project or repository\n- Connect to cloud AI providers (OpenAI, Anthropic, etc.)\n- Run autonomous multi-step workflows\n\nWhen Squidley cannot do something, she says so honestly. If the model claims otherwise, the honesty annotator catches it and adds a correction.",
  },
  {
    id: "provenance",
    title: "How to know what happened",
    body: "Every answer has a provenance footer:\n\n\"answered by local model only / no tool used / no cloud used\"\n\nThis tells you:\n- Which mode was used (Local)\n- Whether a tool was used (no)\n- Whether data went to the cloud (no)\n\nYou can also check the Tabularium for a full receipt: what happened, which model, when, and whether it succeeded or failed.\n\nModel text is not proof. Only a receipt is proof.",
  },
  {
    id: "tools",
    title: "Model text vs real tool actions",
    body: "Right now, all of Squidley's answers are model-only: the model generates text, but no files are read, written, or changed.\n\nSometimes the model will say \"I wrote the file\" when no file was written. That is a hallucination. Squidley catches these and shows an honesty correction.\n\nIn the future, when tools are available, real tool actions will produce receipts as proof. Until then, if there is no receipt, it did not happen.",
  },
  {
    id: "next",
    title: "Try it out",
    body: "Go to Colloquium (the chat page) and try asking:\n\n- \"What is a tool call?\"\n- \"What can you do locally?\"\n- \"Did anything leave my computer?\"\n\nThese questions are answered by the Teacher Layer, not the model. No model call needed.\n\nFor everything else, Squidley uses your local model. Check the provenance footer on each answer to see the difference.",
  },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TeacherPage() {
  const [stages, setStages] = useState<OnboardingStage[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [progress, setProgress] = useState<Progress>(() => load(PROGRESS_KEY, defaultProgress));
  const [settings, setSettings] = useState<Settings>(() => load(SETTINGS_KEY, defaultSettings));
  const [expandedConcept, setExpandedConcept] = useState<string | null>(null);
  const [conceptDetail, setConceptDetail] = useState<ConceptDetail | null>(null);
  const [askResult, setAskResult] = useState<Record<string, unknown> | null>(null);
  const [askInput, setAskInput] = useState("");
  const [view, setView] = useState<"wizard" | "onboarding" | "concepts" | "ask" | "settings">(
    () => load(SETTINGS_KEY, defaultSettings).firstRunCompleted ? "onboarding" : "wizard",
  );
  const [wizardStep, setWizardStep] = useState(0);

  useEffect(() => {
    fetch("/api/teacher/onboarding").then(r => r.json()).then(d => {
      if (d.ok) setStages(d.stages);
    }).catch(() => {});
    fetch("/api/teacher/concepts").then(r => r.json()).then(d => {
      if (d.ok) setConcepts(d.concepts);
    }).catch(() => {});
  }, []);

  // -- Progress helpers --
  const currentStage = stages.find(s => s.id === progress.currentStage);
  const completionPct = stages.length > 0
    ? Math.round((progress.completedStages.length / stages.length) * 100) : 0;

  const updateProgress = useCallback((next: Progress) => {
    setProgress(next);
    save(PROGRESS_KEY, next);
  }, []);

  const completeCurrentStage = useCallback(() => {
    if (!currentStage) return;
    const conceptsToAdd = currentStage.requiredConcepts.filter(c => !progress.completedConcepts.includes(c));
    updateProgress({
      ...progress,
      completedStages: [...progress.completedStages, currentStage.id],
      completedConcepts: [...progress.completedConcepts, ...conceptsToAdd],
      currentStage: currentStage.nextStage ?? progress.currentStage,
    });
  }, [currentStage, progress, updateProgress]);

  const skipCurrentStage = useCallback(() => {
    if (!currentStage) return;
    updateProgress({
      ...progress,
      skippedStages: [...(progress.skippedStages ?? []), currentStage.id],
      currentStage: currentStage.nextStage ?? progress.currentStage,
    });
  }, [currentStage, progress, updateProgress]);

  const resetAll = useCallback(() => {
    updateProgress(defaultProgress);
  }, [updateProgress]);

  // -- Settings helpers --
  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    save(SETTINGS_KEY, next);
  }, []);

  const finishWizard = useCallback(() => {
    updateSettings({ ...settings, firstRunCompleted: true });
    setView("onboarding");
  }, [settings, updateSettings]);

  // -- Concept detail --
  const loadConceptDetail = useCallback(async (id: string) => {
    if (expandedConcept === id) { setExpandedConcept(null); setConceptDetail(null); return; }
    setExpandedConcept(id);
    try {
      const res = await fetch(`/api/teacher/concepts/${id}`);
      const data = await res.json();
      setConceptDetail(data.ok ? data.concept : null);
    } catch { setConceptDetail(null); }
  }, [expandedConcept]);

  // -- Ask --
  const askSquidley = useCallback(async (question?: string) => {
    const q = (question ?? askInput).trim();
    if (!q) return;
    if (question) setAskInput(question);
    try {
      const res = await fetch("/api/teacher/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      setAskResult(await res.json());
    } catch { setAskResult({ ok: false, error: "Could not reach teacher API." }); }
  }, [askInput]);

  // -- Render --
  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">Squidley teaches AI agents step by step</h1>
      <p className="text-sm text-gray-600 mb-4">
        Local Mode: active | Cloud Mode: planned / not implemented
      </p>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b pb-2 flex-wrap">
        {(!settings.firstRunCompleted || view === "wizard") && (
          <TabBtn active={view === "wizard"} onClick={() => setView("wizard")}>Get Started</TabBtn>
        )}
        <TabBtn active={view === "onboarding"} onClick={() => setView("onboarding")}>Learning Path</TabBtn>
        <TabBtn active={view === "concepts"} onClick={() => setView("concepts")}>Concepts</TabBtn>
        <TabBtn active={view === "ask"} onClick={() => setView("ask")}>Ask Squidley</TabBtn>
        <TabBtn active={view === "settings"} onClick={() => setView("settings")}>Settings</TabBtn>
      </div>

      {/* ================================================================== */}
      {/* WIZARD (first-run onboarding) */}
      {/* ================================================================== */}
      {view === "wizard" && (
        <section>
          <div className="text-xs text-gray-400 mb-2">
            Step {wizardStep + 1} of {WIZARD_STEPS.length}
          </div>
          <div className="border rounded p-5 mb-4">
            <h2 className="font-bold text-lg mb-2">{WIZARD_STEPS[wizardStep].title}</h2>
            <div className="text-sm whitespace-pre-line leading-relaxed">
              {WIZARD_STEPS[wizardStep].body}
            </div>
          </div>
          <div className="flex gap-2">
            {wizardStep > 0 && (
              <button onClick={() => setWizardStep(s => s - 1)}
                className="px-3 py-1 bg-gray-200 rounded text-sm">Back</button>
            )}
            {wizardStep < WIZARD_STEPS.length - 1 ? (
              <button onClick={() => setWizardStep(s => s + 1)}
                className="px-3 py-1 bg-blue-500 text-white rounded text-sm">Next</button>
            ) : (
              <button onClick={finishWizard}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm">Done — start learning</button>
            )}
            {wizardStep < WIZARD_STEPS.length - 1 && (
              <button onClick={finishWizard}
                className="px-3 py-1 text-gray-500 text-sm">Skip intro</button>
            )}
          </div>
        </section>
      )}

      {/* ================================================================== */}
      {/* LEARNING PATH */}
      {/* ================================================================== */}
      {view === "onboarding" && (
        <section>
          <div className="mb-4">
            <div className="text-sm text-gray-500 mb-1">
              Progress: {completionPct}% ({progress.completedStages.length}/{stages.length} stages)
              {progress.completedConcepts.length > 0 && (
                <span className="ml-2">| {progress.completedConcepts.length} concepts learned</span>
              )}
            </div>
            <div className="w-full bg-gray-200 rounded h-2">
              <div className="bg-blue-500 rounded h-2 transition-all" style={{ width: `${completionPct}%` }} />
            </div>
          </div>

          {currentStage ? (
            <div className="border rounded p-4 mb-4">
              <h2 className="font-bold text-lg mb-1">{currentStage.title}</h2>
              <p className="text-sm text-gray-600 mb-2">{currentStage.objective}</p>
              <div className="bg-blue-50 rounded p-3 mb-3 text-sm leading-relaxed">
                {currentStage.squidleyExplanation}
              </div>
              <p className="text-xs text-gray-500 mb-3">What to do: {currentStage.userAction}</p>
              {currentStage.requiredConcepts.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {currentStage.requiredConcepts.map(c => (
                    <span key={c} className="text-xs px-2 py-0.5 bg-gray-100 rounded">{c}</span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={completeCurrentStage}
                  className="px-3 py-1 bg-blue-500 text-white rounded text-sm">Mark Complete</button>
                <button onClick={skipCurrentStage}
                  className="px-3 py-1 bg-gray-200 rounded text-sm">Skip</button>
                <button onClick={resetAll}
                  className="px-3 py-1 bg-gray-100 rounded text-sm text-gray-500">Reset</button>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 mb-4">
              <p>All stages viewed.</p>
              <button onClick={resetAll} className="text-blue-500 text-sm mt-1">Reset progress</button>
            </div>
          )}

          <ul className="space-y-1 text-sm">
            {stages.map(s => {
              const done = progress.completedStages.includes(s.id);
              const skipped = (progress.skippedStages ?? []).includes(s.id);
              const current = s.id === progress.currentStage;
              return (
                <li key={s.id} className={`flex items-center gap-2 ${current ? "font-medium" : ""}`}>
                  <span className="w-4 text-center">{done ? "\u2713" : skipped ? "\u2013" : "\u00b7"}</span>
                  <span className={done ? "text-green-700" : skipped ? "text-gray-400" : ""}>{s.title}</span>
                  {current && <span className="text-xs text-blue-500">(current)</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ================================================================== */}
      {/* CONCEPTS (glossary with explain-this) */}
      {/* ================================================================== */}
      {view === "concepts" && (
        <section>
          <h2 className="font-bold mb-1">Concept Glossary</h2>
          <p className="text-xs text-gray-500 mb-3">
            Tap any term for a beginner-friendly explanation.
          </p>
          <ul className="space-y-2">
            {concepts.map(c => (
              <li key={c.id} className="border rounded p-2">
                <button onClick={() => loadConceptDetail(c.id)} className="w-full text-left">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-sm text-gray-500 ml-2">{c.plainLanguageDefinition}</span>
                </button>
                {expandedConcept === c.id && conceptDetail && (
                  <div className="mt-2 pl-3 border-l-2 border-blue-200 text-sm space-y-2">
                    <p>{conceptDetail.beginnerExplanation}</p>
                    {conceptDetail.examples.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-gray-500">Examples: </span>
                        <span className="text-xs text-gray-600">{conceptDetail.examples.join(" | ")}</span>
                      </div>
                    )}
                    {conceptDetail.commonMisunderstandings.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-gray-500">Common misunderstanding: </span>
                        <span className="text-xs text-gray-600">{conceptDetail.commonMisunderstandings[0]}</span>
                      </div>
                    )}
                    {conceptDetail.checkYourUnderstandingQuestions.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-gray-500">Check: </span>
                        <span className="text-xs text-gray-600">{conceptDetail.checkYourUnderstandingQuestions[0]}</span>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ================================================================== */}
      {/* ASK SQUIDLEY */}
      {/* ================================================================== */}
      {view === "ask" && (
        <section>
          <h2 className="font-bold mb-1">Ask Squidley</h2>
          <p className="text-xs text-gray-500 mb-3">
            Answers come from the Teacher Layer. No model call. No cloud call.
          </p>
          <div className="flex gap-2 mb-4">
            <input type="text" value={askInput}
              onChange={e => setAskInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && askSquidley()}
              placeholder="e.g. What is a token?"
              className="flex-1 border rounded px-3 py-2 text-sm" />
            <button onClick={() => askSquidley()}
              className="px-3 py-2 bg-blue-500 text-white rounded text-sm">Ask</button>
          </div>

          {askResult && (askResult as { ok?: boolean }).ok && (
            <div className="border rounded p-3 text-sm mb-4">
              <div className="whitespace-pre-wrap mb-2 leading-relaxed">
                {(askResult as { answer: string }).answer}
              </div>
              {Array.isArray((askResult as { conceptsCovered?: unknown }).conceptsCovered) &&
                ((askResult as { conceptsCovered: string[] }).conceptsCovered).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {((askResult as { conceptsCovered: string[] }).conceptsCovered).map((c: string) => (
                    <span key={c} className="text-xs px-2 py-0.5 bg-blue-50 rounded">{c}</span>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">
                Source: teacher_layer | No cloud call | No model call
              </p>
            </div>
          )}
          {askResult && !(askResult as { ok?: boolean }).ok && (
            <p className="text-red-500 text-sm mb-4">Could not answer that question. Try rephrasing.</p>
          )}

          <div>
            <p className="text-xs text-gray-500 mb-2">Try asking:</p>
            <div className="flex flex-wrap gap-1">
              {[
                "What are you?",
                "What is a tool call?",
                "What is a token?",
                "What is Local Mode?",
                "What is Cloud Mode?",
                "What can you do?",
                "What is a receipt?",
                "Did anything leave my computer?",
                "Why can't you write files?",
                "How do I start?",
              ].map(q => (
                <button key={q} onClick={() => askSquidley(q)}
                  className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">{q}</button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================== */}
      {/* SETTINGS */}
      {/* ================================================================== */}
      {view === "settings" && (
        <section>
          <h2 className="font-bold mb-3">Teaching Settings</h2>
          <div className="space-y-3">
            <SettingToggle
              label="Teach while chatting"
              description="Show short teaching notes alongside model answers in Colloquium."
              checked={settings.teachWhileChatting}
              onChange={v => updateSettings({ ...settings, teachWhileChatting: v })}
            />
            <SettingToggle
              label="In-context teaching cards"
              description="Show contextual explanation cards when events like 'not implemented' or 'no cloud call' occur."
              checked={settings.showInContextCards}
              onChange={v => updateSettings({ ...settings, showInContextCards: v })}
            />
            <SettingToggle
              label="Explain-this helpers"
              description="Show explanation tooltips on status labels like 'Local Mode' and 'no cloud'."
              checked={settings.showExplainHelpers}
              onChange={v => updateSettings({ ...settings, showExplainHelpers: v })}
            />
            <div className="border-t pt-3 mt-3">
              <button onClick={() => { setView("wizard"); setWizardStep(0); }}
                className="text-sm text-blue-500">Replay first-run introduction</button>
            </div>
            <div>
              <button onClick={() => {
                updateSettings(defaultSettings);
                updateProgress(defaultProgress);
                setView("wizard");
                setWizardStep(0);
              }} className="text-sm text-gray-500">Reset all teaching progress</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 rounded-t text-sm ${active ? "bg-blue-100 font-medium" : "text-gray-500 hover:text-gray-700"}`}>
      {children}
    </button>
  );
}

function SettingToggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="mt-1 accent-blue-500" />
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
    </label>
  );
}
