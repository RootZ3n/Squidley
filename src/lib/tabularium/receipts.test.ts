import { describe, expect, it, vi } from "vitest";
import {
  TABULARIUM_MAX_METADATA_ENTRIES,
  TABULARIUM_STORAGE_KEY,
  appendTabulariumReceipt,
  clearTabulariumReceipts,
  createTabulariumDocument,
  createTabulariumReceipt,
  deserializeTabularium,
  filterTabulariumReceipts,
  formatTabulariumExport,
  loadTabularium,
  logTabulariumReceipt,
  sanitizeReceiptText,
  saveTabularium,
  updateTabulariumReceiptStatus,
} from "./receipts";

describe("Tabularium receipts", () => {
  it("creates local-only receipts by default", () => {
    const receipt = createTabulariumReceipt({
      id: "r1",
      createdAt: 100,
      module: "velum",
      action: "review",
      title: "Reviewed text",
      summary: "Found possible issues.",
    });
    expect(receipt).toMatchObject({
      id: "r1",
      localOnly: true,
      cloudUsed: false,
      toolsUsed: false,
      modelUsed: false,
      status: "info",
    });
  });

  it("serializes and deserializes safely", () => {
    const receipt = createTabulariumReceipt({
      id: "r1",
      createdAt: 100,
      module: "archivum",
      action: "entry.created",
      status: "succeeded",
      title: "Saved entry",
      summary: "A local entry was saved.",
      changedLocalStorage: true,
    });
    const restored = deserializeTabularium(JSON.stringify(createTabulariumDocument([receipt], 200)));
    expect(restored.localOnly).toBe(true);
    expect(restored.cloudUsed).toBe(false);
    expect(restored.receipts[0]).toEqual(receipt);
  });

  it("falls back for invalid or corrupt storage", () => {
    expect(deserializeTabularium("{bad")).toMatchObject({ receipts: [] });
    expect(deserializeTabularium(JSON.stringify({ version: 99 }))).toMatchObject({ receipts: [] });
  });

  it("appends and updates receipt status", () => {
    const receipt = createTabulariumReceipt({
      id: "chat-1",
      createdAt: 1,
      module: "colloquium",
      action: "chat.sent",
      status: "running",
      title: "Local chat started",
      summary: "Waiting for local model.",
      provider: "local",
      model: "llama3.2",
    });
    const doc = appendTabulariumReceipt(createTabulariumDocument([], 1), receipt, 2);
    const updated = updateTabulariumReceiptStatus(doc, "chat-1", "succeeded", {
      completedAt: 10,
      summary: "Local model replied.",
    }, 10);
    expect(updated.receipts[0]).toMatchObject({
      status: "succeeded",
      completedAt: 10,
      modelUsed: true,
      cloudUsed: false,
    });
  });

  it("filters by search, module, status, and model use", () => {
    const chat = createTabulariumReceipt({
      id: "chat",
      module: "colloquium",
      action: "chat.completed",
      status: "succeeded",
      title: "Local model replied",
      summary: "A response streamed.",
      model: "llama3.2",
    });
    const velum = createTabulariumReceipt({
      id: "velum",
      module: "velum",
      action: "review",
      status: "info",
      title: "Velum reviewed text",
      summary: "No model used.",
    });
    const receipts = [chat, velum];
    expect(filterTabulariumReceipts({ receipts, query: "streamed" }).map((r) => r.id)).toEqual(["chat"]);
    expect(filterTabulariumReceipts({ receipts, module: "velum" }).map((r) => r.id)).toEqual(["velum"]);
    expect(filterTabulariumReceipts({ receipts, status: "succeeded" }).map((r) => r.id)).toEqual(["chat"]);
    expect(filterTabulariumReceipts({ receipts, model: "no-model" }).map((r) => r.id)).toEqual(["velum"]);
  });

  it("formats export with local-only header", () => {
    const exported = formatTabulariumExport(createTabulariumDocument([], 1), "2026-04-25T00:00:00.000Z");
    expect(exported).toContain("Squidley Public Tabularium Export");
    expect(exported).toContain("localOnly: true");
    expect(exported).toContain("cloudUsed: false");
  });

  it("loads, saves, logs, and clears with the expected storage key", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => data.set(key, value)),
    };
    expect(loadTabularium(storage).receipts).toEqual([]);
    saveTabularium(storage, createTabulariumDocument([], 1));
    expect(storage.setItem.mock.calls[0][0]).toBe(TABULARIUM_STORAGE_KEY);
    const logged = logTabulariumReceipt(storage, {
      module: "settings",
      action: "tour.restart",
      title: "Tour restarted",
      summary: "Tour preference changed.",
    });
    expect(logged?.localOnly).toBe(true);
    expect(loadTabularium(storage).receipts).toHaveLength(1);
    expect(clearTabulariumReceipts().receipts).toEqual([]);
  });

  it("sanitizes likely raw secrets from summaries", () => {
    const summary = sanitizeReceiptText("email me@example.com token=abcd1234SECRET ghp_abcdefghijklmnopqrstuvwxyz");
    expect(summary).not.toContain("me@example.com");
    expect(summary).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
    expect(summary).toContain("[email]");
    expect(summary).toContain("[secret]");
  });

  it("supports Oculus receipts without storing full analysis text", () => {
    const receipt = createTabulariumReceipt({
      module: "oculus",
      action: "save-analysis-to-archivum",
      status: "succeeded",
      title: "Oculus analysis saved to Archivum",
      summary: "Only the Oculus analysis text was saved as a local Archivum entry. The image was not stored.",
      modelUsed: true,
      relatedItemId: "entry-1",
    });
    expect(receipt.module).toBe("oculus");
    expect(receipt.localOnly).toBe(true);
    expect(receipt.cloudUsed).toBe(false);
    expect(receipt.toolsUsed).toBe(false);
    expect(receipt.summary).not.toContain("data:image");
    expect(receipt.summary).not.toContain("base64");
  });

  it("supports Fabrica receipts without storing full source or output", () => {
    const receipt = createTabulariumReceipt({
      module: "fabrica",
      action: "single-file-suggestion",
      status: "succeeded",
      title: "Fabrica suggestion completed",
      summary: "Fabrica created a local single-file suggestion. No files were written and no commands were run.",
      provider: "local",
      model: "llama3.2",
      modelUsed: true,
      metadata: { fileSystemWrites: false },
    });
    expect(receipt.module).toBe("fabrica");
    expect(receipt.localOnly).toBe(true);
    expect(receipt.cloudUsed).toBe(false);
    expect(receipt.toolsUsed).toBe(false);
    expect(receipt.summary).not.toContain("function ");
    expect(receipt.summary).not.toContain("console.log");
  });

  it("exposes a metadata cap as a named constant set to 16", () => {
    expect(TABULARIUM_MAX_METADATA_ENTRIES).toBe(16);
  });

  it("caps metadata entries at TABULARIUM_MAX_METADATA_ENTRIES and keeps the earliest entries", () => {
    const oversized: Record<string, string | number | boolean> = {};
    for (let i = 0; i < TABULARIUM_MAX_METADATA_ENTRIES + 4; i++) {
      oversized[`field${String(i).padStart(2, "0")}`] = i;
    }
    const receipt = createTabulariumReceipt({
      module: "system",
      action: "metadata-cap-check",
      title: "Metadata cap check",
      summary: "Truncation check.",
      metadata: oversized,
    });
    const keys = Object.keys(receipt.metadata!);
    expect(keys).toHaveLength(TABULARIUM_MAX_METADATA_ENTRIES);
    expect(keys[0]).toBe("field00");
    expect(keys[keys.length - 1]).toBe(`field${String(TABULARIUM_MAX_METADATA_ENTRIES - 1).padStart(2, "0")}`);
    expect(keys).not.toContain(`field${String(TABULARIUM_MAX_METADATA_ENTRIES).padStart(2, "0")}`);
  });

  it("still sanitizes string metadata values when at or below the cap", () => {
    const receipt = createTabulariumReceipt({
      module: "system",
      action: "metadata-sanitization-check",
      title: "Metadata sanitization",
      summary: "Verifies values still get redacted.",
      metadata: {
        leakedEmail: "operator@example.com leaked here",
        leakedKey: "ghp_abcdefghijklmnopqrstuvwxyz",
        normal: "fine",
      },
    });
    const meta = receipt.metadata!;
    expect(String(meta.leakedEmail)).toContain("[email]");
    expect(String(meta.leakedEmail)).not.toContain("operator@example.com");
    expect(String(meta.leakedKey)).toContain("[secret]");
    expect(String(meta.leakedKey)).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
    expect(meta.normal).toBe("fine");
  });

  it("accepts receipt modules for active public workflows", () => {
    const modules = ["colloquium", "velum", "archivum", "oculus", "fabrica", "nous", "settings", "system"] as const;
    const doc = createTabulariumDocument(modules.map((module) =>
      createTabulariumReceipt({
        module,
        action: "release-smoke",
        title: `${module} receipt`,
        summary: "Release smoke receipt.",
      }),
    ));
    expect(doc.receipts.map((receipt) => receipt.module).sort()).toEqual([...modules].sort());
  });
});
