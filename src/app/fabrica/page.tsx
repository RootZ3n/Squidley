"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CompanionTourPanel } from "@/components/CompanionTourPanel";
import { LocalStatusNote } from "@/components/LocalStatusNote";
import { RatioCapabilityNote } from "@/components/RatioCapabilityNote";
import { TourHighlight } from "@/components/TourHighlight";
import {
  createArchivumEntryFromFabricaSuggestion,
  loadArchivum,
  saveArchivum,
  upsertArchivumEntry,
} from "@/lib/archivum/storage";
import { markTourCompleted, readTourMode, restartTour as persistRestartTour } from "@/lib/firstRun";
import { getTour } from "@/lib/tour";
import type { LocalModelInfo } from "@/lib/providers/ollama";
import {
  loadModelPreferences,
  resolveFabricaBuildModel,
  saveModelPreferences,
  setModuleModelPreference,
} from "@/lib/nous/modelPreferences";
import { logTabulariumReceipt } from "@/lib/tabularium/receipts";
import { logPromptGatewayReceipt, tabulariumReceiptUrl } from "@/lib/tabularium/gatewayReceipts";
import { fabricaMultiFileBuildDecision, fabricaSingleFileSuggestionDecision } from "@/lib/ratio";
import {
  buildFabricaOutputCopiedReceipt,
  buildFabricaOutputExportedReceipt,
  buildFabricaSuggestionFailedReceipt,
  buildFabricaSuggestionSavedToArchivumReceipt,
  buildFabricaSuggestionStartedReceipt,
  buildFabricaSuggestionSucceededReceipt,
} from "@/lib/fabrica/receipts";
import { buildNousModelPreferenceChangedReceipt } from "@/lib/nous/receipts";

const LANGUAGE_OPTIONS = ["text", "html", "css", "javascript", "typescript", "json", "markdown", "python", "other"];

export default function FabricaPage() {
  const [fileName, setFileName] = useState("");
  const [language, setLanguage] = useState("text");
  const [originalContent, setOriginalContent] = useState("");
  const [requestedChange, setRequestedChange] = useState("");
  const [models, setModels] = useState<LocalModelInfo[]>([]);
  const [configuredModel, setConfiguredModel] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [loadingModels, setLoadingModels] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [safetyReceipt, setSafetyReceipt] = useState<{ message: string; href: string } | null>(null);
  const [tourActive, setTourActive] = useState(false);
  const [tourRunId, setTourRunId] = useState(0);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const tour = useMemo(() => getTour("fabrica")!, []);
  const singleFileRatio = useMemo(
    () => fabricaSingleFileSuggestionDecision(selectedModel),
    [selectedModel],
  );
  const multiFileRatio = useMemo(
    () => fabricaMultiFileBuildDecision(selectedModel),
    [selectedModel],
  );

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("tour") === "1";
    setTourActive(fromQuery || readTourMode() === "on");
    void loadModels();
  }, []);

  async function loadModels() {
    setLoadingModels(true);
    try {
      const response = await fetch("/api/local/models");
      const body = await response.json();
      const discovered: LocalModelInfo[] = Array.isArray(body.models) ? body.models : [];
      const configured = body.configuredModel ?? body.defaultModel ?? "";
      const preferences = loadModelPreferences(window.localStorage);
      const resolved = resolveFabricaBuildModel({
        preferences,
        models: discovered,
        configuredModel: configured,
      });
      setModels(discovered);
      setConfiguredModel(configured);
      setSelectedModel(resolved);
    } catch {
      setModels([]);
      setConfiguredModel("");
      setSelectedModel("");
    } finally {
      setLoadingModels(false);
    }
  }

  function handleRestartTour() {
    persistRestartTour();
    setTourRunId((n) => n + 1);
    setTourActive(true);
  }

  function handleEndTour() {
    markTourCompleted();
    setTourActive(false);
    setActiveTarget(null);
  }

  function handleModelChange(model: string) {
    setSelectedModel(model);
    const next = setModuleModelPreference(
      loadModelPreferences(window.localStorage),
      "fabrica",
      "buildModel",
      model,
    );
    saveModelPreferences(window.localStorage, next);
    logTabulariumReceipt(window.localStorage, buildNousModelPreferenceChangedReceipt({
      moduleId: "fabrica",
      role: "buildModel",
      model,
      title: "Fabrica local model preference changed",
      summary: "The Fabrica page saved a browser-local preferred single-file suggestion model. No cloud provider was enabled.",
    }));
  }

  async function generateSuggestion() {
    if (generating || !selectedModel || requestedChange.trim().length === 0) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    setSafetyReceipt(null);
    setSuggestion("");
    const startedAt = Date.now();
    logTabulariumReceipt(window.localStorage, buildFabricaSuggestionStartedReceipt({ model: selectedModel }));

    try {
      const response = await fetch("/api/fabrica/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          language,
          originalContent,
          requestedChange,
          model: selectedModel,
        }),
      });
      const body = await response.json();
      if (body.promptGateway) {
        const gatewayReceiptId = logPromptGatewayReceipt(window.localStorage, {
          module: "fabrica",
          route: "/api/fabrica/suggest",
          metadata: body.promptGateway,
          modelUsed: Boolean(response.ok && body.ok),
          dedupeKey: String(startedAt),
        });
        if (gatewayReceiptId) {
          setSafetyReceipt({
            message: response.ok && body.ok
              ? "Prompt Gateway added a safety caution before Fabrica used the local model."
              : "Squidley paused this request to protect your local setup.",
            href: tabulariumReceiptUrl(gatewayReceiptId),
          });
        }
      }
      if (!response.ok || !body.ok) {
        throw new Error(body.error?.message ?? "Fabrica could not create a local suggestion.");
      }
      setSuggestion(body.suggestion);
      logTabulariumReceipt(window.localStorage, buildFabricaSuggestionSucceededReceipt({
        model: body.model ?? selectedModel,
        summary: body.summary,
        durationMs: Date.now() - startedAt,
        outputChars: String(body.suggestion ?? "").length,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fabrica could not create a local suggestion.";
      setError(message);
      logTabulariumReceipt(window.localStorage, buildFabricaSuggestionFailedReceipt({
        model: selectedModel,
        message,
      }));
    } finally {
      setGenerating(false);
    }
  }

  async function copyOutput() {
    if (!suggestion) return;
    try {
      await navigator.clipboard.writeText(suggestion);
      setNotice("Copied the suggested output. Review it before using it.");
      logTabulariumReceipt(window.localStorage, buildFabricaOutputCopiedReceipt());
    } catch {
      setError("The browser could not copy the suggestion automatically.");
    }
  }

  function exportOutput() {
    if (!suggestion) return;
    const safeName = fileName.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "fabrica-suggestion.txt";
    const blob = new Blob([suggestion], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName.includes(".") ? safeName : `${safeName}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    logTabulariumReceipt(window.localStorage, buildFabricaOutputExportedReceipt());
  }

  function saveSuggestionToArchivum() {
    if (!suggestion) return;
    try {
      const title = fileName.trim() ? `Fabrica suggestion: ${fileName.trim()}` : "Fabrica suggestion";
      const entry = createArchivumEntryFromFabricaSuggestion({
        title,
        text: suggestion,
        tags: "fabrica, suggestion",
        type: "note",
      });
      const doc = loadArchivum(window.localStorage);
      saveArchivum(window.localStorage, upsertArchivumEntry(doc, entry));
      setNotice("Saved to Archivum as a note. It was not written as an executable file.");
      logTabulariumReceipt(window.localStorage, buildFabricaSuggestionSavedToArchivumReceipt({
        entryId: entry.id,
      }));
    } catch {
      setError("Fabrica could not save the suggestion to Archivum in this browser.");
      logTabulariumReceipt(window.localStorage, buildFabricaSuggestionSavedToArchivumReceipt({
        failed: true,
      }));
    }
  }

  function clearAll() {
    setFileName("");
    setLanguage("text");
    setOriginalContent("");
    setRequestedChange("");
    setSuggestion("");
    setNotice(null);
    setError(null);
    setSafetyReceipt(null);
  }

  const canGenerate = selectedModel.length > 0 && requestedChange.trim().length > 0 && !generating;

  return (
    <div className="sq-page mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TourHighlight target="intro" active={activeTarget}>
        <header className="border-b border-ink-200 pb-5 dark:border-ink-700">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-iris-600 dark:text-iris-300">
            Squidley · Fabrica
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-ink-900 dark:text-ink-50">
            Beginner single-file workshop
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600 dark:text-ink-300">
            Fabrica is Squidley&rsquo;s beginner workshop. Paste or draft one file,
            describe a small change, and Squidley can suggest an updated version for you to review.
          </p>
          <TourHighlight target="local-only-indicator" active={activeTarget}>
            <div className="mt-3">
              <LocalStatusNote variant="localOnly" />
            </div>
          </TourHighlight>
          <nav className="mt-4 flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={handleRestartTour} className="rounded-lg border border-iris-200 bg-white px-3 py-1.5 font-medium text-iris-700 shadow-sm hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-800 dark:text-iris-100">
              Restart tour
            </button>
            {[
              ["/colloquium", "Colloquium"],
              ["/velum", "Velum"],
              ["/archivum", "Archivum"],
              ["/tabularium", "Tabularium"],
              ["/nous", "Nous"],
              ["/modules", "Modules"],
              ["/settings", "Settings"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
                {label}
              </Link>
            ))}
          </nav>
        </header>
      </TourHighlight>

      {error && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">{error}</p>}
      {notice && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100">{notice}</p>}
      {safetyReceipt && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
          <p>{safetyReceipt.message}</p>
          <p className="mt-1 text-xs">
            The safety receipt explains what category was detected without saving your full prompt.
          </p>
          <Link href={safetyReceipt.href} className="mt-2 inline-flex font-medium underline decoration-dotted">
            View safety receipt
          </Link>
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <RatioCapabilityNote decision={singleFileRatio} title="Ratio: single-file suggestion" compact />
        <RatioCapabilityNote decision={multiFileRatio} title="Ratio: multi-file build" compact />
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <TourHighlight target="fabrica-inputs" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
            <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">One file</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-100">
                File name optional
                <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="example: index.html" className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" />
              </label>
              <label className="text-sm font-medium text-ink-700 dark:text-ink-100">
                Type
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50">
                  {LANGUAGE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium text-ink-700 dark:text-ink-100">
              Original content
              <textarea value={originalContent} onChange={(e) => setOriginalContent(e.target.value)} rows={12} placeholder="Paste one file here, or leave blank to start from scratch." className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 font-mono text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" />
            </label>
          </TourHighlight>

          <TourHighlight target="fabrica-change" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
            <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">Small change</h2>
            <textarea value={requestedChange} onChange={(e) => setRequestedChange(e.target.value)} rows={5} placeholder="Describe one small change or ask for a simple single-file draft." className="mt-3 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void generateSuggestion()} disabled={!canGenerate} className="rounded-lg bg-squid-600 px-4 py-2 text-sm font-medium text-white hover:bg-squid-700 disabled:cursor-not-allowed disabled:opacity-50">
                {generating ? "Generating locally..." : "Generate suggestion"}
              </button>
              <button type="button" onClick={clearAll} disabled={generating} className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
                Clear
              </button>
            </div>
          </TourHighlight>
        </div>

        <aside className="space-y-4">
          <TourHighlight target="fabrica-model" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">Local model</h2>
            <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
              Fabrica uses the Fabrica model preference from Nous. If none is saved, it falls back to the Colloquium/local default model.
            </p>
            <select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)} disabled={models.length === 0 || loadingModels || generating} className="mt-3 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50">
              {models.length === 0 ? <option value="">No local models</option> : models.map((model) => <option key={model.name} value={model.name}>{model.displayName}</option>)}
            </select>
            <p className="mt-2 text-xs text-ink-400">Configured default: {configuredModel || "not discovered"}</p>
            <Link href="/nous" className="mt-3 inline-block text-xs font-medium text-iris-600 underline decoration-dotted underline-offset-4 dark:text-iris-300">
              Change in Nous
            </Link>
          </TourHighlight>

          <TourHighlight target="fabrica-limits" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">Public limits</h2>
            <ul className="mt-3 space-y-2 text-xs text-ink-500 dark:text-ink-300">
              <li>Single-file suggestions only.</li>
              <li>No repo-wide edits.</li>
              <li>No shell commands or tools.</li>
              <li>No automatic file writes.</li>
              <li>You review, copy, or export the result yourself.</li>
            </ul>
          </TourHighlight>
        </aside>
      </section>

      <TourHighlight target="fabrica-output" active={activeTarget} className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">Suggested output</h2>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">Review this carefully. Squidley has not saved or written anything.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyOutput()} disabled={!suggestion} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">Copy output</button>
            <button type="button" onClick={exportOutput} disabled={!suggestion} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">Export output</button>
            <button type="button" onClick={saveSuggestionToArchivum} disabled={!suggestion} className="rounded-lg border border-iris-200 bg-white px-3 py-2 text-sm font-medium text-iris-700 hover:bg-iris-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100">Save to Archivum note</button>
          </div>
        </div>
        {suggestion ? (
          <pre className="mt-3 max-h-[520px] overflow-auto rounded-lg border border-ink-100 bg-ink-950 p-4 text-sm text-ink-50"><code>{suggestion}</code></pre>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-ink-200 bg-ink-50/70 px-3 py-4 text-center text-sm text-ink-500 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-300">No suggestion yet.</p>
        )}
      </TourHighlight>

      {tourActive && <CompanionTourPanel key={tourRunId} tour={tour} onActiveTargetChange={setActiveTarget} onClose={handleEndTour} onFinish={handleEndTour} />}
    </div>
  );
}
