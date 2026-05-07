"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CompanionTourPanel } from "@/components/CompanionTourPanel";
import { LocalStatusNote } from "@/components/LocalStatusNote";
import { RatioCapabilityNote } from "@/components/RatioCapabilityNote";
import { TourHighlight } from "@/components/TourHighlight";
import {
  createArchivumEntryFromOculusAnalysis,
  loadArchivum,
  saveArchivum,
  upsertArchivumEntry,
  type ArchivumEntryType,
} from "@/lib/archivum/storage";
import { markTourCompleted, readTourMode, restartTour as persistRestartTour } from "@/lib/firstRun";
import { getTour } from "@/lib/tour";
import type { LocalModelInfo } from "@/lib/providers/ollama";
import {
  explainSelectedModelSource,
  loadModelPreferences,
  resolveOculusVisionModel,
  saveModelPreferences,
  setModuleModelPreference,
  type ModelSourceExplanation,
} from "@/lib/nous/modelPreferences";
import { logTabulariumReceipt } from "@/lib/tabularium/receipts";
import { logPromptGatewayReceipt, tabulariumReceiptUrl } from "@/lib/tabularium/gatewayReceipts";
import {
  OCULUS_MAX_IMAGE_BYTES,
  chooseVisionModel,
  formatFileSize,
  isAcceptedOculusImageType,
  isLikelyVisionModel,
  stripDataUrlPrefix,
} from "@/lib/oculus/helpers";
import { saveOculusToColloquiumHandoff } from "@/lib/oculus/handoff";
import { oculusLocalImageAnalysisDecision } from "@/lib/ratio";
import {
  buildOculusAnalysisFailedReceipt,
  buildOculusAnalysisStartedReceipt,
  buildOculusAnalysisSucceededReceipt,
  buildOculusHandoffToColloquiumReceipt,
  buildOculusSaveAnalysisToArchivumReceipt,
} from "@/lib/oculus/receipts";
import { buildNousModelPreferenceChangedReceipt } from "@/lib/nous/receipts";

interface SelectedImage {
  file: File;
  dataUrl: string;
}

interface ModelState {
  models: LocalModelInfo[];
  configuredModel: string;
  selectedModel: string;
}

export default function OculusPage() {
  const router = useRouter();
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saveTitle, setSaveTitle] = useState("Oculus analysis");
  const [saveType, setSaveType] = useState<ArchivumEntryType>("note");
  const [saveTags, setSaveTags] = useState("oculus");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [safetyReceipt, setSafetyReceipt] = useState<{ message: string; href: string } | null>(null);
  const [models, setModels] = useState<ModelState>({ models: [], configuredModel: "", selectedModel: "" });
  const [modelSource, setModelSource] = useState<ModelSourceExplanation | null>(null);
  const [tourActive, setTourActive] = useState(false);
  const [tourRunId, setTourRunId] = useState(0);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const tour = useMemo(() => getTour("oculus")!, []);
  const selectedModel = useMemo(
    () => models.selectedModel || chooseVisionModel({
      configuredModel: models.configuredModel,
      models: models.models,
    }),
    [models],
  );
  const visionCapable = selectedModel.length > 0 && isLikelyVisionModel(selectedModel);
  const imageAnalysisRatio = useMemo(
    () => oculusLocalImageAnalysisDecision(selectedModel),
    [selectedModel],
  );

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("tour") === "1";
    setTourActive(fromQuery || readTourMode() === "on");
    void loadModels();
  }, []);

  async function loadModels() {
    try {
      const response = await fetch("/api/local/models");
      const body = await response.json();
      const discovered = Array.isArray(body.models) ? body.models : [];
      const configuredModel = body.configuredModel ?? body.defaultModel ?? "";
      const preferences = loadModelPreferences(window.localStorage);
      const selected = resolveOculusVisionModel({
        preferences,
        models: discovered,
        configuredModel,
      });
      setModels({
        models: discovered,
        configuredModel,
        selectedModel: selected,
      });
      setModelSource(explainSelectedModelSource({
        selectedModel: selected,
        models: discovered,
        preferenceModel: preferences.modules.oculus?.visionModel,
        configuredModel,
        moduleLabel: "Oculus vision",
      }));
    } catch {
      setModels({ models: [], configuredModel: "", selectedModel: "" });
      setModelSource(explainSelectedModelSource({
        selectedModel: "",
        models: [],
        moduleLabel: "Oculus vision",
      }));
    }
  }

  async function handleFile(file: File | null) {
    setError(null);
    setAnalysis("");
    setSaveNotice(null);
    setSafetyReceipt(null);
    if (!file) return;
    if (!isAcceptedOculusImageType(file.type)) {
      setError("Choose a PNG, JPG, JPEG, or WebP image.");
      return;
    }
    if (file.size > OCULUS_MAX_IMAGE_BYTES) {
      setError("That image is too large for this public Oculus pass. Choose an image under 8 MB.");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setImage({ file, dataUrl });
    setSaveTitle(`Oculus analysis: ${file.name}`.slice(0, 96));
  }

  function clearImage() {
    setImage(null);
    setAnalysis("");
    setError(null);
    setSaveNotice(null);
    setSafetyReceipt(null);
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
    setModels((prev) => ({ ...prev, selectedModel: model }));
    setModelSource(explainSelectedModelSource({
      selectedModel: model,
      models: models.models,
      moduleLabel: "Oculus vision",
      pageSelection: true,
    }));
    const next = setModuleModelPreference(
      loadModelPreferences(window.localStorage),
      "oculus",
      "visionModel",
      model,
    );
    saveModelPreferences(window.localStorage, next);
    logTabulariumReceipt(window.localStorage, buildNousModelPreferenceChangedReceipt({
      moduleId: "oculus",
      role: "visionModel",
      model,
      title: "Oculus local model preference changed",
      summary: "The Oculus page saved a browser-local preferred vision model. No cloud vision provider was enabled.",
    }));
  }

  async function analyzeImage() {
    if (!image || !visionCapable || analyzing) return;
    setAnalyzing(true);
    setError(null);
    setAnalysis("");
    setSafetyReceipt(null);
    const startedAt = Date.now();
      logTabulariumReceipt(window.localStorage, buildOculusAnalysisStartedReceipt({ model: selectedModel }));
    try {
      const response = await fetch("/api/oculus/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: stripDataUrlPrefix(image.dataUrl),
          model: selectedModel,
        }),
      });
      const body = await response.json();
      if (body.promptGateway) {
        const gatewayReceiptId = logPromptGatewayReceipt(window.localStorage, {
          module: "oculus",
          route: "/api/oculus/analyze",
          metadata: body.promptGateway,
          modelUsed: Boolean(response.ok && body.ok),
          dedupeKey: String(startedAt),
        });
        if (gatewayReceiptId) {
          setSafetyReceipt({
            message: response.ok && body.ok
              ? "Prompt Gateway added a safety caution before Oculus used the local model."
              : "Squidley paused this request to protect your local setup.",
            href: tabulariumReceiptUrl(gatewayReceiptId),
          });
        }
      }
      if (!response.ok || !body.ok) {
        throw new Error(body.error?.message ?? "Oculus could not analyze this image locally.");
      }
      setAnalysis(body.analysis);
      setSaveNotice(null);
      logTabulariumReceipt(window.localStorage, buildOculusAnalysisSucceededReceipt({
        model: body.model ?? selectedModel,
        durationMs: Date.now() - startedAt,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Oculus could not analyze this image locally.";
      setError(message);
      logTabulariumReceipt(window.localStorage, buildOculusAnalysisFailedReceipt({
        model: selectedModel,
        message,
      }));
    } finally {
      setAnalyzing(false);
    }
  }

  function sendAnalysisToColloquium() {
    if (!analysis.trim()) return;
    const ok = saveOculusToColloquiumHandoff(window.sessionStorage, analysis);
    if (!ok) {
      setError("Oculus could not prepare the analysis for Colloquium in this browser.");
      return;
    }
      logTabulariumReceipt(window.localStorage, buildOculusHandoffToColloquiumReceipt());
    router.push("/colloquium?from=oculus");
  }

  function saveAnalysisToArchivum() {
    if (!analysis.trim()) return;
    try {
      const entry = createArchivumEntryFromOculusAnalysis({
        title: saveTitle,
        type: saveType,
        text: analysis,
        tags: saveTags,
      });
      const doc = loadArchivum(window.localStorage);
      const next = upsertArchivumEntry(doc, entry);
      saveArchivum(window.localStorage, next);
      logTabulariumReceipt(window.localStorage, buildOculusSaveAnalysisToArchivumReceipt({
        model: selectedModel || undefined,
        entryId: entry.id,
        characterCount: analysis.length,
      }));
      setSaveNotice("Saved to Archivum. Only the analysis text was stored; the image was not saved.");
    } catch {
      logTabulariumReceipt(window.localStorage, buildOculusSaveAnalysisToArchivumReceipt({
        model: selectedModel || undefined,
        failed: true,
      }));
      setError("Oculus could not save the analysis to Archivum in this browser.");
    }
  }

  return (
    <div className="sq-page mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TourHighlight target="intro" active={activeTarget}>
        <header className="border-b border-ink-200 pb-5 dark:border-ink-700">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-iris-600 dark:text-iris-300">Squidley · Oculus</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-ink-900 dark:text-ink-50">Manual image review</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600 dark:text-ink-300">
            Oculus helps Squidley look at an image or screenshot you choose. Nothing is watched in the background.
          </p>
          <TourHighlight target="local-only-indicator" active={activeTarget}>
            <div className="mt-3">
              <LocalStatusNote variant="localOnly" />
            </div>
          </TourHighlight>
          <nav className="mt-4 flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={handleRestartTour} className="rounded-lg border border-iris-200 bg-white px-3 py-1.5 font-medium text-iris-700 shadow-sm hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-800 dark:text-iris-100">Restart tour</button>
            {[
              ["/colloquium", "Colloquium"],
              ["/velum", "Velum"],
              ["/archivum", "Archivum"],
              ["/nous", "Nous"],
              ["/tabularium", "Tabularium"],
              ["/modules", "Modules"],
              ["/settings", "Settings"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">{label}</Link>
            ))}
          </nav>
        </header>
      </TourHighlight>

      {error && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">{error}</p>}
      {safetyReceipt && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
          <p>{safetyReceipt.message}</p>
          <p className="mt-1 text-xs">
            The safety receipt explains what category was detected without saving your prompt or image data.
          </p>
          <Link href={safetyReceipt.href} className="mt-2 inline-flex font-medium underline decoration-dotted">
            View safety receipt
          </Link>
        </div>
      )}

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <TourHighlight target="oculus-picker" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
            <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">Choose an image</h2>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">Only choose images you are comfortable reviewing.</p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 bg-ink-50/70 px-4 py-8 text-center text-sm text-ink-500 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-300">
              <span className="font-medium text-ink-700 dark:text-ink-100">Select PNG, JPG, or WebP</span>
              <span className="mt-1 text-xs">Oculus previews the image locally before analysis.</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void handleFile(e.target.files?.[0] ?? null)} />
            </label>
          </TourHighlight>

          <TourHighlight target="oculus-preview" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">Preview</h2>
              {image && <button type="button" onClick={clearImage} className="text-xs font-medium text-amber-700 hover:text-amber-800 dark:text-amber-300">Remove image</button>}
            </div>
            {image ? (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.dataUrl} alt="Selected preview" className="max-h-[420px] w-full rounded-lg border border-ink-100 object-contain dark:border-ink-700" />
                <dl className="mt-3 grid gap-2 text-xs text-ink-500 dark:text-ink-300 sm:grid-cols-3">
                  <Info label="File" value={image.file.name} />
                  <Info label="Type" value={image.file.type} />
                  <Info label="Size" value={formatFileSize(image.file.size)} />
                </dl>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-ink-200 bg-ink-50/70 px-3 py-4 text-center text-sm text-ink-500 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-300">No image selected yet.</p>
            )}
          </TourHighlight>
        </div>

        <aside className="space-y-4">
          <TourHighlight target="oculus-vision" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">Local vision readiness</h2>
            <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">Image analysis, if available, uses your local model server.</p>
            <label className="mt-3 block text-xs font-medium text-ink-600 dark:text-ink-200">
              Local model
              <select
                value={models.selectedModel}
                onChange={(event) => handleModelChange(event.target.value)}
                disabled={models.models.length === 0 || analyzing}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-xs text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              >
                {models.models.length === 0 ? (
                  <option value="">No local models discovered</option>
                ) : (
                  models.models.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.displayName}{isLikelyVisionModel(model.name) ? " · likely vision" : ""}
                    </option>
                  ))
                )}
              </select>
            </label>
            <dl className="mt-3 space-y-2 text-xs">
              <Info label="Selected model" value={selectedModel || "No local model discovered"} />
              <Info label="Looks vision-capable" value={visionCapable ? "Maybe" : "Not detected"} />
            </dl>
            <RatioCapabilityNote
              decision={imageAnalysisRatio}
              title="Ratio: local image analysis"
              compact
              className="mt-3"
            />
            {modelSource && modelSource.kind !== "unavailable" && (
              <p className="mt-3 rounded-lg border border-iris-100 bg-iris-50 px-3 py-2 text-xs text-iris-800 dark:border-iris-700/50 dark:bg-iris-900/20 dark:text-iris-100">
                {modelSource.message}{" "}
                <Link href="/nous" className="font-medium underline decoration-dotted underline-offset-4">
                  Change in Nous
                </Link>
              </p>
            )}
            <button type="button" onClick={() => void analyzeImage()} disabled={!image || !visionCapable || analyzing} className="mt-4 w-full rounded-lg bg-squid-600 px-4 py-2 text-sm font-medium text-white hover:bg-squid-700 disabled:cursor-not-allowed disabled:opacity-50">
              {analyzing ? "Analyzing locally..." : "Analyze image locally"}
            </button>
            {!visionCapable && <p className="mt-2 text-xs text-ink-400">{visionReadinessMessage(models.models, selectedModel)}</p>}
          </TourHighlight>

          <section className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">Privacy notes</h2>
            <ul className="mt-3 space-y-2 text-xs text-ink-500 dark:text-ink-300">
              <li>Oculus does not watch your screen.</li>
              <li>This public version does not use cloud vision.</li>
              <li>Images are not stored by default.</li>
              <li>If the image contains sensitive text, consider whether you want a model to see it before analyzing.</li>
            </ul>
          </section>
        </aside>
      </section>

      <TourHighlight target="oculus-result" active={activeTarget} className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
        <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">Analysis</h2>
        {analysis ? (
          <p className="mt-3 whitespace-pre-wrap rounded-lg border border-ink-100 bg-ink-50/70 p-3 text-sm text-ink-700 dark:border-ink-700/60 dark:bg-ink-900 dark:text-ink-100">{analysis}</p>
        ) : (
          <p className="mt-3 text-sm text-ink-500 dark:text-ink-300">No analysis yet.</p>
        )}
        <TourHighlight target="oculus-handoff" active={activeTarget}>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={sendAnalysisToColloquium} disabled={!analysis} className="rounded-lg border border-iris-200 bg-white px-4 py-2 text-sm font-medium text-iris-700 hover:bg-iris-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100">
              Send analysis to Colloquium
            </button>
            <a href="/velum" className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
              Open Velum for review
            </a>
          </div>
        </TourHighlight>
      </TourHighlight>

      {analysis && (
        <section className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
          <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
            Save analysis to Archivum
          </h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">
            Only the analysis text is saved. The image itself is not stored.
          </p>
          <p className="mt-2 text-xs text-ink-400">
            To review first, copy the analysis text and open Velum. Oculus never sends image data to Velum.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px]">
            <label className="text-sm font-medium text-ink-700 dark:text-ink-100">
              Title
              <input
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              />
            </label>
            <label className="text-sm font-medium text-ink-700 dark:text-ink-100">
              Type
              <select
                value={saveType}
                onChange={(e) => setSaveType(e.target.value as ArchivumEntryType)}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              >
                <option value="note">note</option>
                <option value="article">article</option>
                <option value="log">log</option>
                <option value="code">code</option>
                <option value="other">other</option>
              </select>
            </label>
          </div>
          <label className="mt-3 block text-sm font-medium text-ink-700 dark:text-ink-100">
            Tags
            <input
              value={saveTags}
              onChange={(e) => setSaveTags(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              placeholder="oculus, screenshot, notes"
            />
          </label>
          <p className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-ink-100 bg-ink-50/70 p-3 text-sm text-ink-700 dark:border-ink-700/60 dark:bg-ink-900 dark:text-ink-100">
            {analysis}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={saveAnalysisToArchivum} className="rounded-lg bg-squid-600 px-4 py-2 text-sm font-medium text-white hover:bg-squid-700">
              Save analysis to Archivum
            </button>
            <Link href="/archivum" className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
              Open Archivum
            </Link>
          </div>
          {saveNotice && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-200">{saveNotice}</p>}
        </section>
      )}

      {tourActive && <CompanionTourPanel key={tourRunId} tour={tour} onActiveTargetChange={setActiveTarget} onClose={handleEndTour} onFinish={handleEndTour} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2 dark:border-ink-700/60 dark:bg-ink-900/40">
      <dt className="text-ink-400">{label}</dt>
      <dd className="truncate font-mono text-[11px] text-ink-700 dark:text-ink-100" title={value}>{value}</dd>
    </div>
  );
}

function visionReadinessMessage(models: readonly LocalModelInfo[], selectedModel: string): string {
  if (models.length === 0) {
    return "No local models are installed or discovered yet. Pull a local vision model, then refresh models in Nous or Oculus.";
  }
  if (selectedModel.length === 0) {
    return "Oculus is waiting for a selected local model before image analysis can run.";
  }
  if (!models.some((model) => isLikelyVisionModel(model.name))) {
    return "Local models are installed, but none look vision-capable by name. Try a model such as llava, moondream, minicpm-v, qwen-vl, or another local vision model.";
  }
  return "The selected local model does not look vision-capable. Choose a likely vision model in Oculus or change it in Nous.";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}
