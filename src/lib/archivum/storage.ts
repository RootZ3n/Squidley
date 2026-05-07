export { ARCHIVUM_STORAGE_KEY } from "@/lib/archivum/constants";
import {
  ARCHIVUM_BUNDLE_NAME,
  ARCHIVUM_ENTRY_SOURCES,
  ARCHIVUM_EXPORT_HEADER,
  ARCHIVUM_STORAGE_KEY,
} from "@/lib/archivum/constants";
export const ARCHIVUM_STORAGE_VERSION = 1;
export const ARCHIVUM_BUNDLE_SCHEMA_VERSION = 1;
export const ARCHIVUM_MAX_TAGS = 12;
export const ARCHIVUM_MAX_TAG_LENGTH = 32;

export type ArchivumEntryType = "note" | "log" | "article" | "code" | "other";
export type ArchivumRisk = "low" | "medium" | "high";
export type ArchivumEntrySource = (typeof ARCHIVUM_ENTRY_SOURCES)[keyof typeof ARCHIVUM_ENTRY_SOURCES];

export interface ArchivumRiskSummary {
  overallRisk: ArchivumRisk;
  findingCount: number;
  highestSeverity: ArchivumRisk;
}

export interface ArchivumEntry {
  id: string;
  title: string;
  type: ArchivumEntryType;
  text: string;
  createdAt: number;
  updatedAt: number;
  source: ArchivumEntrySource;
  localOnly: true;
  cloudUsed: false;
  velumReviewed: boolean;
  velumRiskSummary?: ArchivumRiskSummary;
  tags: string[];
}

export interface ArchivumDocument {
  version: typeof ARCHIVUM_STORAGE_VERSION;
  savedAt: number;
  localOnly: true;
  cloudUsed: false;
  entries: ArchivumEntry[];
}

export type ArchivumStatusFilter = "all" | "reviewed" | "unreviewed";
export type ArchivumTypeFilter = "all" | ArchivumEntryType;
export type ArchivumTagFilter = "all" | string;

export interface ArchivumBundle {
  bundleName: typeof ARCHIVUM_BUNDLE_NAME;
  schemaVersion: typeof ARCHIVUM_BUNDLE_SCHEMA_VERSION;
  exportedAt: string;
  entryCount: number;
  localOnly: true;
  cloudUsed: false;
  entries: ArchivumEntry[];
}

export interface ArchivumImportPreview {
  bundle: ArchivumBundle;
  entryCount: number;
  exportedAt: string;
  sampleTitles: string[];
}

export function fallbackArchivumTitle(text: string, fallback = "Untitled note"): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length === 0) return fallback;
  return compact.length <= 56 ? compact : `${compact.slice(0, 55)}…`;
}

export function parseArchivumTags(input: string | readonly string[] | undefined): string[] {
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

export function formatArchivumTags(tags: readonly string[]): string {
  return parseArchivumTags(tags).join(", ");
}

export function createArchivumEntry(args: {
  title?: string;
  type: ArchivumEntryType;
  text: string;
  velumReviewed?: boolean;
  velumRiskSummary?: ArchivumRiskSummary;
  tags?: string[] | string;
  source?: ArchivumEntrySource;
  now?: number;
  updatedAt?: number;
  id?: string;
}): ArchivumEntry {
  const now = args.now ?? Date.now();
  const text = args.text.trim();
  const title = (args.title ?? "").trim() || fallbackArchivumTitle(text);
  return {
    id: args.id ?? `archivum-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    type: isEntryType(args.type) ? args.type : "other",
    text,
    createdAt: now,
    updatedAt: args.updatedAt ?? now,
    source: isEntrySource(args.source) ? args.source : ARCHIVUM_ENTRY_SOURCES.manualPaste,
    localOnly: true,
    cloudUsed: false,
    velumReviewed: args.velumReviewed === true,
    tags: parseArchivumTags(args.tags),
    ...(args.velumRiskSummary ? { velumRiskSummary: args.velumRiskSummary } : {}),
  };
}

export function createArchivumEntryFromOculusAnalysis(args: {
  title?: string;
  text: string;
  tags?: string[] | string;
  type?: ArchivumEntryType;
  now?: number;
  id?: string;
}): ArchivumEntry {
  return createArchivumEntry({
    id: args.id,
    title: args.title?.trim() || "Oculus analysis",
    type: args.type ?? "note",
    text: args.text,
    tags: args.tags,
    source: ARCHIVUM_ENTRY_SOURCES.oculusAnalysis,
    velumReviewed: false,
    now: args.now,
  });
}

export function createArchivumEntryFromFabricaSuggestion(args: {
  title?: string;
  text: string;
  tags?: string[] | string;
  type?: ArchivumEntryType;
  now?: number;
  id?: string;
}): ArchivumEntry {
  return createArchivumEntry({
    id: args.id,
    title: args.title?.trim() || "Fabrica suggestion",
    type: args.type ?? "note",
    text: args.text,
    tags: args.tags,
    source: ARCHIVUM_ENTRY_SOURCES.fabricaSuggestion,
    velumReviewed: false,
    now: args.now,
  });
}

export function createArchivumDocument(entries: readonly ArchivumEntry[] = [], now = Date.now()): ArchivumDocument {
  return {
    version: ARCHIVUM_STORAGE_VERSION,
    savedAt: now,
    localOnly: true,
    cloudUsed: false,
    entries: entries.map(normalizeEntry).filter(isEntry),
  };
}

export function serializeArchivum(doc: ArchivumDocument, now = Date.now()): string {
  return JSON.stringify(createArchivumDocument(doc.entries, now));
}

export function deserializeArchivum(raw: string | null): ArchivumDocument {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return createArchivumDocument();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createArchivumDocument();
  }
  const doc = parsed as Partial<ArchivumDocument> | null;
  if (
    !doc ||
    doc.version !== ARCHIVUM_STORAGE_VERSION ||
    doc.localOnly !== true ||
    doc.cloudUsed !== false ||
    !Array.isArray(doc.entries)
  ) {
    return createArchivumDocument();
  }
  return createArchivumDocument(doc.entries, typeof doc.savedAt === "number" ? doc.savedAt : Date.now());
}

export function loadArchivum(storage: Pick<Storage, "getItem">): ArchivumDocument {
  try {
    return deserializeArchivum(storage.getItem(ARCHIVUM_STORAGE_KEY));
  } catch {
    return createArchivumDocument();
  }
}

export function saveArchivum(storage: Pick<Storage, "setItem">, doc: ArchivumDocument): void {
  try {
    storage.setItem(ARCHIVUM_STORAGE_KEY, serializeArchivum(doc));
  } catch {
    // Browser storage can be blocked or full; never break the UI.
  }
}

export function upsertArchivumEntry(doc: ArchivumDocument, entry: ArchivumEntry, now = Date.now()): ArchivumDocument {
  const next = { ...entry, updatedAt: now };
  const exists = doc.entries.some((e) => e.id === entry.id);
  return createArchivumDocument(
    exists ? doc.entries.map((e) => (e.id === entry.id ? next : e)) : [next, ...doc.entries],
    now,
  );
}

export function updateArchivumEntry(
  doc: ArchivumDocument,
  entryId: string,
  updates: {
    title: string;
    type: ArchivumEntryType;
    text: string;
    tags?: string[] | string;
    velumReviewed?: boolean;
    velumRiskSummary?: ArchivumRiskSummary;
  },
  now = Date.now(),
): { doc: ArchivumDocument; reviewReset: boolean } {
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
      title: updates.title.trim() || fallbackArchivumTitle(nextText),
      type: isEntryType(updates.type) ? updates.type : "other",
      text: nextText,
      tags: parseArchivumTags(updates.tags ?? entry.tags),
      updatedAt: now,
      velumReviewed: reviewed,
      ...(reviewed && updates.velumRiskSummary
        ? { velumRiskSummary: updates.velumRiskSummary }
        : reviewed && !contentChanged && existingRiskSummary
          ? { velumRiskSummary: existingRiskSummary }
          : {}),
    };
  });
  return { doc: createArchivumDocument(nextEntries, now), reviewReset };
}

export function deleteArchivumEntry(doc: ArchivumDocument, entryId: string, now = Date.now()): ArchivumDocument {
  return createArchivumDocument(doc.entries.filter((e) => e.id !== entryId), now);
}

export function filterArchivumEntries(args: {
  entries: readonly ArchivumEntry[];
  query?: string;
  type?: ArchivumTypeFilter;
  status?: ArchivumStatusFilter;
  tag?: ArchivumTagFilter;
}): ArchivumEntry[] {
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

export function getArchivumTags(entries: readonly ArchivumEntry[]): string[] {
  return parseArchivumTags(entries.flatMap((entry) => entry.tags)).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function formatArchivumExport(entry: ArchivumEntry, exportedAt = new Date().toISOString()): string {
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

export function formatArchivumBundle(
  doc: ArchivumDocument,
  exportedAt = new Date().toISOString(),
): string {
  const bundle: ArchivumBundle = {
    bundleName: ARCHIVUM_BUNDLE_NAME,
    schemaVersion: ARCHIVUM_BUNDLE_SCHEMA_VERSION,
    exportedAt,
    entryCount: doc.entries.length,
    localOnly: true,
    cloudUsed: false,
    entries: createArchivumDocument(doc.entries).entries,
  };
  return JSON.stringify(bundle, null, 2);
}

export function parseArchivumBundle(raw: string): ArchivumImportPreview | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const bundle = parsed as Partial<ArchivumBundle> | null;
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
  const entries = createArchivumDocument(bundle.entries).entries;
  const normalized: ArchivumBundle = {
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

export function importArchivumBundle(
  doc: ArchivumDocument,
  bundle: ArchivumBundle,
  now = Date.now(),
): { doc: ArchivumDocument; importedCount: number } {
  const existing = new Set(doc.entries.map((entry) => entry.id));
  const imported = bundle.entries.map((entry, index) => {
    const id = existing.has(entry.id) ? `archivum-import-${now}-${index}` : entry.id;
    existing.add(id);
    return createArchivumEntry({
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
    doc: createArchivumDocument([...imported, ...doc.entries], now),
    importedCount: imported.length,
  };
}

function normalizeEntry(raw: unknown): ArchivumEntry | null {
  const entry = raw as Partial<ArchivumEntry> | null;
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
    title: entry.title.trim() || fallbackArchivumTitle(entry.text),
    type: isEntryType(entry.type) ? entry.type : "other",
    text: entry.text,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    source: entry.source,
    localOnly: true,
    cloudUsed: false,
    velumReviewed: entry.velumReviewed,
    tags: parseArchivumTags(entry.tags),
    ...(isRiskSummary(entry.velumRiskSummary)
      ? { velumRiskSummary: entry.velumRiskSummary }
      : {}),
  };
}

function isEntryType(value: unknown): value is ArchivumEntryType {
  return value === "note" || value === "log" || value === "article" || value === "code" || value === "other";
}

function isEntrySource(value: unknown): value is ArchivumEntrySource {
  return Object.values(ARCHIVUM_ENTRY_SOURCES).includes(value as ArchivumEntrySource);
}

function isRiskSummary(value: unknown): value is ArchivumRiskSummary {
  const summary = value as Partial<ArchivumRiskSummary> | null;
  return (
    !!summary &&
    (summary.overallRisk === "low" || summary.overallRisk === "medium" || summary.overallRisk === "high") &&
    (summary.highestSeverity === "low" || summary.highestSeverity === "medium" || summary.highestSeverity === "high") &&
    typeof summary.findingCount === "number" &&
    summary.findingCount >= 0
  );
}

function isEntry(entry: ArchivumEntry | null): entry is ArchivumEntry {
  return entry !== null;
}
