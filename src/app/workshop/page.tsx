"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CompanionTourPanel } from "@/components/CompanionTourPanel";
import { CloudEscalationConsentDialog } from "@/components/capabilities/CloudEscalationConsentDialog";
import { LocalStatusNote } from "@/components/LocalStatusNote";
import { AssessmentCapabilityNote } from "@/components/AssessmentCapabilityNote";
import { TourHighlight } from "@/components/TourHighlight";
import {
  createNotebookEntryFromWorkshopSuggestion,
  loadNotebook,
  saveNotebook,
  upsertNotebookEntry,
} from "@/lib/notebook/storage";
import { createCloudConsentDialogHandlers } from "@/lib/capabilities/cloudConsentOrchestration";
import type { GuardedCloudPreflightResult } from "@/lib/capabilities/guardedCloudPreflight";
import { runWorkshopMultiFileBuildCloudPreflight } from "@/lib/workshop/cloudPreflight";
import { workshopPreflightStatusCopy, workshopConsentStatusCopy, type WorkshopCloudPreflightStatusCopy } from "@/lib/workshop/cloudPreflightStatus";
import { recordWorkshopVelumHandoffPreparedReceipt, recordWorkshopVelumReviewCompletedReceipt } from "@/lib/workshop/velumHandoff";
import { markTourCompleted, readTourMode, restartTour as persistRestartTour } from "@/lib/firstRun";
import { getTour } from "@/lib/tour";
import type { LocalModelInfo } from "@/lib/providers/ollama";
import {
  loadModelPreferences,
  resolveWorkshopBuildModel,
  saveModelPreferences,
  setModuleModelPreference,
} from "@/lib/insights/modelPreferences";
import { logActivityReceipt } from "@/lib/activity-log/receipts";
import { logPromptGatewayReceipt, activityReceiptUrl } from "@/lib/activity-log/gatewayReceipts";
import { fabricaMultiFileBuildDecision, fabricaSingleFileSuggestionDecision } from "@/lib/assessment";
import {
  buildWorkshopOutputCopiedReceipt,
  buildWorkshopOutputExportedReceipt,
  buildWorkshopSuggestionFailedReceipt,
  buildWorkshopSuggestionSavedToNotebookReceipt,
  buildWorkshopSuggestionStartedReceipt,
  buildWorkshopSuggestionSucceededReceipt,
} from "@/lib/workshop/receipts";
import { buildInsightsModelPreferenceChangedReceipt } from "@/lib/insights/receipts";

const LANGUAGE_OPTIONS = ["text", "html", "css", "javascript", "typescript", "json", "markdown", "python", "other"];

export default function WorkshopPage() {
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
  const [cloudStatusCopy, setCloudStatusCopy] = useState<WorkshopCloudPreflightStatusCopy | null>(null);
  const [cloudPreflightResult, setCloudPreflightResult] = useState<GuardedCloudPreflightResult | null>(null);
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [velumHandoffPrepared, setVelumHandoffPrepared] = useState(false);
  const [velumReviewPassed, setVelumReviewPassed] = useState(false);
  const [velumReviewNotice, setVelumReviewNotice] = useState<string | null>(null);
  const tour = useMemo(() => getTour("workshop")!, []);
  const singleFileAssessment = useMemo(
    () => fabricaSingleFileSuggestionDecision(selectedModel),
    [selectedModel],
  );
  const multiFileAssessment = useMemo(
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
      const resolved = resolveWorkshopBuildModel({
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
      "workshop",
      "buildModel",
      model,
    );
    saveModelPreferences(window.localStorage, next);
    logActivityReceipt(window.localStorage, buildInsightsModelPreferenceChangedReceipt({
      moduleId: "workshop",
      role: "buildModel",
      model,
      title: "Workshop local model preference changed",
      summary: "The Workshop page saved a browser-local preferred single-file suggestion model. No cloud provider was enabled.",
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
    logActivityReceipt(window.localStorage, buildWorkshopSuggestionStartedReceipt({ model: selectedModel }));

    try {
      const response = await fetch("/api/workshop/suggest", {
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
          module: "workshop",
          route: "/api/workshop/suggest",
          metadata: body.promptGateway,
          modelUsed: Boolean(response.ok && body.ok),
          dedupeKey: String(startedAt),
        });
        if (gatewayReceiptId) {
          setSafetyReceipt({
            message: response.ok && body.ok
              ? "Prompt Gateway added a safety caution before Workshop used the local model."
              : "Peh paused this request to protect your local setup.",
            href: activityReceiptUrl(gatewayReceiptId),
          });
        }
      }
      if (!response.ok || !body.ok) {
        throw new Error(body.error?.message ?? "Workshop could not create a local suggestion.");
      }
      setSuggestion(body.suggestion);
      logActivityReceipt(window.localStorage, buildWorkshopSuggestionSucceededReceipt({
        model: body.model ?? selectedModel,
        summary: body.summary,
        durationMs: Date.now() - startedAt,
        outputChars: String(body.suggestion ?? "").length,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Workshop could not create a local suggestion.";
      setError(message);
      logActivityReceipt(window.localStorage, buildWorkshopSuggestionFailedReceipt({
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
      logActivityReceipt(window.localStorage, buildWorkshopOutputCopiedReceipt());
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
    logActivityReceipt(window.localStorage, buildWorkshopOutputExportedReceipt());
  }

  function saveSuggestionToNotebook() {
    if (!suggestion) return;
    try {
      const title = fileName.trim() ? `Workshop suggestion: ${fileName.trim()}` : "Workshop suggestion";
      const entry = createNotebookEntryFromWorkshopSuggestion({
        title,
        text: suggestion,
        tags: "workshop, suggestion",
        type: "note",
      });
      const doc = loadNotebook(window.localStorage);
      saveNotebook(window.localStorage, upsertNotebookEntry(doc, entry));
      setNotice("Saved to Notebook as a note. It was not written as an executable file.");
      logActivityReceipt(window.localStorage, buildWorkshopSuggestionSavedToNotebookReceipt({
        entryId: entry.id,
      }));
    } catch {
      setError("Workshop could not save the suggestion to Notebook in this browser.");
      logActivityReceipt(window.localStorage, buildWorkshopSuggestionSavedToNotebookReceipt({
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

  function handlePrepareVelumHandoff() {
    recordWorkshopVelumHandoffPreparedReceipt(window.localStorage);
    setVelumHandoffPrepared(true);
  }

  function handleMarkVelumReviewPassed() {
    recordWorkshopVelumReviewCompletedReceipt(window.localStorage);
    setVelumReviewPassed(true);
    setVelumReviewNotice(
      "Velum review marked complete locally. You can rerun preflight to offer cloud consent. Nothing has been sent.",
    );
  }

  function handleMultiFileBuildClick() {
    setCloudStatusCopy(null);
    setConsentDialogOpen(false);
    setCloudPreflightResult(null);
    setVelumHandoffPrepared(false);
    setVelumReviewNotice(null);

    const result = runWorkshopMultiFileBuildCloudPreflight({
      velumReviewPassed,
      recordReceipts: true,
      storage: window.localStorage,
    });
    setCloudPreflightResult(result);

    const copy = workshopPreflightStatusCopy(
      result.blockedBy,
      result.allowedToOfferCloud,
    );

    if (result.allowedToOfferCloud && result.escalationPacket) {
      setConsentDialogOpen(true);
      setCloudStatusCopy(copy);
    } else {
      setCloudStatusCopy(copy);
    }
  }

  function handleConsentGrant() {
    if (!cloudPreflightResult?.escalationPacket) return;
    const handlers = createCloudConsentDialogHandlers(
      window.localStorage,
      cloudPreflightResult.escalationPacket,
    );
    handlers.handleGrant();
    setConsentDialogOpen(false);
    setCloudStatusCopy(workshopConsentStatusCopy("granted"));
  }

  function handleConsentDeny() {
    if (!cloudPreflightResult?.escalationPacket) return;
    const handlers = createCloudConsentDialogHandlers(
      window.localStorage,
      cloudPreflightResult.escalationPacket,
    );
    handlers.handleDeny();
    setConsentDialogOpen(false);
    setCloudStatusCopy(workshopConsentStatusCopy("denied"));
  }

  function handleConsentClose() {
    if (!cloudPreflightResult?.escalationPacket) return;
    const handlers = createCloudConsentDialogHandlers(
      window.localStorage,
      cloudPreflightResult.escalationPacket,
    );
    handlers.handleCancel();
    setConsentDialogOpen(false);
    setCloudStatusCopy(workshopConsentStatusCopy("cancelled"));
  }

  const canGenerate = selectedModel.length > 0 && requestedChange.trim().length > 0 && !generating;

  return (
    <div className="sq-page mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TourHighlight target="intro" active={activeTarget}>
        <header className="border-b border-ink-200 pb-5 dark:border-ink-700">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-iris-600 dark:text-iris-300">
            Peh · Workshop
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-ink-900 dark:text-ink-50">
            Beginner single-file workshop
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600 dark:text-ink-300">
            Workshop is Peh&rsquo;s beginner workshop. Paste or draft one file,
            describe a small change, and Peh can suggest an updated version for you to review.
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
              ["/chat", "Chat"],
              ["/velum", "Velum"],
              ["/notebook", "Notebook"],
              ["/activity-log", "ActivityLog"],
              ["/insights", "Insights"],
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
        <AssessmentCapabilityNote decision={singleFileAssessment} title="Assessment: single-file suggestion" compact />
        <AssessmentCapabilityNote decision={multiFileAssessment} title="Assessment: multi-file build" compact />
      </div>

      <div className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
        <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">
          Multi-file build (cloud-required)
        </h2>
        <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
          Multi-file autonomous builds require a future Cloud Agent mode. You can check the preflight gate to see what would happen.
        </p>
        <button
          type="button"
          onClick={handleMultiFileBuildClick}
          className="mt-3 rounded-lg border border-iris-200 bg-white px-4 py-2 text-sm font-medium text-iris-700 shadow-sm hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100"
        >
          Check multi-file build preflight
        </button>
        {cloudStatusCopy && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
            <p>{cloudStatusCopy.message}</p>
            {cloudPreflightResult?.blockedBy === "velum-required" && !velumHandoffPrepared && (
              <button
                type="button"
                onClick={handlePrepareVelumHandoff}
                className="mt-2 rounded-lg border border-iris-200 bg-white px-3 py-1.5 text-xs font-medium text-iris-700 shadow-sm hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100"
              >
                Review with Velum first
              </button>
            )}
            {cloudPreflightResult?.blockedBy === "velum-required" && velumHandoffPrepared && (
              <div className="mt-2">
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Velum review preparation recorded. Nothing has been sent.
                </p>
                <Link
                  href="/velum"
                  className="mt-1 inline-block text-xs font-medium text-iris-600 underline decoration-dotted underline-offset-4 dark:text-iris-300"
                >
                  Open Velum
                </Link>
                {!velumReviewPassed && (
                  <button
                    type="button"
                    onClick={handleMarkVelumReviewPassed}
                    className="mt-2 block rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 dark:border-emerald-700/60 dark:bg-ink-900 dark:text-emerald-100"
                  >
                    I completed Velum review
                  </button>
                )}
              </div>
            )}
            {velumReviewNotice && (
              <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                {velumReviewNotice}
              </p>
            )}
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              {cloudStatusCopy.activityLogHint}{" "}
              <Link href="/activity-log" className="font-medium text-iris-600 underline decoration-dotted underline-offset-4 dark:text-iris-300">
                View in ActivityLog
              </Link>
            </p>
          </div>
        )}
      </div>

      {consentDialogOpen && cloudPreflightResult?.escalationPacket && (
        <CloudEscalationConsentDialog
          packet={cloudPreflightResult.escalationPacket}
          open={consentDialogOpen}
          onGrant={handleConsentGrant}
          onDeny={handleConsentDeny}
          onClose={handleConsentClose}
        />
      )}

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <TourHighlight target="workshop-inputs" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
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

          <TourHighlight target="workshop-change" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
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
          <TourHighlight target="workshop-model" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">Local model</h2>
            <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
              Workshop uses the Workshop model preference from Insights. If none is saved, it falls back to the Chat/local default model.
            </p>
            <select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)} disabled={models.length === 0 || loadingModels || generating} className="mt-3 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50">
              {models.length === 0 ? <option value="">No local models</option> : models.map((model) => <option key={model.name} value={model.name}>{model.displayName}</option>)}
            </select>
            <p className="mt-2 text-xs text-ink-400">Configured default: {configuredModel || "not discovered"}</p>
            <Link href="/insights" className="mt-3 inline-block text-xs font-medium text-iris-600 underline decoration-dotted underline-offset-4 dark:text-iris-300">
              Change in Insights
            </Link>
          </TourHighlight>

          <TourHighlight target="workshop-limits" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
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

      <TourHighlight target="workshop-output" active={activeTarget} className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">Suggested output</h2>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">Review this carefully. Peh has not saved or written anything.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyOutput()} disabled={!suggestion} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">Copy output</button>
            <button type="button" onClick={exportOutput} disabled={!suggestion} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">Export output</button>
            <button type="button" onClick={saveSuggestionToNotebook} disabled={!suggestion} className="rounded-lg border border-iris-200 bg-white px-3 py-2 text-sm font-medium text-iris-700 hover:bg-iris-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100">Save to Notebook note</button>
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
