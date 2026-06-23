import { describe, expect, it, vi } from "vitest";
import {
  NOTEBOOK_STORAGE_KEY,
  createNotebookDocument,
  createNotebookEntry,
  createNotebookEntryFromWorkshopSuggestion,
  createNotebookEntryFromVisionAnalysis,
  deleteNotebookEntry,
  deserializeNotebook,
  fallbackNotebookTitle,
  filterNotebookEntries,
  formatNotebookBundle,
  formatNotebookExport,
  importNotebookBundle,
  loadNotebook,
  parseNotebookBundle,
  parseNotebookTags,
  saveNotebook,
  updateNotebookEntry,
  upsertNotebookEntry,
} from "./storage";

describe("Notebook storage", () => {
  it("serializes and deserializes local-only entries", () => {
    const entry = createNotebookEntry({
      id: "e1",
      title: "T",
      type: "note",
      text: "hello",
      velumReviewed: true,
      velumRiskSummary: { overallRisk: "low", findingCount: 0, highestSeverity: "low" },
      now: 100,
    });
    const doc = createNotebookDocument([entry], 200);
    const restored = deserializeNotebook(JSON.stringify(doc));
    expect(restored.localOnly).toBe(true);
    expect(restored.cloudUsed).toBe(false);
    expect(restored.entries[0]).toEqual(entry);
  });

  it("falls back safely for invalid or corrupt storage", () => {
    expect(deserializeNotebook("{bad")).toMatchObject({ entries: [] });
    expect(deserializeNotebook(JSON.stringify({ version: 99 }))).toMatchObject({ entries: [] });
  });

  it("migrates entries with missing tags to an empty tag list", () => {
    const restored = deserializeNotebook(JSON.stringify({
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
    expect(parseNotebookTags(" Notes, notes, Project Alpha, x".concat("y".repeat(80)))).toEqual([
      "Notes",
      "Project Alpha",
      "x".concat("y".repeat(31)),
    ]);
  });

  it("creates entries with title fallback and local metadata", () => {
    const entry = createNotebookEntry({
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

  it("creates Vision analysis entries without image data", () => {
    const entry = createNotebookEntryFromVisionAnalysis({
      id: "vision-1",
      title: "Vision analysis: screenshot.png",
      text: "The screenshot shows a settings page.",
      tags: "vision, screenshot",
      now: 100,
    });
    expect(entry).toMatchObject({
      source: "oculus-analysis",
      localOnly: true,
      cloudUsed: false,
      velumReviewed: false,
      tags: ["vision", "screenshot"],
    });
    expect(JSON.stringify(entry)).not.toContain("data:image");
    expect(JSON.stringify(entry)).not.toContain("base64");
  });

  it("creates Workshop suggestion entries as notes without executable treatment", () => {
    const entry = createNotebookEntryFromWorkshopSuggestion({
      id: "workshop-1",
      title: "Workshop suggestion: card.tsx",
      text: "export function Card() { return null; }",
      tags: "workshop, suggestion",
      now: 120,
    });
    expect(entry).toMatchObject({
      source: "fabrica-suggestion",
      type: "note",
      localOnly: true,
      cloudUsed: false,
      velumReviewed: false,
      tags: ["workshop", "suggestion"],
    });
  });

  it("upserts and deletes entries", () => {
    const entry = createNotebookEntry({ id: "e1", type: "note", text: "x", now: 1 });
    const withEntry = upsertNotebookEntry(createNotebookDocument([], 1), entry, 2);
    expect(withEntry.entries).toHaveLength(1);
    expect(withEntry.entries[0].updatedAt).toBe(2);
    const without = deleteNotebookEntry(withEntry, "e1", 3);
    expect(without.entries).toEqual([]);
  });

  it("searches entries by title, type, and text while applying filters", () => {
    const note = createNotebookEntry({ id: "n1", title: "Launch note", type: "note", text: "alpha", tags: "planning", now: 1 });
    const code = createNotebookEntry({
      id: "c1",
      title: "Snippet",
      type: "code",
      text: "function beta() {}",
      velumReviewed: true,
      now: 2,
    });
    const entries = [note, code];

    expect(filterNotebookEntries({ entries, query: "launch" }).map((e) => e.id)).toEqual(["n1"]);
    expect(filterNotebookEntries({ entries, query: "planning" }).map((e) => e.id)).toEqual(["n1"]);
    expect(filterNotebookEntries({ entries, tag: "planning" }).map((e) => e.id)).toEqual(["n1"]);
    expect(filterNotebookEntries({ entries, query: "code" }).map((e) => e.id)).toEqual(["c1"]);
    expect(filterNotebookEntries({ entries, type: "code" }).map((e) => e.id)).toEqual(["c1"]);
    expect(filterNotebookEntries({ entries, status: "reviewed" }).map((e) => e.id)).toEqual(["c1"]);
    expect(filterNotebookEntries({ entries, status: "unreviewed" }).map((e) => e.id)).toEqual(["n1"]);
  });

  it("updates entries and resets Velum review when content changes", () => {
    const entry = createNotebookEntry({
      id: "e1",
      title: "Original",
      type: "note",
      text: "reviewed text",
      tags: "old",
      velumReviewed: true,
      velumRiskSummary: { overallRisk: "low", findingCount: 0, highestSeverity: "low" },
      now: 1,
    });
    const result = updateNotebookEntry(createNotebookDocument([entry], 1), "e1", {
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
    const entry = createNotebookEntry({
      id: "e1",
      title: "Original",
      type: "note",
      text: "same text",
      tags: "old",
      velumReviewed: true,
      now: 1,
    });
    const result = updateNotebookEntry(createNotebookDocument([entry], 1), "e1", {
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
    const entry = createNotebookEntry({
      id: "e1",
      title: "Original",
      type: "note",
      text: "old",
      velumReviewed: false,
      now: 1,
    });
    const risk = { overallRisk: "medium" as const, findingCount: 2, highestSeverity: "medium" as const };
    const result = updateNotebookEntry(createNotebookDocument([entry], 1), "e1", {
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
    const entry = createNotebookEntry({ id: "e1", title: "Export", type: "note", text: "body", now: 1 });
    const exported = formatNotebookExport(entry, "2026-04-25T00:00:00.000Z");
    expect(exported).toContain("Peh Public Notebook Export");
    expect(exported).toContain("localOnly: true");
    expect(exported).toContain("cloudUsed: false");
    expect(exported).toContain("body");
    expect(exported).toContain("source: manual-paste");
  });

  it("formats and validates Notebook bundles", () => {
    const entry = createNotebookEntryFromVisionAnalysis({ id: "e1", title: "Bundle", text: "body", tags: "backup", now: 1 });
    const raw = formatNotebookBundle(createNotebookDocument([entry], 2), "2026-04-25T00:00:00.000Z");
    const preview = parseNotebookBundle(raw);
    expect(raw).toContain("Peh Public Notebook Bundle");
    expect(preview?.entryCount).toBe(1);
    expect(preview?.sampleTitles).toEqual(["Bundle"]);
    expect(preview?.bundle.entries[0].tags).toEqual(["backup"]);
    expect(preview?.bundle.entries[0].source).toBe("oculus-analysis");
  });

  it("ignores invalid imports and handles duplicate ids safely", () => {
    expect(parseNotebookBundle("{bad")).toBeNull();
    const existing = createNotebookEntry({ id: "same", title: "Existing", type: "note", text: "old", now: 1 });
    const incoming = createNotebookEntry({ id: "same", title: "Incoming", type: "note", text: "new", now: 2 });
    const preview = parseNotebookBundle(formatNotebookBundle(createNotebookDocument([incoming], 2)));
    expect(preview).not.toBeNull();
    const result = importNotebookBundle(createNotebookDocument([existing], 1), preview!.bundle, 100);
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
    expect(loadNotebook(storage).entries).toEqual([]);
    saveNotebook(storage, createNotebookDocument([], 1));
    expect(storage.setItem.mock.calls[0][0]).toBe(NOTEBOOK_STORAGE_KEY);
  });

  it("truncates fallback titles", () => {
    expect(fallbackNotebookTitle("x".repeat(80))).toHaveLength(56);
  });
});
