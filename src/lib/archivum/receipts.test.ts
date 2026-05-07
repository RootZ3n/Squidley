import { describe, expect, it } from "vitest";
import { ARCHIVUM_RECEIPT_ACTION } from "./constants";
import {
  buildArchivumBundleExportedReceipt,
  buildArchivumEntryCreatedReceipt,
  buildArchivumEntryDeletedReceipt,
  buildArchivumVelumHandoffCreatedReceipt,
} from "./receipts";
import { createArchivumEntry } from "./storage";

describe("Archivum receipt builders", () => {
  it("builds entry receipts without storing entry text", () => {
    const entry = createArchivumEntry({
      id: "entry-1",
      title: "Secret note",
      type: "note",
      text: "password=abc123 should not appear",
      now: 1,
    });
    const receipt = buildArchivumEntryCreatedReceipt(entry);
    expect(receipt).toMatchObject({
      module: "archivum",
      action: ARCHIVUM_RECEIPT_ACTION.entryCreated,
      changedLocalStorage: true,
      relatedItemId: "entry-1",
    });
    expect(JSON.stringify(receipt)).not.toContain("abc123");
  });

  it("builds delete/export/handoff metadata safely", () => {
    expect(buildArchivumEntryDeletedReceipt("entry-1")).toMatchObject({
      action: ARCHIVUM_RECEIPT_ACTION.entryDeleted,
      relatedItemId: "entry-1",
    });
    expect(buildArchivumBundleExportedReceipt(3).metadata).toEqual({ entryCount: 3 });
    expect(buildArchivumVelumHandoffCreatedReceipt({ edit: true, entryId: "entry-1" })).toMatchObject({
      action: ARCHIVUM_RECEIPT_ACTION.velumHandoffCreated,
      relatedItemId: "entry-1",
      modelUsed: false,
    });
  });
});
