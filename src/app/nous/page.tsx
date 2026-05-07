"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CompanionTourPanel } from "@/components/CompanionTourPanel";
import { LocalStatusNote } from "@/components/LocalStatusNote";
import { TourHighlight } from "@/components/TourHighlight";
import { markTourCompleted, readTourMode, restartTour as persistRestartTour } from "@/lib/firstRun";
import { getTour } from "@/lib/tour";
import { isLikelyVisionModel } from "@/lib/oculus/helpers";
import type { LocalModelInfo } from "@/lib/providers/ollama";
import { PROVIDER_REGISTRY, getLockedCloudProviders } from "@/lib/providers/registry";
import {
  createModelPreferencesDocument,
  loadModelPreferences,
  resetModelPreferences,
  resolveColloquiumChatModel,
  resolveFabricaBuildModel,
  resolveOculusVisionModel,
  saveModelPreferences,
  setModuleModelPreference,
  type NousModelPreferencesDocument,
  type NousModelRole,
  type NousPreferenceModuleId,
} from "@/lib/nous/modelPreferences";
import { buildNousModuleMap, type NousModuleCapability } from "@/lib/nous/modelMap";
import {
  buildNousModelPreferenceChangedReceipt,
  buildNousModelPreferencesResetReceipt,
} from "@/lib/nous/receipts";
import { logTabulariumReceipt } from "@/lib/tabularium/receipts";
import {
  decideRatioAction,
  resolveRatioModelCapability,
  summarizeRatioDecision,
  type RatioDecision,
  type RatioModelCapabilityProfile,
} from "@/lib/ratio";

interface LocalModelsState {
  loading: boolean;
  models: LocalModelInfo[];
  configuredModel: string;
  endpoint: string;
  reason: string | null;
}

export default function NousPage() {
  const [preferences, setPreferences] = useState<NousModelPreferencesDocument>(() =>
    createModelPreferencesDocument(),
  );
  const [localModels, setLocalModels] = useState<LocalModelsState>({
    loading: true,
    models: [],
    configuredModel: "",
    endpoint: "http://localhost:11434",
    reason: null,
  });
  const [tourActive, setTourActive] = useState(false);
  const [tourRunId, setTourRunId] = useState(0);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const tour = useMemo(() => getTour("nous")!, []);

  useEffect(() => {
    setPreferences(loadModelPreferences(window.localStorage));
    const fromQuery = new URLSearchParams(window.location.search).get("tour") === "1";
    setTourActive(fromQuery || readTourMode() === "on");
    void loadLocalModels();
  }, []);

  const selectedColloquiumModel = useMemo(
    () => resolveColloquiumChatModel({
      preferences,
      models: localModels.models,
      configuredModel: localModels.configuredModel,
    }),
    [localModels.configuredModel, localModels.models, preferences],
  );
  const selectedOculusModel = useMemo(
    () => resolveOculusVisionModel({
      preferences,
      models: localModels.models,
      configuredModel: localModels.configuredModel,
    }),
    [localModels.configuredModel, localModels.models, preferences],
  );
  const selectedFabricaModel = useMemo(
    () => resolveFabricaBuildModel({
      preferences,
      models: localModels.models,
      configuredModel: localModels.configuredModel,
    }),
    [localModels.configuredModel, localModels.models, preferences],
  );
  const moduleMap = useMemo(
    () => buildNousModuleMap({
      preferences,
      models: localModels.models,
      configuredModel: localModels.configuredModel,
    }),
    [localModels.configuredModel, localModels.models, preferences],
  );
  const ratioProfiles = useMemo(
    () => ({
      colloquium: resolveRatioModelCapability({
        providerId: "ollama",
        providerType: "local",
        modelId: selectedColloquiumModel,
        moduleId: "colloquium",
      }),
      oculus: resolveRatioModelCapability({
        providerId: "ollama",
        providerType: "local",
        modelId: selectedOculusModel,
        moduleId: "oculus",
      }),
      fabrica: resolveRatioModelCapability({
        providerId: "ollama",
        providerType: "local",
        modelId: selectedFabricaModel,
        moduleId: "fabrica",
      }),
    }),
    [selectedColloquiumModel, selectedFabricaModel, selectedOculusModel],
  );
  const ratioDecisions = useMemo(
    () => [
      decideRatioAction({
        moduleId: "colloquium",
        actionId: "chat.basic",
        providerId: "ollama",
        modelId: selectedColloquiumModel,
        unlockLevel: "public-local",
        taskRisk: "low",
        promptGatewayRisk: "low",
        workspacePermission: false,
        toolPermission: false,
        approvalPolicy: "none",
      }),
      decideRatioAction({
        moduleId: "fabrica",
        actionId: "fabrica.single-file-suggestion",
        providerId: "ollama",
        modelId: selectedFabricaModel,
        unlockLevel: "public-local",
        taskRisk: "low",
        promptGatewayRisk: "low",
        workspacePermission: false,
        toolPermission: false,
        approvalPolicy: "none",
      }),
      decideRatioAction({
        moduleId: "fabrica",
        actionId: "fabrica.multi-file-build",
        providerId: "ollama",
        modelId: selectedFabricaModel,
        unlockLevel: "public-local",
        taskRisk: "medium",
        promptGatewayRisk: "low",
        workspacePermission: false,
        toolPermission: false,
        approvalPolicy: "none",
      }),
      decideRatioAction({
        moduleId: "velum",
        actionId: "velum.deterministic-review",
        providerId: "ollama",
        modelId: "",
        unlockLevel: "public-local",
        taskRisk: "low",
        promptGatewayRisk: "low",
        workspacePermission: false,
        toolPermission: false,
        approvalPolicy: "none",
      }),
      decideRatioAction({
        moduleId: "legatus",
        actionId: "legatus.agent-workflow",
        providerId: "ollama",
        modelId: selectedColloquiumModel,
        unlockLevel: "public-local",
        taskRisk: "high",
        promptGatewayRisk: "low",
        workspacePermission: false,
        toolPermission: false,
        approvalPolicy: "none",
      }),
    ],
    [selectedColloquiumModel, selectedFabricaModel],
  );

  async function loadLocalModels() {
    setLocalModels((prev) => ({ ...prev, loading: true, reason: null }));
    try {
      const response = await fetch("/api/local/models");
      const body = await response.json();
      setLocalModels({
        loading: false,
        models: Array.isArray(body.models) ? body.models : [],
        configuredModel: body.configuredModel ?? body.defaultModel ?? "",
        endpoint: body.endpoint ?? "http://localhost:11434",
        reason: typeof body.reason === "string" ? body.reason : null,
      });
    } catch {
      setLocalModels({
        loading: false,
        models: [],
        configuredModel: "",
        endpoint: "http://localhost:11434",
        reason: "Squidley could not read the local model list. Start Ollama, then refresh this page.",
      });
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

  function updatePreference(moduleId: NousPreferenceModuleId, role: NousModelRole, model: string) {
    const next = setModuleModelPreference(preferences, moduleId, role, model);
    setPreferences(next);
    saveModelPreferences(window.localStorage, next);
    logTabulariumReceipt(window.localStorage, buildNousModelPreferenceChangedReceipt({
      moduleId,
      role,
      model: model || undefined,
    }));
  }

  function handleResetPreferences() {
    const ok = window.confirm("Reset local model preferences? This only clears model choices saved in this browser.");
    if (!ok) return;
    const next = resetModelPreferences(window.localStorage);
    setPreferences(next);
    logTabulariumReceipt(window.localStorage, buildNousModelPreferencesResetReceipt());
  }

  return (
    <div className="sq-page mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TourHighlight target="intro" active={activeTarget}>
        <header className="border-b border-ink-200 pb-5 dark:border-ink-700">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-iris-600 dark:text-iris-300">
            Squidley · Nous
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-ink-900 dark:text-ink-50">
            System and model map
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600 dark:text-ink-300">
            Nous is Squidley&rsquo;s map of how the system thinks. It shows which modules exist,
            what they do, and what models they use.
          </p>
          <TourHighlight target="local-only-indicator" active={activeTarget}>
            <p className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100">
              Cloud currently used: false · no cloud fallback · preferences stay in this browser
            </p>
          </TourHighlight>
          <nav className="mt-4 flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={handleRestartTour} className="rounded-lg border border-iris-200 bg-white px-3 py-1.5 font-medium text-iris-700 shadow-sm hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-800 dark:text-iris-100">
              Restart tour
            </button>
            {[
              ["/colloquium", "Colloquium"],
              ["/fabrica", "Fabrica"],
              ["/velum", "Velum"],
              ["/archivum", "Archivum"],
              ["/oculus", "Oculus"],
              ["/tabularium", "Tabularium"],
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

      <section className="mt-6 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <TourHighlight target="nous-model-controls" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
                Local model assignments
              </h2>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">
                Changing these affects which local model Squidley uses where supported.
              </p>
            </div>
            <button type="button" onClick={() => void loadLocalModels()} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
              Refresh
            </button>
          </div>

          <dl className="mt-4 grid gap-2 text-xs">
            <Info label="Endpoint" value={localModels.endpoint} />
            <Info label="Discovered models" value={localModels.loading ? "Checking..." : String(localModels.models.length)} />
            <Info label="Configured default" value={localModels.configuredModel || "Not discovered"} />
          </dl>
          {localModels.reason && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
              {localModels.reason}
            </p>
          )}

          <div className="mt-4 space-y-3">
            <ModelSelect
              label="Colloquium chat model"
              value={selectedColloquiumModel}
              models={localModels.models}
              disabled={localModels.models.length === 0}
              onChange={(model) => updatePreference("colloquium", "chatModel", model)}
              note="Used for local chat."
            />
            <ModelSelect
              label="Oculus vision model"
              value={selectedOculusModel}
              models={localModels.models}
              disabled={localModels.models.length === 0}
              onChange={(model) => updatePreference("oculus", "visionModel", model)}
              note="Vision-capable models are marked as likely vision."
              showVisionHint
            />
            <ModelSelect
              label="Fabrica build model"
              value={selectedFabricaModel}
              models={localModels.models}
              disabled={localModels.models.length === 0}
              onChange={(model) => updatePreference("fabrica", "buildModel", model)}
              note="Used for local single-file suggestions. Fabrica is not a full coding agent."
            />
          </div>

          <button type="button" onClick={handleResetPreferences} className="mt-4 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-700/60 dark:bg-ink-900 dark:text-amber-100">
            Reset model preferences
          </button>
        </TourHighlight>

        <TourHighlight target="nous-asi" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-iris-600 dark:text-iris-300">
                Ratio · Adaptive System Intelligence
              </p>
              <h2 className="mt-1 font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
                How Squidley changes gears
              </h2>
            </div>
            <span className={activeBadgeClass}>public-local</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink-600 dark:text-ink-300">
            Ratio is the source for the capability notes shown across Squidley. It changes gears based on the model and permissions available. Local models keep the public version private and safe. Capable cloud models can unlock advanced planning and agent workflows later, but only after explicit setup.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <RatioProfileCard label="Colloquium model" model={selectedColloquiumModel} profile={ratioProfiles.colloquium} />
            <RatioProfileCard label="Oculus model" model={selectedOculusModel} profile={ratioProfiles.oculus} />
            <RatioProfileCard label="Fabrica model" model={selectedFabricaModel} profile={ratioProfiles.fabrica} />
          </div>
          <div className="mt-4 grid gap-2">
            {ratioDecisions.map((decision) => (
              <RatioDecisionRow key={`${decision.receiptSummary}-${decision.status}`} decision={decision} />
            ))}
          </div>
        </TourHighlight>

        <TourHighlight target="nous-module-map" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
              Public module map
            </h2>
            <span className="text-xs text-ink-400">{moduleMap.length} modules</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {moduleMap.map((module) => (
              <ModuleCard key={module.moduleId} module={module} />
            ))}
          </div>
        </TourHighlight>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <TourHighlight target="nous-provider-registry" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
          <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
            Provider registry
          </h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">
            This is metadata only. Public Squidley makes no cloud provider calls in this pass.
          </p>
          <div className="mt-3">
            <LocalStatusNote variant="cloudLocked" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {PROVIDER_REGISTRY.map((provider) => (
              <article key={provider.id} className="rounded-lg border border-ink-100 bg-ink-50/70 p-3 dark:border-ink-700/60 dark:bg-ink-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-ink-800 dark:text-ink-100">{provider.displayName}</h3>
                  <span className={provider.status === "active" ? activeBadgeClass : lockedBadgeClass}>
                    {provider.status}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-500 dark:text-ink-300">{provider.beginnerDescription}</p>
                <dl className="mt-3 grid gap-1 text-[11px] text-ink-500 dark:text-ink-300">
                  <ProviderDetail label="Type" value={provider.type} />
                  <ProviderDetail label="Base URL" value={provider.baseUrlDefault} />
                  <ProviderDetail label="API style" value={provider.supportedApiStyle} />
                  <ProviderDetail label="Enabled by default" value={String(provider.enabledByDefault)} />
                  <ProviderDetail label="Cloud unlock required" value={String(provider.cloudUnlockRequired)} />
                </dl>
              </article>
            ))}
          </div>
        </TourHighlight>

        <TourHighlight target="nous-cloud-lock" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
          <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
            Prepared for Cloud Unlock
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-600 dark:text-ink-300">
            These providers are prepared but locked. Public Squidley will not use them unless you
            explicitly unlock and configure cloud access later. No API keys are collected here.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-ink-600 dark:text-ink-300">
            {getLockedCloudProviders().map((provider) => (
              <li key={provider.id} className="rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2 dark:border-ink-700/60 dark:bg-ink-900/40">
                <span className="font-medium text-ink-800 dark:text-ink-100">{provider.displayName}</span>
                <span className="ml-2 text-xs text-ink-400">locked · no calls</span>
              </li>
            ))}
          </ul>
        </TourHighlight>
      </section>

      {tourActive && (
        <CompanionTourPanel
          key={tourRunId}
          tour={tour}
          onActiveTargetChange={setActiveTarget}
          onClose={handleEndTour}
          onFinish={handleEndTour}
        />
      )}
    </div>
  );
}

function ModelSelect(props: {
  label: string;
  value: string;
  models: readonly LocalModelInfo[];
  disabled: boolean;
  note: string;
  showVisionHint?: boolean;
  onChange: (model: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-ink-700 dark:text-ink-100">
      {props.label}
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.disabled}
        className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
      >
        {props.models.length === 0 ? (
          <option value="">No local models discovered</option>
        ) : (
          props.models.map((model) => (
            <option key={model.name} value={model.name}>
              {model.displayName}{props.showVisionHint && isLikelyVisionModel(model.name) ? " · likely vision" : ""}
            </option>
          ))
        )}
      </select>
      <span className="mt-1 block text-xs font-normal text-ink-400">{props.note}</span>
    </label>
  );
}

function ModuleCard({ module }: { module: NousModuleCapability }) {
  return (
    <article className="rounded-lg border border-ink-100 bg-ink-50/70 p-3 dark:border-ink-700/60 dark:bg-ink-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-ink-800 dark:text-ink-100">{module.displayName}</h3>
        <span className={module.currentStatus === "active" ? activeBadgeClass : module.currentStatus === "locked" ? lockedBadgeClass : neutralBadgeClass}>
          {module.currentStatus}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink-500 dark:text-ink-300">{module.explanation}</p>
      <dl className="mt-3 grid gap-1 text-[11px] text-ink-500 dark:text-ink-300">
        <ProviderDetail label="Uses model" value={module.usesModel ? "yes" : "no"} />
        <ProviderDetail label="Model role" value={module.modelRole} />
        <ProviderDetail label="Provider" value={module.selectedProvider === "none" ? "No model needed" : module.selectedProvider} />
        <ProviderDetail label="Selected model" value={module.selectedModel || "No model needed"} />
        <ProviderDetail label="Cloud capable later" value={module.cloudCapable ? "yes, if unlocked later" : "no"} />
      </dl>
    </article>
  );
}

function RatioProfileCard(props: {
  label: string;
  model: string;
  profile: RatioModelCapabilityProfile;
}) {
  return (
    <article className="rounded-lg border border-ink-100 bg-ink-50/70 p-3 dark:border-ink-700/60 dark:bg-ink-900/40">
      <h3 className="text-sm font-medium text-ink-800 dark:text-ink-100">{props.label}</h3>
      <p className="mt-1 truncate font-mono text-xs text-ink-500 dark:text-ink-300" title={props.model || "No model selected"}>
        {props.model || "No model selected"}
      </p>
      <dl className="mt-3 grid gap-1 text-[11px] text-ink-500 dark:text-ink-300">
        <ProviderDetail label="Intelligence" value={props.profile.intelligenceTier} />
        <ProviderDetail label="Coding" value={props.profile.codingAbility} />
        <ProviderDetail label="Vision" value={props.profile.visionAbility} />
        <ProviderDetail label="Autonomy" value={props.profile.autonomyRecommendation} />
        <ProviderDetail label="Confidence" value={props.profile.confidence} />
      </dl>
      <p className="mt-2 text-xs leading-5 text-ink-500 dark:text-ink-300">
        {props.profile.modelSummary}
      </p>
    </article>
  );
}

function RatioDecisionRow({ decision }: { decision: RatioDecision }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2 text-sm dark:border-ink-700/60 dark:bg-ink-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ink-800 dark:text-ink-100">
          {decision.status}
        </span>
        <span className={decision.allowed ? activeBadgeClass : decision.status === "future" ? neutralBadgeClass : lockedBadgeClass}>
          {decision.effectiveMode}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-ink-500 dark:text-ink-300">
        {summarizeRatioDecision(decision)}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2 dark:border-ink-700/60 dark:bg-ink-900/40">
      <dt className="text-ink-400">{label}</dt>
      <dd className="truncate font-mono text-[11px] text-ink-700 dark:text-ink-100" title={value}>{value}</dd>
    </div>
  );
}

function ProviderDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className="truncate text-right font-mono" title={value}>{value}</dd>
    </div>
  );
}

const activeBadgeClass = "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100";
const lockedBadgeClass = "rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100";
const neutralBadgeClass = "rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[11px] font-medium text-ink-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200";
