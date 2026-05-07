"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CompanionTourPanel } from "@/components/CompanionTourPanel";
import { RatioCapabilityNote } from "@/components/RatioCapabilityNote";
import { TourHighlight } from "@/components/TourHighlight";
import {
  markTourCompleted,
  readTourMode,
  restartTour as persistRestartTour,
} from "@/lib/firstRun";
import {
  createArchivumDocument,
  createArchivumEntry,
  deleteArchivumEntry,
  filterArchivumEntries,
  formatArchivumBundle,
  formatArchivumExport,
  formatArchivumTags,
  getArchivumTags,
  importArchivumBundle,
  loadArchivum,
  parseArchivumBundle,
  saveArchivum,
  updateArchivumEntry,
  upsertArchivumEntry,
  type ArchivumDocument,
  type ArchivumEntry,
  type ArchivumEntryType,
  type ArchivumImportPreview,
  type ArchivumRiskSummary,
  type ArchivumStatusFilter,
  type ArchivumTagFilter,
  type ArchivumTypeFilter,
} from "@/lib/archivum/storage";
import { getTour } from "@/lib/tour";
import { logTabulariumReceipt } from "@/lib/tabularium/receipts";
import {
  buildArchivumBundleExportedReceipt,
  buildArchivumBundleImportedReceipt,
  buildArchivumBundleImportFailedReceipt,
  buildArchivumEntryCreatedReceipt,
  buildArchivumEntryDeletedReceipt,
  buildArchivumEntryEditedReceipt,
  buildArchivumEntryExportedReceipt,
  buildArchivumVelumHandoffCreatedReceipt,
  buildArchivumVelumHandoffReceivedReceipt,
} from "@/lib/archivum/receipts";
import {
  consumeVelumToMoreInputHandoff,
  saveMoreInputToVelumHandoff,
} from "@/lib/velum/handoff";
import { archivumFutureSummarizeDecision, archivumLocalStorageDecision } from "@/lib/ratio";
import {
  recordArchivumLocalStorageCapabilityReceipt,
  recordMoreInputLocalStorageCapabilityReceipt,
} from "@/lib/archivum/capabilityReceipts";

const ENTRY_TYPES: ArchivumEntryType[] = ["note", "log", "article", "code", "other"];

export default function ArchivumPage() {
  const router = useRouter();
  const [doc, setDoc] = useState<ArchivumDocument>(() => createArchivumDocument());
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ArchivumEntryType>("note");
  const [tagText, setTagText] = useState("");
  const [text, setText] = useState("");
  const [velumReviewed, setVelumReviewed] = useState(false);
  const [riskSummary, setRiskSummary] = useState<ArchivumRiskSummary | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ArchivumTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ArchivumStatusFilter>("all");
  const [tagFilter, setTagFilter] = useState<ArchivumTagFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState<ArchivumEntryType>("note");
  const [editTagText, setEditTagText] = useState("");
  const [editText, setEditText] = useState("");
  const [editVelumReviewed, setEditVelumReviewed] = useState(false);
  const [editRiskSummary, setEditRiskSummary] = useState<ArchivumRiskSummary | undefined>();
  const [tourActive, setTourActive] = useState(false);
  const [tourRunId, setTourRunId] = useState(0);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ArchivumImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const selected = useMemo(
    () => doc.entries.find((entry) => entry.id === selectedId) ?? null,
    [doc.entries, selectedId],
  );
  const filteredEntries = useMemo(
    () => filterArchivumEntries({
      entries: doc.entries,
      query,
      type: typeFilter,
      status: statusFilter,
      tag: tagFilter,
    }),
    [doc.entries, query, statusFilter, tagFilter, typeFilter],
  );
  const availableTags = useMemo(() => getArchivumTags(doc.entries), [doc.entries]);
  const editing = useMemo(
    () => doc.entries.find((entry) => entry.id === editingId) ?? null,
    [doc.entries, editingId],
  );
  const tour = useMemo(() => getTour("archivum")!, []);
  const localStorageRatio = useMemo(() => archivumLocalStorageDecision(), []);
  const futureSummarizeRatio = useMemo(() => archivumFutureSummarizeDecision(), []);

  useEffect(() => {
    const loaded = loadArchivum(window.localStorage);
    const returned = consumeVelumToMoreInputHandoff(window.sessionStorage);
    setDoc(loaded);
    if (returned) {
      if (returned.entryId && loaded.entries.some((entry) => entry.id === returned.entryId)) {
        setSelectedId(returned.entryId);
        setEditingId(returned.entryId);
        setEditTitle(returned.title ?? "");
        setEditType(isEntryType(returned.entryType) ? returned.entryType : "note");
        const original = loaded.entries.find((entry) => entry.id === returned.entryId);
        setEditTagText(formatArchivumTags(original?.tags ?? []));
        setEditText(returned.redactedText);
        setEditVelumReviewed(true);
        setEditRiskSummary(returned.riskSummary);
        setNotice("Redacted text returned from Velum. Review it, then click Save Changes when ready.");
        logTabulariumReceipt(window.localStorage, buildArchivumVelumHandoffReceivedReceipt({
          edit: true,
          entryId: returned.entryId,
        }));
      } else {
        setTitle(returned.title ?? "");
        setType(isEntryType(returned.entryType) ? returned.entryType : "note");
        setTagText("");
        setText(returned.redactedText);
        setVelumReviewed(true);
        setRiskSummary(returned.riskSummary);
        setNotice("Redacted text returned from Velum. Review it, then click Save to Archivum when ready.");
        logTabulariumReceipt(window.localStorage, buildArchivumVelumHandoffReceivedReceipt());
      }
    }
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("tour") === "1";
    setTourActive(fromQuery || readTourMode() === "on");
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    saveArchivum(window.localStorage, doc);
  }, [doc, hasLoaded]);

  function handleReviewInVelum() {
    if (text.trim().length === 0) return;
    const ok = saveMoreInputToVelumHandoff(window.sessionStorage, {
      draftText: text,
      title,
      entryType: type,
    });
    if (!ok) {
      setNotice("Squidley could not prepare this text for Velum in this browser.");
      return;
    }
    logTabulariumReceipt(window.localStorage, buildArchivumVelumHandoffCreatedReceipt());
    router.push("/velum?from=more-input");
  }

  function handleReviewEditInVelum() {
    if (!editingId || editText.trim().length === 0) return;
    const ok = saveMoreInputToVelumHandoff(window.sessionStorage, {
      draftText: editText,
      title: editTitle,
      entryType: editType,
      entryId: editingId,
    });
    if (!ok) {
      setNotice("Squidley could not prepare this edited text for Velum in this browser.");
      return;
    }
    logTabulariumReceipt(window.localStorage, buildArchivumVelumHandoffCreatedReceipt({
      edit: true,
      entryId: editingId,
    }));
    router.push("/velum?from=more-input");
  }

  function handleSave() {
    if (text.trim().length === 0) return;
    const entry = createArchivumEntry({
      title,
      type,
      text,
      tags: tagText,
      velumReviewed,
      velumRiskSummary: riskSummary,
    });
    setDoc((prev) => upsertArchivumEntry(prev, entry));
    logTabulariumReceipt(window.localStorage, buildArchivumEntryCreatedReceipt(entry));
    recordMoreInputLocalStorageCapabilityReceipt(window.localStorage);
    setSelectedId(entry.id);
    setNotice(velumReviewed ? "Saved to Archivum with Velum review." : "Saved without Velum review.");
    clearDraft();
  }

  function clearDraft() {
    setTitle("");
    setType("note");
    setTagText("");
    setText("");
    setVelumReviewed(false);
    setRiskSummary(undefined);
  }

  function startEdit(entry: ArchivumEntry) {
    setSelectedId(entry.id);
    setEditingId(entry.id);
    setEditTitle(entry.title);
    setEditType(entry.type);
    setEditTagText(formatArchivumTags(entry.tags));
    setEditText(entry.text);
    setEditVelumReviewed(entry.velumReviewed);
    setEditRiskSummary(entry.velumRiskSummary);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditType("note");
    setEditTagText("");
    setEditText("");
    setEditVelumReviewed(false);
    setEditRiskSummary(undefined);
  }

  function handleSaveEdit() {
    if (!editing || editText.trim().length === 0) return;
    const result = updateArchivumEntry(doc, editing.id, {
      title: editTitle,
      type: editType,
      text: editText,
      tags: editTagText,
      velumReviewed: editVelumReviewed,
      velumRiskSummary: editRiskSummary,
    });
    setDoc(result.doc);
    logTabulariumReceipt(window.localStorage, buildArchivumEntryEditedReceipt({
      entryId: editing.id,
      reviewReset: result.reviewReset,
    }));
    recordArchivumLocalStorageCapabilityReceipt(window.localStorage);
    setSelectedId(editing.id);
    setNotice(
      result.reviewReset
        ? "Because this text changed, Velum review status was reset."
        : editVelumReviewed
          ? "Saved changes with Velum review."
          : "Saved changes.",
    );
    cancelEdit();
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

  function handleDelete(entry: ArchivumEntry) {
    const ok = window.confirm("Delete this Archivum entry? This only deletes the entry saved in this browser.");
    if (!ok) return;
    setDoc((prev) => deleteArchivumEntry(prev, entry.id));
    logTabulariumReceipt(window.localStorage, buildArchivumEntryDeletedReceipt(entry.id));
    if (selectedId === entry.id) setSelectedId(null);
    if (editingId === entry.id) cancelEdit();
  }

  function handleExport(entry: ArchivumEntry) {
    logTabulariumReceipt(window.localStorage, buildArchivumEntryExportedReceipt(entry.id));
    const blob = new Blob([formatArchivumExport(entry)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `squidley-archivum-${entry.id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleExportAll() {
    logTabulariumReceipt(window.localStorage, buildArchivumBundleExportedReceipt(doc.entries.length));
    const blob = new Blob([formatArchivumBundle(doc)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `squidley-archivum-bundle-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File | null) {
    setImportPreview(null);
    setImportError(null);
    if (!file) return;
    try {
      const raw = await file.text();
      const preview = parseArchivumBundle(raw);
      if (!preview) {
        setImportError("That file is not a valid Squidley Public Archivum Bundle.");
        logTabulariumReceipt(window.localStorage, buildArchivumBundleImportFailedReceipt());
        return;
      }
      setImportPreview(preview);
    } catch {
      setImportError("Squidley could not read that file in this browser.");
    }
  }

  function handleConfirmImport() {
    if (!importPreview) return;
    const result = importArchivumBundle(doc, importPreview.bundle);
    setDoc(result.doc);
    setImportPreview(null);
    setImportError(null);
    setNotice(`Imported ${result.importedCount} entries. Imported entries were not automatically reviewed by Velum.`);
    logTabulariumReceipt(window.localStorage, buildArchivumBundleImportedReceipt(result.importedCount));
    recordArchivumLocalStorageCapabilityReceipt(window.localStorage);
  }

  return (
    <div className="sq-page mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TourHighlight target="intro" active={activeTarget}>
      <header className="border-b border-ink-200 pb-5 dark:border-ink-700">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-iris-600 dark:text-iris-300">
          Squidley · Archivum
        </p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-ink-900 dark:text-ink-50">
          Local knowledge shelf
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600 dark:text-ink-300">
          Archivum is your local knowledge shelf. Save notes, snippets, and
          documents here so Squidley can help you organize and understand them.
        </p>
        <TourHighlight target="local-only-indicator" active={activeTarget}>
          <p className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100">
            Browser-local · manual paste only · no cloud sync
          </p>
        </TourHighlight>
        <nav className="mt-4 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={handleRestartTour}
            className="rounded-lg border border-iris-200 bg-white px-3 py-1.5 font-medium text-iris-700 shadow-sm hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-800 dark:text-iris-100"
          >
            Restart tour
          </button>
          <Link href="/colloquium" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
            Colloquium
          </Link>
          <Link href="/velum" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
            Velum
          </Link>
          <Link href="/modules" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
            Modules
          </Link>
          <Link href="/tabularium" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
            Tabularium
          </Link>
          <Link href="/nous" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
            Nous
          </Link>
          <Link href="/settings" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
            Settings
          </Link>
        </nav>
      </header>
      </TourHighlight>

      {notice && (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100">
          {notice}
        </p>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <RatioCapabilityNote decision={localStorageRatio} title="Ratio: local storage and search" compact />
        <RatioCapabilityNote decision={futureSummarizeRatio} title="Ratio: future summarize/retrieval" compact />
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <TourHighlight
          target="more-input-form"
          active={activeTarget}
          className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800"
        >
          <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
            More Input
          </h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">
            Paste something you want to keep locally. Velum review is optional but recommended.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px]">
            <label className="text-sm font-medium text-ink-700 dark:text-ink-100">
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                placeholder="Optional"
              />
            </label>
            <label className="text-sm font-medium text-ink-700 dark:text-ink-100">
              Type
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ArchivumEntryType)}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              >
                {ENTRY_TYPES.map((entryType) => (
                  <option key={entryType} value={entryType}>
                    {entryType}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 block text-sm font-medium text-ink-700 dark:text-ink-100">
            Tags
            <input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              placeholder="troubleshooting, notes, project"
            />
            <span className="mt-1 block text-xs font-normal text-ink-400">
              Tags stay local and help you find entries later.
            </span>
          </label>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setVelumReviewed(false);
              setRiskSummary(undefined);
            }}
            rows={11}
            className="mt-3 w-full resize-y rounded-xl border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
            placeholder="Paste a note, snippet, log, article, or code sample."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <TourHighlight target="archivum-save" active={activeTarget}>
              <button
                type="button"
                onClick={handleSave}
                disabled={text.trim().length === 0}
                className="rounded-lg bg-squid-600 px-4 py-2 text-sm font-medium text-white hover:bg-squid-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save to Archivum
              </button>
            </TourHighlight>
            <TourHighlight target="archivum-velum-review" active={activeTarget}>
              <button
                type="button"
                onClick={handleReviewInVelum}
                disabled={text.trim().length === 0}
                className="rounded-lg border border-iris-200 bg-white px-4 py-2 text-sm font-medium text-iris-700 hover:bg-iris-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100"
              >
                Review in Velum first
              </button>
            </TourHighlight>
            <button
              type="button"
              onClick={clearDraft}
              className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
            >
              Clear draft
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-400">
            {velumReviewed
              ? `Velum reviewed: ${riskSummary?.overallRisk ?? "low"} risk, ${riskSummary?.findingCount ?? 0} finding(s).`
              : "If you save now, this entry will be marked as saved without Velum review."}
          </p>
        </TourHighlight>

        <TourHighlight
          target="archivum-list"
          active={activeTarget}
          className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800"
        >
          <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">
            Saved entries
          </h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">
            Stored only in this browser.
          </p>
          <div className="mt-4 space-y-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              placeholder="Search title, type, or text"
            />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as ArchivumTypeFilter)}
                className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-xs text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              >
                <option value="all">All types</option>
                <option value="note">Notes</option>
                <option value="log">Logs</option>
                <option value="article">Articles</option>
                <option value="code">Code snippets</option>
                <option value="other">Other</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ArchivumStatusFilter)}
                className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-xs text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              >
                <option value="all">All Velum states</option>
                <option value="reviewed">Reviewed</option>
                <option value="unreviewed">Unreviewed</option>
              </select>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value as ArchivumTagFilter)}
                className="rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-xs text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              >
                <option value="all">All tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50/60 p-3 dark:border-ink-700/60 dark:bg-ink-900/40">
            <p className="text-xs text-ink-500 dark:text-ink-300">
              Back up or move entries with an explicit local JSON bundle.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportAll}
                disabled={doc.entries.length === 0}
                className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
              >
                Export All
              </button>
              <label className="cursor-pointer rounded-lg border border-iris-200 bg-white px-3 py-1.5 text-xs font-medium text-iris-700 hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100">
                Import Bundle
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(e) => void handleImportFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {importError && <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">{importError}</p>}
            {importPreview && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100">
                <p>Bundle preview: {importPreview.entryCount} entries · exported {importPreview.exportedAt}</p>
                <p className="mt-1">Sample: {importPreview.sampleTitles.join(", ") || "No titles"}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={handleConfirmImport} className="rounded-md bg-squid-600 px-3 py-1 text-white">
                    Import entries
                  </button>
                  <button type="button" onClick={() => setImportPreview(null)} className="rounded-md border border-emerald-300 px-3 py-1">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          {doc.entries.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-ink-200 bg-ink-50/70 px-3 py-4 text-center text-xs text-ink-500 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-300">
              No Archivum entries yet.
            </p>
          ) : filteredEntries.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-ink-200 bg-ink-50/70 px-3 py-4 text-center text-xs text-ink-500 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-300">
              No entries match that search or filter.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {filteredEntries.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-ink-100 bg-ink-50/70 p-3 dark:border-ink-700/60 dark:bg-ink-900/40">
                  <h3 className="truncate font-medium text-ink-800 dark:text-ink-100" title={entry.title}>
                    {entry.title}
                  </h3>
                  <TourHighlight target="archivum-badges" active={activeTarget}>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wide text-ink-400">
                      <span>{entry.type}</span>
                      <span>{entrySourceLabel(entry.source)}</span>
                      <span>local</span>
                      <span>{entry.velumReviewed ? "Velum reviewed" : "unreviewed"}</span>
                    </div>
                  </TourHighlight>
                  {entry.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {entry.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 line-clamp-3 text-xs text-ink-500 dark:text-ink-300">
                    {entry.text.slice(0, 180)}
                  </p>
                  <p className="mt-2 text-[11px] text-ink-400">
                    Updated {new Date(entry.updatedAt).toLocaleString()}
                  </p>
                  <TourHighlight target="archivum-entry-actions" active={activeTarget}>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setSelectedId(entry.id)} className="text-xs font-medium text-iris-600 hover:text-iris-700 dark:text-iris-300">
                      View details
                    </button>
                    <button type="button" onClick={() => startEdit(entry)} className="text-xs font-medium text-squid-700 hover:text-squid-800 dark:text-squid-300">
                      Edit
                    </button>
                    <button type="button" onClick={() => handleExport(entry)} className="text-xs font-medium text-ink-600 hover:text-ink-800 dark:text-ink-300">
                      Export
                    </button>
                    <button type="button" onClick={() => handleDelete(entry)} className="text-xs font-medium text-amber-700 hover:text-amber-800 dark:text-amber-300">
                      Delete
                    </button>
                  </div>
                  </TourHighlight>
                </li>
              ))}
            </ul>
          )}
        </TourHighlight>
      </section>

      {editing && (
        <section className="mt-4 rounded-xl border border-iris-200 bg-white p-4 shadow-sm dark:border-iris-700/60 dark:bg-ink-800">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
                Edit entry
              </h2>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">
                Changes stay in this browser and are saved only when you click Save Changes.
              </p>
            </div>
            <button type="button" onClick={cancelEdit} className="text-xs text-ink-400 hover:text-ink-700 dark:hover:text-ink-100">
              Cancel
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px]">
            <label className="text-sm font-medium text-ink-700 dark:text-ink-100">
              Title
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              />
            </label>
            <label className="text-sm font-medium text-ink-700 dark:text-ink-100">
              Type
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value as ArchivumEntryType)}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              >
                {ENTRY_TYPES.map((entryType) => (
                  <option key={entryType} value={entryType}>
                    {entryType}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 block text-sm font-medium text-ink-700 dark:text-ink-100">
            Tags
            <input
              value={editTagText}
              onChange={(e) => setEditTagText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              placeholder="troubleshooting, notes, project"
            />
            <span className="mt-1 block text-xs font-normal text-ink-400">
              Changing tags alone does not reset Velum review.
            </span>
          </label>
          <textarea
            value={editText}
            onChange={(e) => {
              setEditText(e.target.value);
              setEditVelumReviewed(false);
              setEditRiskSummary(undefined);
            }}
            rows={10}
            className="mt-3 w-full resize-y rounded-xl border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={editText.trim().length === 0}
              className="rounded-lg bg-squid-600 px-4 py-2 text-sm font-medium text-white hover:bg-squid-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={handleReviewEditInVelum}
              disabled={editText.trim().length === 0}
              className="rounded-lg border border-iris-200 bg-white px-4 py-2 text-sm font-medium text-iris-700 hover:bg-iris-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100"
            >
              Review edited text in Velum
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-400">
            {editVelumReviewed
              ? `Velum reviewed: ${editRiskSummary?.overallRisk ?? "low"} risk, ${editRiskSummary?.findingCount ?? 0} finding(s).`
              : "If the text changed, save will mark this entry as needing Velum review again."}
          </p>
        </section>
      )}

      {selected && (
        <TourHighlight
          target="archivum-entry-detail"
          active={activeTarget}
          className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
                {selected.title}
              </h2>
              <TourHighlight target="archivum-badges" active={activeTarget}>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full border border-ink-200 px-2 py-0.5 text-ink-500 dark:border-ink-700 dark:text-ink-300">
                  {selected.type}
                </span>
                  <span className="rounded-full border border-ink-200 px-2 py-0.5 text-ink-500 dark:border-ink-700 dark:text-ink-300">
                    {entrySourceLabel(selected.source)}
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100">
                    local-only
                  </span>
                  <span className="rounded-full border border-iris-200 bg-iris-50 px-2 py-0.5 text-iris-700 dark:border-iris-700/60 dark:bg-iris-900/20 dark:text-iris-100">
                    {selected.velumReviewed ? "Velum reviewed" : "saved without Velum review"}
                  </span>
                </div>
              </TourHighlight>
              {selected.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selected.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-ink-200 px-2 py-0.5 text-xs text-ink-500 dark:border-ink-700 dark:text-ink-300">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-ink-400">
                Created {new Date(selected.createdAt).toLocaleString()} · Updated {new Date(selected.updatedAt).toLocaleString()}
              </p>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} className="text-xs text-ink-400 hover:text-ink-700 dark:hover:text-ink-100">
              Close
            </button>
          </div>
          {selected.velumRiskSummary && (
            <p className="mt-3 rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2 text-xs text-ink-600 dark:border-ink-700/60 dark:bg-ink-900/40 dark:text-ink-300">
              Velum risk: {selected.velumRiskSummary.overallRisk}; findings: {selected.velumRiskSummary.findingCount}; highest: {selected.velumRiskSummary.highestSeverity}.
            </p>
          )}
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-ink-100 bg-ink-50/70 p-3 text-sm text-ink-800 dark:border-ink-700/60 dark:bg-ink-900 dark:text-ink-100">
            {selected.text}
          </pre>
          <TourHighlight target="archivum-entry-actions" active={activeTarget}>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => startEdit(selected)} className="rounded-lg border border-squid-200 bg-white px-3 py-1.5 text-xs font-medium text-squid-700 hover:bg-squid-50 dark:border-squid-700/60 dark:bg-ink-900 dark:text-squid-100">
              Edit
            </button>
            <button type="button" onClick={() => handleExport(selected)} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
              Export
            </button>
            <button type="button" onClick={() => handleDelete(selected)} className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700/60 dark:bg-ink-900 dark:text-amber-200">
              Delete
            </button>
          </div>
          </TourHighlight>
        </TourHighlight>
      )}

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

function isEntryType(value: unknown): value is ArchivumEntryType {
  return value === "note" || value === "log" || value === "article" || value === "code" || value === "other";
}

function entrySourceLabel(source: string): string {
  if (source === "oculus-analysis") return "Oculus analysis";
  if (source === "fabrica-suggestion") return "Fabrica suggestion";
  return "manual paste";
}
