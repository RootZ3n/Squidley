"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BugReportLink } from "@/components/BugReportLink";
import { CompanionTourPanel } from "@/components/CompanionTourPanel";
import { LocalStatusNote } from "@/components/LocalStatusNote";
import { RatioCapabilityNote } from "@/components/RatioCapabilityNote";
import { TourHighlight } from "@/components/TourHighlight";
import {
  markTourCompleted,
  readTourMode,
  restartTour as persistRestartTour,
} from "@/lib/firstRun";
import { getTour } from "@/lib/tour";
import {
  clearTabulariumReceipts,
  filterTabulariumReceipts,
  formatTabulariumExport,
  loadTabularium,
  saveTabularium,
  type TabulariumDocument,
  type TabulariumModelFilter,
  type TabulariumModuleFilter,
  type TabulariumReceipt,
  type TabulariumStatusFilter,
} from "@/lib/tabularium/receipts";
import { findReceiptByQueryId } from "@/lib/tabularium/gatewayReceipts";
import { tabulariumLocalReceiptsDecision } from "@/lib/ratio";
import { isCapabilityDecisionReceipt, isCloudConsentDecisionReceipt, isCloudEscalationOfferReceipt, isGatewayPolicyDecisionReceipt, isPromptInjectionAssessmentReceipt, receiptToTransparencyBadgeView } from "@/lib/capabilities/badges";
import { CapabilityBadge } from "@/components/capabilities/CapabilityBadge";
import { buildReceiptChains, type TabulariumReceiptChain, type TabulariumReceiptChainStep } from "@/lib/tabularium/receiptChains";

const MODULE_FILTERS: TabulariumModuleFilter[] = ["all", "colloquium", "velum", "archivum", "oculus", "fabrica", "nous", "settings", "system"];
const STATUS_FILTERS: TabulariumStatusFilter[] = ["all", "succeeded", "failed", "interrupted", "info"];

export default function TabulariumPage() {
  const [doc, setDoc] = useState<TabulariumDocument | null>(null);
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState<TabulariumModuleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<TabulariumStatusFilter>("all");
  const [modelFilter, setModelFilter] = useState<TabulariumModelFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkedReceiptNote, setLinkedReceiptNote] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"receipts" | "chains">("receipts");
  const [tourActive, setTourActive] = useState(false);
  const [tourRunId, setTourRunId] = useState(0);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const tour = useMemo(() => getTour("tabularium")!, []);
  const localReceiptsRatio = useMemo(() => tabulariumLocalReceiptsDecision(), []);

  useEffect(() => {
    const loaded = loadTabularium(window.localStorage);
    const search = new URLSearchParams(window.location.search);
    const linkedReceipt = search.get("receipt");
    const found = findReceiptByQueryId(loaded.receipts, linkedReceipt);
    setDoc(loaded);
    if (linkedReceipt) {
      if (found) {
        setSelectedId(found.id);
        setLinkedReceiptNote("Opened the local safety receipt from your link.");
      } else {
        setLinkedReceiptNote("That local receipt was not found. It may have been cleared from this browser.");
      }
    }
    const fromQuery = search.get("tour") === "1";
    setTourActive(fromQuery || readTourMode() === "on");
  }, []);

  const receipts = useMemo(() => doc?.receipts ?? [], [doc]);
  const filtered = useMemo(
    () => filterTabulariumReceipts({
      receipts,
      query,
      module: moduleFilter,
      status: statusFilter,
      model: modelFilter,
    }),
    [modelFilter, moduleFilter, query, receipts, statusFilter],
  );
  const chains = useMemo(() => buildReceiptChains(filtered), [filtered]);
  const selected = receipts.find((receipt) => receipt.id === selectedId) ?? filtered[0] ?? null;

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

  function handleExport() {
    if (!doc) return;
    const blob = new Blob([formatTabulariumExport(doc)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `peh-tabularium-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleClear() {
    const ok = window.confirm("Clear Tabularium receipts? This only clears receipts saved in this browser.");
    if (!ok) return;
    const fresh = clearTabulariumReceipts();
    saveTabularium(window.localStorage, fresh);
    setDoc(fresh);
    setSelectedId(null);
  }

  return (
    <div className="sq-page mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TourHighlight target="intro" active={activeTarget}>
        <header className="border-b border-ink-200 pb-5 dark:border-ink-700">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-iris-600 dark:text-iris-300">
            Peh · Tabularium
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-ink-900 dark:text-ink-50">
            Receipt room
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600 dark:text-ink-300">
            Tabularium is Peh&rsquo;s receipt room. It shows what happened,
            what stayed local, and what changed.
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
              ["/fabrica", "Fabrica"],
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

      <div className="mt-4">
        <RatioCapabilityNote decision={localReceiptsRatio} title="Ratio: local receipts" compact />
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <TourHighlight target="tabularium-filters" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_150px_150px]">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                placeholder="Search receipts"
              />
              <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value as TabulariumModuleFilter)} className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50">
                {MODULE_FILTERS.map((item) => <option key={item} value={item}>{item === "all" ? "All modules" : item}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TabulariumStatusFilter)} className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50">
                {STATUS_FILTERS.map((item) => <option key={item} value={item}>{item === "all" ? "All statuses" : item}</option>)}
              </select>
              <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value as TabulariumModelFilter)} className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50">
                <option value="all">All model states</option>
                <option value="model-used">Model used</option>
                <option value="no-model">No model</option>
              </select>
            </div>
          </TourHighlight>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode("receipts")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm ${viewMode === "receipts" ? "border-iris-300 bg-iris-50 text-iris-800 dark:border-iris-600 dark:bg-iris-900/30 dark:text-iris-100" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"}`}
            >
              Receipts
            </button>
            <button
              type="button"
              onClick={() => setViewMode("chains")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm ${viewMode === "chains" ? "border-iris-300 bg-iris-50 text-iris-800 dark:border-iris-600 dark:bg-iris-900/30 dark:text-iris-100" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"}`}
            >
              Trust chains
            </button>
          </div>

          {viewMode === "chains" ? (
            <TourHighlight target="tabularium-list" active={activeTarget} className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
                  Receipt chains
                </h2>
                <span className="text-xs text-ink-400">{chains.length} {chains.length === 1 ? "chain" : "chains"}</span>
              </div>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-300">
                Related receipts grouped into readable trust stories. Each chain shows what was assessed, decided, and consented.
              </p>
              {chains.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-ink-200 bg-ink-50/70 px-3 py-4 text-center text-sm text-ink-500 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-300">
                  No receipt chains to display.
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {chains.map((chain) => (
                    <ReceiptChainCard
                      key={chain.id}
                      chain={chain}
                      selectedId={selectedId}
                      onSelectReceipt={setSelectedId}
                    />
                  ))}
                </ul>
              )}
            </TourHighlight>
          ) : (
            <TourHighlight target="tabularium-list" active={activeTarget} className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
                  Local receipts
                </h2>
                <span className="text-xs text-ink-400">{filtered.length} shown</span>
              </div>
              {receipts.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-ink-200 bg-ink-50/70 px-3 py-4 text-center text-sm text-ink-500 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-300">
                  No receipts yet. Peh will add local receipts as you chat, review text, save entries, or change local settings.
                </p>
              ) : filtered.length === 0 ? (
                <p className="mt-4 rounded-lg border border-dashed border-ink-200 bg-ink-50/70 px-3 py-4 text-center text-sm text-ink-500 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-300">
                  No receipts match that search or filter.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {filtered.map((receipt) => (
                    <li
                      key={receipt.id}
                      className={`rounded-lg border bg-ink-50/70 p-3 dark:bg-ink-900/40 ${
                        receipt.id === selectedId
                          ? "border-iris-300 ring-2 ring-iris-200 dark:border-iris-600 dark:ring-iris-900/40"
                          : "border-ink-100 dark:border-ink-700/60"
                      }`}
                    >
                      <button type="button" onClick={() => setSelectedId(receipt.id)} className="block w-full text-left">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-medium text-ink-800 dark:text-ink-100">{receipt.title}</h3>
                          <span className={statusClass(receipt.status)}>{receipt.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-ink-500 dark:text-ink-300">{receipt.summary}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-400">
                          <span>{receipt.module}</span>
                          <span>{receipt.modelUsed ? "model used" : "no model"}</span>
                          <span>No cloud used</span>
                          {(isCapabilityDecisionReceipt(receipt) || isCloudEscalationOfferReceipt(receipt) || isCloudConsentDecisionReceipt(receipt) || isPromptInjectionAssessmentReceipt(receipt) || isGatewayPolicyDecisionReceipt(receipt)) && (() => {
                            const badgeView = receiptToTransparencyBadgeView(receipt);
                            return badgeView ? <CapabilityBadge view={badgeView} showDetail={false} /> : null;
                          })()}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TourHighlight>
          )}
        </div>

        <aside>
          <TourHighlight target="tabularium-actions" active={activeTarget} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">
              Receipt controls
            </h2>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">
              Export or clear only the receipts saved in this browser.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={handleExport} disabled={!doc || receipts.length === 0} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
                Export Receipts
              </button>
              <button type="button" onClick={handleClear} disabled={!doc || receipts.length === 0} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700/60 dark:bg-ink-900 dark:text-amber-100">
                Clear Receipts
              </button>
            </div>
          </TourHighlight>

          <TourHighlight target="tabularium-detail" active={activeTarget} className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">
              Receipt details
            </h2>
            {linkedReceiptNote && (
              <p className="mt-3 rounded-lg border border-iris-200 bg-iris-50 px-3 py-2 text-xs text-iris-800 dark:border-iris-700/60 dark:bg-iris-900/20 dark:text-iris-100">
                {linkedReceiptNote}
              </p>
            )}
            {selected ? <ReceiptDetails receipt={selected} /> : (
              <p className="mt-3 text-sm text-ink-500 dark:text-ink-300">
                Select a receipt to see the details.
              </p>
            )}
          </TourHighlight>
        </aside>
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

const CHAIN_KIND_LABELS: Record<string, string> = {
  "cloud-consent-flow": "Cloud consent",
  "gateway-security-flow": "Gateway security",
  "capability-decision": "Capability",
  standalone: "Standalone",
  unknown: "Unknown",
};

function chainKindClass(kind: string): string {
  if (kind === "cloud-consent-flow") return "rounded-full border border-iris-200 bg-iris-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-iris-800 dark:border-iris-700/60 dark:bg-iris-900/20 dark:text-iris-100";
  if (kind === "gateway-security-flow") return "rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100";
  if (kind === "capability-decision") return "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100";
  return "rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-600 dark:border-ink-700/60 dark:bg-ink-800/40 dark:text-ink-200";
}

function ReceiptChainCard({
  chain,
  selectedId,
  onSelectReceipt,
}: {
  chain: TabulariumReceiptChain;
  selectedId: string | null;
  onSelectReceipt: (id: string) => void;
}) {
  return (
    <li className="rounded-lg border border-ink-200 bg-ink-50/70 p-3 dark:border-ink-700/60 dark:bg-ink-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-ink-800 dark:text-ink-100">{chain.title}</h3>
        <span className={chainKindClass(chain.kind)}>{CHAIN_KIND_LABELS[chain.kind] ?? chain.kind}</span>
      </div>
      <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">{chain.summary}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-ink-400">
        <span>{chain.steps.length} {chain.steps.length === 1 ? "step" : "steps"}</span>
        {chain.nothingSentYet && <span>Nothing sent by these receipts</span>}
        {chain.cloudUsed && <span className="text-rose-600 dark:text-rose-300">Cloud used</span>}
      </div>
      <ol className="mt-3 space-y-2 border-l-2 border-ink-200 pl-3 dark:border-ink-700">
        {chain.steps.map((step, i) => (
          <ChainStepItem
            key={step.receiptId}
            step={step}
            index={i}
            isSelected={step.receiptId === selectedId}
            onSelect={() => onSelectReceipt(step.receiptId)}
          />
        ))}
      </ol>
    </li>
  );
}

function ChainStepItem({
  step,
  index,
  isSelected,
  onSelect,
}: {
  step: TabulariumReceiptChainStep;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <li className="relative">
      <span className="absolute -left-[calc(0.75rem+1px)] top-1.5 h-2 w-2 rounded-full border border-ink-300 bg-white dark:border-ink-600 dark:bg-ink-800" />
      <button
        type="button"
        onClick={onSelect}
        className={`block w-full rounded-md p-2 text-left ${isSelected ? "bg-iris-50 ring-1 ring-iris-200 dark:bg-iris-900/20 dark:ring-iris-700/40" : "hover:bg-ink-100/60 dark:hover:bg-ink-800/60"}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{index + 1}</span>
          <span className="text-xs font-medium text-ink-800 dark:text-ink-100">{step.title}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-300">{step.summary}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-400">
          <span>{new Date(step.createdAt).toLocaleTimeString()}</span>
          {step.badgeView && <CapabilityBadge view={step.badgeView} showDetail={false} />}
        </div>
      </button>
    </li>
  );
}

function ReceiptDetails({ receipt }: { receipt: TabulariumReceipt }) {
  return (
    <dl className="mt-3 space-y-2 text-sm">
      <Detail label="Title" value={receipt.title} />
      <Detail label="Module" value={receipt.module} />
      <Detail label="Action" value={receipt.action} />
      <Detail label="Status" value={receipt.status} />
      <Detail label="Created" value={new Date(receipt.createdAt).toLocaleString()} />
      <Detail label="Completed" value={receipt.completedAt ? new Date(receipt.completedAt).toLocaleString() : "Not recorded"} />
      <Detail label="Local only" value={receipt.localOnly ? "true" : "false"} />
      <Detail label="Cloud used" value={receipt.cloudUsed ? "true" : "false"} />
      <Detail label="Model used" value={receipt.modelUsed ? "true" : "false"} />
      <Detail label="Tools used" value={receipt.toolsUsed ? "true" : "false"} />
      <Detail label="Provider" value={receipt.provider ?? "Not applicable"} />
      <Detail label="Model" value={receipt.model ?? "Not applicable"} />
      <Detail label="Changed local storage" value={typeof receipt.changedLocalStorage === "boolean" ? String(receipt.changedLocalStorage) : "Not recorded"} />
      <Detail label="Related item" value={receipt.relatedItemId ?? "None"} />
      {(() => {
        const badgeView = receiptToTransparencyBadgeView(receipt);
        if (!badgeView) return null;
        const label = isGatewayPolicyDecisionReceipt(receipt)
          ? "Gateway policy badge"
          : isPromptInjectionAssessmentReceipt(receipt)
            ? "Gateway security badge"
            : isCloudConsentDecisionReceipt(receipt)
              ? "Cloud consent badge"
              : isCloudEscalationOfferReceipt(receipt)
                ? "Cloud escalation badge"
                : "Capability badge";
        return (
          <div className="border-b border-ink-100 pb-2 dark:border-ink-700/60">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
            <dd className="mt-1">
              <CapabilityBadge view={badgeView} showDetail={true} />
            </dd>
          </div>
        );
      })()}
      {receipt.metadata ? (
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Safe metadata</dt>
          <dd className="mt-1 rounded-lg border border-ink-100 bg-ink-50/70 p-3 text-xs text-ink-700 dark:border-ink-700/60 dark:bg-ink-900/40 dark:text-ink-200">
            {Object.entries(receipt.metadata).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 border-b border-ink-100 py-1 last:border-b-0 dark:border-ink-700/60">
                <span className="text-ink-400">{key}</span>
                <span className="break-words">{String(value)}</span>
              </div>
            ))}
          </dd>
        </div>
      ) : null}
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Summary</dt>
        <dd className="mt-1 rounded-lg border border-ink-100 bg-ink-50/70 p-3 text-ink-700 dark:border-ink-700/60 dark:bg-ink-900/40 dark:text-ink-200">
          {receipt.summary}
        </dd>
      </div>
      <div className="rounded-lg border border-ink-100 bg-ink-50/70 p-3 dark:border-ink-700/60 dark:bg-ink-900/40">
        <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Bug report</dt>
        <dd className="mt-2 space-y-2 text-xs text-ink-500 dark:text-ink-300">
          <p>
            This opens a prefilled email with the receipt id and safe receipt
            fields only. It does not attach prompts, source text, image data, or
            local storage.
          </p>
          <BugReportLink
            pageModule="Tabularium"
            issueSummary={`Receipt issue: ${receipt.module} ${receipt.action}`}
            receipt={receipt}
            className="inline-flex rounded-lg border border-iris-200 bg-white px-3 py-2 text-sm font-medium text-iris-700 hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100"
          >
            Report issue with this receipt
          </BugReportLink>
        </dd>
      </div>
    </dl>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-ink-100 pb-2 last:border-b-0 dark:border-ink-700/60">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="break-words text-ink-700 dark:text-ink-200">{value}</dd>
    </div>
  );
}

function statusClass(status: string): string {
  if (status === "succeeded") return "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-100";
  if (status === "failed") return "rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-900/20 dark:text-rose-100";
  if (status === "interrupted") return "rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-100";
  if (status === "running") return "rounded-full bg-squid-50 px-2 py-0.5 text-xs text-squid-700 dark:bg-squid-900/20 dark:text-squid-100";
  return "rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600 dark:bg-ink-700 dark:text-ink-100";
}
