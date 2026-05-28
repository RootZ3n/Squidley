import { describe, expect, it, vi } from "vitest";
import {
  ARCHIVUM_STORAGE_KEY,
  createArchivumDocument,
  createArchivumEntry,
  createArchivumEntryFromFabricaSuggestion,
  createArchivumEntryFromOculusAnalysis,
  deleteArchivumEntry,
  deserializeArchivum,
  fallbackArchivumTitle,
  filterArchivumEntries,
  formatArchivumBundle,
  formatArchivumExport,
  importArchivumBundle,
  loadArchivum,
  parseArchivumBundle,
  parseArchivumTags,
  saveArchivum,
  updateArchivumEntry,
  upsertArchivumEntry,
} from "./storage";

describe("Archivum storage", () => {
  it("serializes and deserializes local-only entries", () => {
    const entry = createArchivumEntry({
      id: "e1",
      title: "T",
      type: "note",
      text: "hello",
      velumReviewed: true,
      velumRiskSummary: { overallRisk: "low", findingCount: 0, highestSeverity: "low" },
      now: 100,
    });
    const doc = createArchivumDocument([entry], 200);
    const restored = deserializeArchivum(JSON.stringify(doc));
    expect(restored.localOnly).toBe(true);
    expect(restored.cloudUsed).toBe(false);
    expect(restored.entries[0]).toEqual(entry);
  });

  it("falls back safely for invalid or corrupt storage", () => {
    expect(deserializeArchivum("{bad")).toMatchObject({ entries: [] });
    expect(deserializeArchivum(JSON.stringify({ version: 99 }))).toMatchObject({ entries: [] });
  });

  it("migrates entries with missing tags to an empty tag list", () => {
    const restored = deserializeArchivum(JSON.stringify({
      version: 1,
      savedAt: 1,
      localOnly: true,
      cloudUsed: false,
      entries: [{
        id: "old",
        title: "Old",
        type: "note",
        text: "legacy",
        createdAt: 1,
        updatedAt: 1,
        source: "manual-paste",
        localOnly: true,
        cloudUsed: false,
        velumReviewed: false,
      }],
    }));
    expect(restored.entries[0].tags).toEqual([]);
  });

  it("parses, trims, limits, and deduplicates tags", () => {
    expect(parseArchivumTags(" Notes, notes, Project Alpha, x".concat("y".repeat(80)))).toEqual([
      "Notes",
      "Project Alpha",
      "x".concat("y".repeat(31)),
    ]);
  });

  it("creates entries with title fallback and local metadata", () => {
    const entry = createArchivumEntry({
      id: "e1",
      type: "other",
      text: "first line of content",
      now: 100,
    });
    expect(entry.title).toBe("first line of content");
    expect(entry.source).toBe("manual-paste");
    expect(entry.localOnly).toBe(true);
    expect(entry.cloudUsed).toBe(false);
    expect(entry.velumReviewed).toBe(false);
  });

  it("creates Oculus analysis entries without image data", () => {
    const entry = createArchivumEntryFromOculusAnalysis({
      id: "oculus-1",
      title: "Oculus analysis: screenshot.png",
      text: "The screenshot shows a settings page.",
      tags: "oculus, screenshot",
      now: 100,
    });
    expect(entry).toMatchObject({
      source: "oculus-analysis",
      localOnly: true,
      cloudUsed: false,
      velumReviewed: false,
      tags: ["oculus", "screenshot"],
    });
    expect(JSON.stringify(entry)).not.toContain("data:image");
    expect(JSON.stringify(entry)).not.toContain("base64");
  });

  it("creates Fabrica suggestion entries as notes without executable treatment", () => {
    const entry = createArchivumEntryFromFabricaSuggestion({
      id: "fabrica-1",
      title: "Fabrica suggestion: card.tsx",
      text: "export function Card() { return null; }",
      tags: "fabrica, suggestion",
      now: 120,
    });
    expect(entry).toMatchObject({
      source: "fabrica-suggestion",
      type: "note",
      localOnly: true,
      cloudUsed: false,
      velumReviewed: false,
      tags: ["fabrica", "suggestion"],
    });
  });

  it("upserts and deletes entries", () => {
    const entry = createArchivumEntry({ id: "e1", type: "note", text: "x", now: 1 });
    const withEntry = upsertArchivumEntry(createArchivumDocument([], 1), entry, 2);
    expect(withEntry.entries).toHaveLength(1);
    expect(withEntry.entries[0].updatedAt).toBe(2);
    const without = deleteArchivumEntry(withEntry, "e1", 3);
    expect(without.entries).toEqual([]);
  });

  it("searches entries by title, type, and text while applying filters", () => {
    const note = createArchivumEntry({ id: "n1", title: "Launch note", type: "note", text: "alpha", tags: "planning", now: 1 });
    const code = createArchivumEntry({
      id: "c1",
      title: "Snippet",
      type: "code",
      text: "function beta() {}",
      velumReviewed: true,
      now: 2,
    });
    const entries = [note, code];

    expect(filterArchivumEntries({ entries, query: "launch" }).map((e) => e.id)).toEqual(["n1"]);
    expect(filterArchivumEntries({ entries, query: "planning" }).map((e) => e.id)).toEqual(["n1"]);
    expect(filterArchivumEntries({ entries, tag: "planning" }).map((e) => e.id)).toEqual(["n1"]);
    expect(filterArchivumEntries({ entries, query: "code" }).map((e) => e.id)).toEqual(["c1"]);
    expect(filterArchivumEntries({ entries, type: "code" }).map((e) => e.id)).toEqual(["c1"]);
    expect(filterArchivumEntries({ entries, status: "reviewed" }).map((e) => e.id)).toEqual(["c1"]);
    expect(filterArchivumEntries({ entries, status: "unreviewed" }).map((e) => e.id)).toEqual(["n1"]);
  });

  it("updates entries and resets Velum review when content changes", () => {
    const entry = createArchivumEntry({
      id: "e1",
      title: "Original",
      type: "note",
      text: "reviewed text",
      tags: "old",
      velumReviewed: true,
      velumRiskSummary: { overallRisk: "low", findingCount: 0, highestSeverity: "low" },
      now: 1,
    });
    const result = updateArchivumEntry(createArchivumDocument([entry], 1), "e1", {
      title: "Edited",
      type: "article",
      text: "changed text",
      tags: "new",
    }, 2);

    expect(result.reviewReset).toBe(true);
    expect(result.doc.entries[0]).toMatchObject({
      title: "Edited",
      type: "article",
      text: "changed text",
      velumReviewed: false,
      updatedAt: 2,
      tags: ["new"],
    });
    expect(result.doc.entries[0].velumRiskSummary).toBeUndefined();
  });

  it("does not reset Velum review for tag-only edits", () => {
    const entry = createArchivumEntry({
      id: "e1",
      title: "Original",
      type: "note",
      text: "same text",
      tags: "old",
      velumReviewed: true,
      now: 1,
    });
    const result = updateArchivumEntry(createArchivumDocument([entry], 1), "e1", {
      title: "Original",
      type: "note",
      text: "same text",
      tags: "new",
    }, 2);
    expect(result.reviewReset).toBe(false);
    expect(result.doc.entries[0].velumReviewed).toBe(true);
    expect(result.doc.entries[0].tags).toEqual(["new"]);
  });

  it("preserves or applies reviewed metadata when edited content is Velum-reviewed", () => {
    const entry = createArchivumEntry({
      id: "e1",
      title: "Original",
      type: "note",
      text: "old",
      velumReviewed: false,
      now: 1,
    });
    const risk = { overallRisk: "medium" as const, findingCount: 2, highestSeverity: "medium" as const };
    const result = updateArchivumEntry(createArchivumDocument([entry], 1), "e1", {
      title: "Reviewed edit",
      type: "note",
      text: "redacted",
      velumReviewed: true,
      velumRiskSummary: risk,
    }, 2);

    expect(result.reviewReset).toBe(false);
    expect(result.doc.entries[0].velumReviewed).toBe(true);
    expect(result.doc.entries[0].velumRiskSummary).toEqual(risk);
  });

  it("formats exports with local-only header", () => {
    const entry = createArchivumEntry({ id: "e1", title: "Export", type: "note", text: "body", now: 1 });
    const exported = formatArchivumExport(entry, "2026-04-25T00:00:00.000Z");
    expect(exported).toContain("Peh Public Archivum Export");
    expect(exported).toContain("localOnly: true");
    expect(exported).toContain("cloudUsed: false");
    expect(exported).toContain("body");
    expect(exported).toContain("source: manual-paste");
  });

  it("formats and validates Archivum bundles", () => {
    const entry = createArchivumEntryFromOculusAnalysis({ id: "e1", title: "Bundle", text: "body", tags: "backup", now: 1 });
    const raw = formatArchivumBundle(createArchivumDocument([entry], 2), "2026-04-25T00:00:00.000Z");
    const preview = parseArchivumBundle(raw);
    expect(raw).toContain("Peh Public Archivum Bundle");
    expect(preview?.entryCount).toBe(1);
    expect(preview?.sampleTitles).toEqual(["Bundle"]);
    expect(preview?.bundle.entries[0].tags).toEqual(["backup"]);
    expect(preview?.bundle.entries[0].source).toBe("oculus-analysis");
  });

  it("ignores invalid imports and handles duplicate ids safely", () => {
    expect(parseArchivumBundle("{bad")).toBeNull();
    const existing = createArchivumEntry({ id: "same", title: "Existing", type: "note", text: "old", now: 1 });
    const incoming = createArchivumEntry({ id: "same", title: "Incoming", type: "note", text: "new", now: 2 });
    const preview = parseArchivumBundle(formatArchivumBundle(createArchivumDocument([incoming], 2)));
    expect(preview).not.toBeNull();
    const result = importArchivumBundle(createArchivumDocument([existing], 1), preview!.bundle, 100);
    expect(result.importedCount).toBe(1);
    expect(result.doc.entries).toHaveLength(2);
    expect(new Set(result.doc.entries.map((entry) => entry.id)).size).toBe(2);
    expect(result.doc.entries.every((entry) => entry.localOnly && !entry.cloudUsed)).toBe(true);
  });

  it("loads and saves the expected key", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    };
    expect(loadArchivum(storage).entries).toEqual([]);
    saveArchivum(storage, createArchivumDocument([], 1));
    expect(storage.setItem.mock.calls[0][0]).toBe(ARCHIVUM_STORAGE_KEY);
  });

  it("truncates fallback titles", () => {
    expect(fallbackArchivumTitle("x".repeat(80))).toHaveLength(56);
  });
});
