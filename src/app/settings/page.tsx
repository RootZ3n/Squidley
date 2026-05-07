"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BugReportLink } from "@/components/BugReportLink";
import { LocalStatusNote } from "@/components/LocalStatusNote";
import { createArchivumDocument, loadArchivum, saveArchivum, type ArchivumDocument } from "@/lib/archivum/storage";
import {
  clearAllStoredSessions,
  createSessionsDocument,
  loadStoredSessions,
  saveStoredSessions,
  type StoredChatSessionsDocument,
} from "@/lib/chat/conversationStorage";
import { resetFirstRun, restartTour } from "@/lib/firstRun";
import {
  clearTabulariumReceipts,
  formatTabulariumExport,
  loadTabularium,
  saveTabularium,
  type TabulariumDocument,
} from "@/lib/tabularium/receipts";
import { logTabulariumReceipt } from "@/lib/tabularium/receipts";
import {
  formatChatSessionsExport,
  summarizeArchivumStorage,
  summarizeChatStorage,
  summarizeTabulariumStorage,
} from "@/lib/settings/storage";
import {
  buildSettingsArchivumClearedReceipt,
  buildSettingsFirstRunResetReceipt,
  buildSettingsLocalChatsClearedReceipt,
  buildSettingsLocalChatsExportedReceipt,
  buildSettingsReceiptsExportedReceipt,
  buildSettingsTourRestartedReceipt,
} from "@/lib/settings/receipts";

interface LocalInfo {
  endpoint: string;
  configuredModel: string;
  selectedModel: string;
  modelCount?: number;
  health: "checking" | "ready" | "unavailable";
}

const TOUR_LINKS = [
  { label: "Restart Colloquium tour", href: "/colloquium?tour=1", module: "Colloquium" },
  { label: "Restart Velum tour", href: "/velum?tour=1", module: "Velum" },
  { label: "Restart Archivum tour", href: "/archivum?tour=1", module: "Archivum" },
  { label: "Restart Tabularium tour", href: "/tabularium?tour=1", module: "Tabularium" },
] as const;

export default function SettingsPage() {
  const [localInfo, setLocalInfo] = useState<LocalInfo>({
    endpoint: "http://localhost:11434",
    configuredModel: "llama3.2",
    selectedModel: "",
    health: "checking",
  });
  const [sessionsDoc, setSessionsDoc] = useState<StoredChatSessionsDocument | null>(null);
  const [archivumDoc, setArchivumDoc] = useState<ArchivumDocument | null>(null);
  const [tabulariumDoc, setTabulariumDoc] = useState<TabulariumDocument | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredSessions(window.localStorage);
    const archivum = loadArchivum(window.localStorage);
    const tabularium = loadTabularium(window.localStorage);
    setSessionsDoc(stored);
    setArchivumDoc(archivum);
    setTabulariumDoc(tabularium);
    const active = stored.sessions.find((s) => s.id === stored.activeSessionId) ?? stored.sessions[0];
    const selectedModel =
      [...active.receipts].reverse().find((r) => r.model)?.model ??
      [...active.messages].reverse().find((m) => m.model)?.model ??
      "";

    async function loadLocalInfo() {
      try {
        const [healthResponse, modelsResponse] = await Promise.all([
          fetch("/api/local/health"),
          fetch("/api/local/models"),
        ]);
        const health = await healthResponse.json();
        const models = await modelsResponse.json();
        setLocalInfo({
          endpoint: health.endpoint ?? models.endpoint ?? "http://localhost:11434",
          configuredModel: models.configuredModel ?? models.defaultModel ?? "llama3.2",
          selectedModel,
          modelCount: health.modelCount,
          health: health.ok ? "ready" : "unavailable",
        });
      } catch {
        setLocalInfo((prev) => ({ ...prev, health: "unavailable" }));
      }
    }

    void loadLocalInfo();
  }, []);

  const chatSummary = useMemo(() => summarizeChatStorage(sessionsDoc), [sessionsDoc]);
  const archivumSummary = useMemo(() => summarizeArchivumStorage(archivumDoc), [archivumDoc]);
  const tabulariumSummary = useMemo(() => summarizeTabulariumStorage(tabulariumDoc), [tabulariumDoc]);

  function recordSettingsReceipt(args: Parameters<typeof logTabulariumReceipt>[1]) {
    logTabulariumReceipt(window.localStorage, args);
    setTabulariumDoc(loadTabularium(window.localStorage));
  }

  function handleRestartTour(moduleName: string) {
    restartTour();
    recordSettingsReceipt(buildSettingsTourRestartedReceipt(moduleName));
  }

  function handleResetWelcome() {
    const confirmed = window.confirm("Reset the welcome screen and first-run state for this browser?");
    if (!confirmed) return;
    resetFirstRun();
    recordSettingsReceipt(buildSettingsFirstRunResetReceipt());
    setNotice("Welcome and first-run state were reset in this browser.");
  }

  function handleClearAllChats() {
    const confirmed = window.confirm("Clear all local Colloquium chats? This only clears chats saved in this browser.");
    if (!confirmed) return;
    clearAllStoredSessions(window.localStorage);
    const fresh = createSessionsDocument();
    saveStoredSessions(window.localStorage, fresh);
    setSessionsDoc(fresh);
    recordSettingsReceipt(buildSettingsLocalChatsClearedReceipt());
    setNotice("All local Colloquium chats were cleared in this browser.");
  }

  function handleExportAllChats() {
    if (!sessionsDoc) return;
    downloadText(
      `squidley-local-chats-${new Date().toISOString().slice(0, 10)}.txt`,
      formatChatSessionsExport(sessionsDoc),
      "text/plain;charset=utf-8",
    );
    recordSettingsReceipt(buildSettingsLocalChatsExportedReceipt({
      sessionCount: chatSummary.sessionCount,
      messageCount: chatSummary.messageCount,
    }));
  }

  function handleClearArchivum() {
    const confirmed = window.confirm("Clear all Archivum entries? This only clears Archivum entries saved in this browser.");
    if (!confirmed) return;
    const fresh = createArchivumDocument();
    saveArchivum(window.localStorage, fresh);
    setArchivumDoc(fresh);
    recordSettingsReceipt(buildSettingsArchivumClearedReceipt());
    setNotice("All Archivum entries were cleared in this browser.");
  }

  function handleExportReceipts() {
    if (!tabulariumDoc) return;
    downloadText(
      `squidley-tabularium-${new Date().toISOString().slice(0, 10)}.txt`,
      formatTabulariumExport(tabulariumDoc),
      "text/plain;charset=utf-8",
    );
    recordSettingsReceipt(buildSettingsReceiptsExportedReceipt(tabulariumSummary.receiptCount));
  }

  function handleClearReceipts() {
    const confirmed = window.confirm("Clear Tabularium receipts? This only clears receipts saved in this browser.");
    if (!confirmed) return;
    const fresh = clearTabulariumReceipts();
    saveTabularium(window.localStorage, fresh);
    setTabulariumDoc(fresh);
    setNotice("Tabularium receipts were cleared in this browser.");
  }

  return (
    <div className="sq-page mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="border-b border-ink-200 pb-5 dark:border-ink-700">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-iris-600 dark:text-iris-300">
          Squidley · Settings
        </p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-ink-900 dark:text-ink-50">
          Local Control Center
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600 dark:text-ink-300">
          Manage the data Public Squidley stores in this browser, see local model
          information, and restart guided tours. No cloud fallback is used here.
        </p>
        <nav className="mt-4 flex flex-wrap gap-2 text-xs">
          {[
            ["/colloquium", "Colloquium"],
            ["/fabrica", "Fabrica"],
            ["/velum", "Velum"],
            ["/archivum", "Archivum"],
            ["/tabularium", "Tabularium"],
            ["/nous", "Nous"],
            ["/modules", "Modules"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {notice && (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100">
          {notice}
        </p>
      )}

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Local Model">
          <p className="text-sm text-ink-500 dark:text-ink-300">
            These values come from the configured local Ollama-compatible endpoint. Endpoint/model editing is read-only in this pass because chat API routes use server-side configuration.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <InfoRow label="Health" value={localInfo.health} />
            <InfoRow label="Endpoint" value={localInfo.endpoint} />
            <InfoRow label="Configured model" value={localInfo.configuredModel} />
            <InfoRow label="Selected model" value={localInfo.selectedModel || "Not selected yet"} />
            <InfoRow label="Discovered models" value={typeof localInfo.modelCount === "number" ? String(localInfo.modelCount) : "Unknown"} />
          </dl>
          <p className="mt-3 text-xs text-ink-400">Public Squidley does not use cloud fallback here.</p>
        </Panel>

        <Panel title="Tours & Onboarding">
          <p className="text-sm text-ink-500 dark:text-ink-300">Tour controls affect only this browser.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {TOUR_LINKS.map((tour) => (
              <Link
                key={tour.href}
                href={tour.href}
                onClick={() => handleRestartTour(tour.module)}
                className="rounded-lg border border-iris-200 bg-white px-3 py-2 text-sm font-medium text-iris-700 hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100"
              >
                {tour.label}
              </Link>
            ))}
            <button type="button" onClick={handleResetWelcome} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
              Reset welcome / first-run
            </button>
          </div>
        </Panel>

        <Panel title="Local Chat Storage">
          <p className="text-sm text-ink-500 dark:text-ink-300">Chats are saved only in this browser.</p>
          <dl className="mt-4 space-y-2 text-sm">
            <InfoRow label="Sessions" value={String(chatSummary.sessionCount)} />
            <InfoRow label="Saved messages" value={String(chatSummary.messageCount)} />
            <InfoRow label="Chat receipts" value={String(chatSummary.receiptCount)} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={handleExportAllChats} disabled={!sessionsDoc} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
              Export all local chats
            </button>
            <button type="button" onClick={handleClearAllChats} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-700/60 dark:bg-ink-900 dark:text-amber-100">
              Clear all local chats
            </button>
          </div>
        </Panel>

        <Panel title="Archivum Storage">
          <p className="text-sm text-ink-500 dark:text-ink-300">Archivum entries and tags are saved only in this browser.</p>
          <dl className="mt-4 space-y-2 text-sm">
            <InfoRow label="Entries" value={String(archivumSummary.entryCount)} />
            <InfoRow label="Tags" value={String(archivumSummary.tagCount)} />
            <InfoRow label="Approx. characters" value={String(archivumSummary.characterCount)} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/archivum" className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
              Open Archivum import/export
            </Link>
            <button type="button" onClick={handleClearArchivum} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-700/60 dark:bg-ink-900 dark:text-amber-100">
              Clear all Archivum entries
            </button>
          </div>
        </Panel>

        <Panel title="Tabularium Receipts">
          <p className="text-sm text-ink-500 dark:text-ink-300">Receipts are local records of visible Squidley actions.</p>
          <dl className="mt-4 space-y-2 text-sm">
            <InfoRow label="Receipts" value={String(tabulariumSummary.receiptCount)} />
            <InfoRow label="Oldest" value={formatMaybeDate(tabulariumSummary.oldestReceiptAt)} />
            <InfoRow label="Newest" value={formatMaybeDate(tabulariumSummary.newestReceiptAt)} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={handleExportReceipts} disabled={!tabulariumDoc} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
              Export receipts
            </button>
            <button type="button" onClick={handleClearReceipts} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-700/60 dark:bg-ink-900 dark:text-amber-100">
              Clear receipts
            </button>
          </div>
          <p className="mt-3 text-xs text-ink-400">Receipt retention settings are not editable yet; this pass keeps the existing local receipt cap.</p>
        </Panel>

        <Panel title="Privacy & Local-Only">
          <LocalStatusNote variant="localOnly" />
          <ul className="space-y-2 text-sm text-ink-500 dark:text-ink-300">
            <li>Colloquium uses your configured local model server.</li>
            <li>Velum review is deterministic and client-side.</li>
            <li>Archivum entries are stored in this browser.</li>
            <li>Tabularium receipts are stored in this browser.</li>
            <li>No cloud fallback is used in the current public local version.</li>
            <li>Clearing browser storage may remove local Squidley data.</li>
          </ul>
          <div className="mt-4 rounded-lg border border-ink-100 bg-ink-50/70 p-3 dark:border-ink-700/60 dark:bg-ink-900/40">
            <p className="text-sm text-ink-600 dark:text-ink-300">
              Found a bug? Squidley can open a prefilled email. No telemetry,
              logs, local storage, prompts, or documents are attached automatically.
            </p>
            <BugReportLink
              pageModule="Settings"
              issueSummary="Settings issue"
              className="mt-2 inline-flex rounded-lg border border-iris-200 bg-white px-3 py-2 text-sm font-medium text-iris-700 hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100"
            />
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
      <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-ink-100 pb-2 dark:border-ink-700">
      <dt className="text-ink-400">{label}</dt>
      <dd className="text-right font-mono text-xs text-ink-700 dark:text-ink-100">{value}</dd>
    </div>
  );
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatMaybeDate(value: number | undefined): string {
  return typeof value === "number" ? new Date(value).toLocaleString() : "None";
}
