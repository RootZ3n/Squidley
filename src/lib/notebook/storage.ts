export { NOTEBOOK_STORAGE_KEY } from "@/lib/notebook/constants";
import {
  ARCHIVUM_BUNDLE_NAME,
  ARCHIVUM_ENTRY_SOURCES,
  ARCHIVUM_EXPORT_HEADER,
  NOTEBOOK_STORAGE_KEY,
} from "@/lib/notebook/constants";
export const ARCHIVUM_STORAGE_VERSION = 1;
export const ARCHIVUM_BUNDLE_SCHEMA_VERSION = 1;
export const ARCHIVUM_MAX_TAGS = 12;
export const ARCHIVUM_MAX_TAG_LENGTH = 32;

export type NotebookEntryType = "note" | "log" | "article" | "code" | "other";
export type NotebookRisk = "low" | "medium" | "high";
export type NotebookEntrySource = (typeof ARCHIVUM_ENTRY_SOURCES)[keyof typeof ARCHIVUM_ENTRY_SOURCES];

export interface NotebookRiskSummary {
  overallRisk: NotebookRisk;
  findingCount: number;
  highestSeverity: NotebookRisk;
}

export interface NotebookEntry {
  id: string;
  title: string;
  type: NotebookEntryType;
  text: string;
  createdAt: number;
  updatedAt: number;
  source: NotebookEntrySource;
  localOnly: true;
  cloudUsed: false;
  velumReviewed: boolean;
  velumRiskSummary?: NotebookRiskSummary;
  tags: string[];
}

export interface NotebookDocument {
  version: typeof ARCHIVUM_STORAGE_VERSION;
  savedAt: number;
  localOnly: true;
  cloudUsed: false;
  entries: NotebookEntry[];
}

export type NotebookStatusFilter = "all" | "reviewed" | "unreviewed";
export type NotebookTypeFilter = "all" | NotebookEntryType;
export type NotebookTagFilter = "all" | string;

export interface NotebookBundle {
  bundleName: typeof ARCHIVUM_BUNDLE_NAME;
  schemaVersion: typeof ARCHIVUM_BUNDLE_SCHEMA_VERSION;
  exportedAt: string;
  entryCount: number;
  localOnly: true;
  cloudUsed: false;
  entries: NotebookEntry[];
}

export interface NotebookImportPreview {
  bundle: NotebookBundle;
  entryCount: number;
  exportedAt: string;
  sampleTitles: string[];
}

export function fallbackNotebookTitle(text: string, fallback = "Untitled note"): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length === 0) return fallback;
  return compact.length <= 56 ? compact : `${compact.slice(0, 55)}…`;
}

export function parseNotebookTags(input: string | readonly string[] | undefined): string[] {
  const values = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of values) {
    const tag = String(raw)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, ARCHIVUM_MAX_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= ARCHIVUM_MAX_TAGS) break;
  }
  return tags;
}

export function formatNotebookTags(tags: readonly string[]): string {
  return parseNotebookTags(tags).join(", ");
}

export function createNotebookEntry(args: {
  title?: string;
  type: NotebookEntryType;
  text: string;
  velumReviewed?: boolean;
  velumRiskSummary?: NotebookRiskSummary;
  tags?: string[] | string;
  source?: NotebookEntrySource;
  now?: number;
  updatedAt?: number;
  id?: string;
}): NotebookEntry {
  const now = args.now ?? Date.now();
  const text = args.text.trim();
  const title = (args.title ?? "").trim() || fallbackNotebookTitle(text);
  return {
    id: args.id ?? `notebook-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    type: isEntryType(args.type) ? args.type : "other",
    text,
    createdAt: now,
    updatedAt: args.updatedAt ?? now,
    source: isEntrySource(args.source) ? args.source : ARCHIVUM_ENTRY_SOURCES.manualPaste,
    localOnly: true,
    cloudUsed: false,
    velumReviewed: args.velumReviewed === true,
    tags: parseNotebookTags(args.tags),
    ...(args.velumRiskSummary ? { velumRiskSummary: args.velumRiskSummary } : {}),
  };
}

export function createNotebookEntryFromVisionAnalysis(args: {
  title?: string;
  text: string;
  tags?: string[] | string;
  type?: NotebookEntryType;
  now?: number;
  id?: string;
}): NotebookEntry {
  return createNotebookEntry({
    id: args.id,
    title: args.title?.trim() || "Vision analysis",
    type: args.type ?? "note",
    text: args.text,
    tags: args.tags,
    source: ARCHIVUM_ENTRY_SOURCES.oculusAnalysis,
    velumReviewed: false,
    now: args.now,
  });
}

export function createNotebookEntryFromWorkshopSuggestion(args: {
  title?: string;
  text: string;
  tags?: string[] | string;
  type?: NotebookEntryType;
  now?: number;
  id?: string;
}): NotebookEntry {
  return createNotebookEntry({
    id: args.id,
    title: args.title?.trim() || "Workshop suggestion",
    type: args.type ?? "note",
    text: args.text,
    tags: args.tags,
    source: ARCHIVUM_ENTRY_SOURCES.fabricaSuggestion,
    velumReviewed: false,
    now: args.now,
  });
}

export function createNotebookDocument(entries: readonly NotebookEntry[] = [], now = Date.now()): NotebookDocument {
  return {
    version: ARCHIVUM_STORAGE_VERSION,
    savedAt: now,
    localOnly: true,
    cloudUsed: false,
    entries: entries.map(normalizeEntry).filter(isEntry),
  };
}

export function serializeNotebook(doc: NotebookDocument, now = Date.now()): string {
  return JSON.stringify(createNotebookDocument(doc.entries, now));
}

export function deserializeNotebook(raw: string | null): NotebookDocument {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return createNotebookDocument();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createNotebookDocument();
  }
  const doc = parsed as Partial<NotebookDocument> | null;
  if (
    !doc ||
    doc.version !== ARCHIVUM_STORAGE_VERSION ||
    doc.localOnly !== true ||
    doc.cloudUsed !== false ||
    !Array.isArray(doc.entries)
  ) {
    return createNotebookDocument();
  }
  return createNotebookDocument(doc.entries, typeof doc.savedAt === "number" ? doc.savedAt : Date.now());
}

export function loadNotebook(storage: Pick<Storage, "getItem">): NotebookDocument {
  try {
    return deserializeNotebook(storage.getItem(NOTEBOOK_STORAGE_KEY));
  } catch {
    return createNotebookDocument();
  }
}

export function saveNotebook(storage: Pick<Storage, "setItem">, doc: NotebookDocument): void {
  try {
    storage.setItem(NOTEBOOK_STORAGE_KEY, serializeNotebook(doc));
  } catch {
    // Browser storage can be blocked or full; never break the UI.
  }
}

export function upsertNotebookEntry(doc: NotebookDocument, entry: NotebookEntry, now = Date.now()): NotebookDocument {
  const next = { ...entry, updatedAt: now };
  const exists = doc.entries.some((e) => e.id === entry.id);
  return createNotebookDocument(
    exists ? doc.entries.map((e) => (e.id === entry.id ? next : e)) : [next, ...doc.entries],
    now,
  );
}

export function updateNotebookEntry(
  doc: NotebookDocument,
  entryId: string,
  updates: {
    title: string;
    type: NotebookEntryType;
    text: string;
    tags?: string[] | string;
    velumReviewed?: boolean;
    velumRiskSummary?: NotebookRiskSummary;
  },
  now = Date.now(),
): { doc: NotebookDocument; reviewReset: boolean } {
  let reviewReset = false;
  const nextEntries = doc.entries.map((entry) => {
    if (entry.id !== entryId) return entry;
    const { velumRiskSummary: existingRiskSummary, ...baseEntry } = entry;
    const nextText = updates.text.trim();
    const contentChanged = entry.text !== nextText;
    const reviewed = updates.velumReviewed === true ? true : contentChanged ? false : entry.velumReviewed;
    reviewReset = contentChanged && entry.velumReviewed && !reviewed;
    return {
      ...baseEntry,
      title: updates.title.trim() || fallbackNotebookTitle(nextText),
      type: isEntryType(updates.type) ? updates.type : "other",
      text: nextText,
      tags: parseNotebookTags(updates.tags ?? entry.tags),
      updatedAt: now,
      velumReviewed: reviewed,
      ...(reviewed && updates.velumRiskSummary
        ? { velumRiskSummary: updates.velumRiskSummary }
        : reviewed && !contentChanged && existingRiskSummary
          ? { velumRiskSummary: existingRiskSummary }
          : {}),
    };
  });
  return { doc: createNotebookDocument(nextEntries, now), reviewReset };
}

export function deleteNotebookEntry(doc: NotebookDocument, entryId: string, now = Date.now()): NotebookDocument {
  return createNotebookDocument(doc.entries.filter((e) => e.id !== entryId), now);
}

export function filterNotebookEntries(args: {
  entries: readonly NotebookEntry[];
  query?: string;
  type?: NotebookTypeFilter;
  status?: NotebookStatusFilter;
  tag?: NotebookTagFilter;
}): NotebookEntry[] {
  const query = (args.query ?? "").trim().toLowerCase();
  const type = args.type ?? "all";
  const status = args.status ?? "all";
  const tag = args.tag ?? "all";
  return args.entries.filter((entry) => {
    if (type !== "all" && entry.type !== type) return false;
    if (status === "reviewed" && !entry.velumReviewed) return false;
    if (status === "unreviewed" && entry.velumReviewed) return false;
    if (tag !== "all" && !entry.tags.some((entryTag) => entryTag.toLowerCase() === tag.toLowerCase())) return false;
    if (query.length === 0) return true;
    const haystack = `${entry.title} ${entry.type} ${entry.tags.join(" ")} ${entry.text}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function getNotebookTags(entries: readonly NotebookEntry[]): string[] {
  return parseNotebookTags(entries.flatMap((entry) => entry.tags)).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function formatNotebookExport(entry: NotebookEntry, exportedAt = new Date().toISOString()): string {
  return [
    ARCHIVUM_EXPORT_HEADER,
    `exportedAt: ${exportedAt}`,
    "localOnly: true",
    "cloudUsed: false",
    "",
    `title: ${entry.title}`,
    `type: ${entry.type}`,
    `source: ${entry.source}`,
    `tags: ${entry.tags.join(", ") || "none"}`,
    `createdAt: ${new Date(entry.createdAt).toISOString()}`,
    `updatedAt: ${new Date(entry.updatedAt).toISOString()}`,
    `velumReviewed: ${entry.velumReviewed}`,
    entry.velumRiskSummary
      ? `velumRisk: ${entry.velumRiskSummary.overallRisk}, findings=${entry.velumRiskSummary.findingCount}, highest=${entry.velumRiskSummary.highestSeverity}`
      : "velumRisk: none",
    "",
    entry.text,
    "",
  ].join("\n");
}

export function formatNotebookBundle(
  doc: NotebookDocument,
  exportedAt = new Date().toISOString(),
): string {
  const bundle: NotebookBundle = {
    bundleName: ARCHIVUM_BUNDLE_NAME,
    schemaVersion: ARCHIVUM_BUNDLE_SCHEMA_VERSION,
    exportedAt,
    entryCount: doc.entries.length,
    localOnly: true,
    cloudUsed: false,
    entries: createNotebookDocument(doc.entries).entries,
  };
  return JSON.stringify(bundle, null, 2);
}

export function parseNotebookBundle(raw: string): NotebookImportPreview | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const bundle = parsed as Partial<NotebookBundle> | null;
  if (
    !bundle ||
    bundle.bundleName !== ARCHIVUM_BUNDLE_NAME ||
    bundle.schemaVersion !== ARCHIVUM_BUNDLE_SCHEMA_VERSION ||
    bundle.localOnly !== true ||
    bundle.cloudUsed !== false ||
    typeof bundle.exportedAt !== "string" ||
    !Array.isArray(bundle.entries)
  ) {
    return null;
  }
  const entries = createNotebookDocument(bundle.entries).entries;
  const normalized: NotebookBundle = {
    bundleName: ARCHIVUM_BUNDLE_NAME,
    schemaVersion: ARCHIVUM_BUNDLE_SCHEMA_VERSION,
    exportedAt: bundle.exportedAt,
    entryCount: entries.length,
    localOnly: true,
    cloudUsed: false,
    entries,
  };
  return {
    bundle: normalized,
    entryCount: entries.length,
    exportedAt: bundle.exportedAt,
    sampleTitles: entries.slice(0, 3).map((entry) => entry.title),
  };
}

export function importNotebookBundle(
  doc: NotebookDocument,
  bundle: NotebookBundle,
  now = Date.now(),
): { doc: NotebookDocument; importedCount: number } {
  const existing = new Set(doc.entries.map((entry) => entry.id));
  const imported = bundle.entries.map((entry, index) => {
    const id = existing.has(entry.id) ? `notebook-import-${now}-${index}` : entry.id;
    existing.add(id);
    return createNotebookEntry({
      id,
      title: entry.title,
      type: entry.type,
      text: entry.text,
      tags: entry.tags,
      source: entry.source,
      velumReviewed: entry.velumReviewed,
      velumRiskSummary: entry.velumRiskSummary,
      now: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
  });
  return {
    doc: createNotebookDocument([...imported, ...doc.entries], now),
    importedCount: imported.length,
  };
}

function normalizeEntry(raw: unknown): NotebookEntry | null {
  const entry = raw as Partial<NotebookEntry> | null;
  if (
    !entry ||
    typeof entry.id !== "string" ||
    typeof entry.title !== "string" ||
    typeof entry.text !== "string" ||
    typeof entry.createdAt !== "number" ||
    typeof entry.updatedAt !== "number" ||
    !isEntrySource(entry.source) ||
    entry.localOnly !== true ||
    entry.cloudUsed !== false ||
    typeof entry.velumReviewed !== "boolean"
  ) {
    return null;
  }
  return {
    id: entry.id,
    title: entry.title.trim() || fallbackNotebookTitle(entry.text),
    type: isEntryType(entry.type) ? entry.type : "other",
    text: entry.text,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    source: entry.source,
    localOnly: true,
    cloudUsed: false,
    velumReviewed: entry.velumReviewed,
    tags: parseNotebookTags(entry.tags),
    ...(isRiskSummary(entry.velumRiskSummary)
      ? { velumRiskSummary: entry.velumRiskSummary }
      : {}),
  };
}

function isEntryType(value: unknown): value is NotebookEntryType {
  return value === "note" || value === "log" || value === "article" || value === "code" || value === "other";
}

function isEntrySource(value: unknown): value is NotebookEntrySource {
  return Object.values(ARCHIVUM_ENTRY_SOURCES).includes(value as NotebookEntrySource);
}

function isRiskSummary(value: unknown): value is NotebookRiskSummary {
  const summary = value as Partial<NotebookRiskSummary> | null;
  return (
    !!summary &&
    (summary.overallRisk === "low" || summary.overallRisk === "medium" || summary.overallRisk === "high") &&
    (summary.highestSeverity === "low" || summary.highestSeverity === "medium" || summary.highestSeverity === "high") &&
    typeof summary.findingCount === "number" &&
    summary.findingCount >= 0
  );
}

function isEntry(entry: NotebookEntry | null): entry is NotebookEntry {
  return entry !== null;
}
