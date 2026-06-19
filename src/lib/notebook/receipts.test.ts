import { describe, expect, it } from "vitest";
import { NOTEBOOK_RECEIPT_ACTION } from "./constants";
import {
  buildNotebookBundleExportedReceipt,
  buildNotebookEntryCreatedReceipt,
  buildNotebookEntryDeletedReceipt,
  buildNotebookVelumHandoffCreatedReceipt,
} from "./receipts";
import { createNotebookEntry } from "./storage";

describe("Notebook receipt builders", () => {
  it("builds entry receipts without storing entry text", () => {
    const entry = createNotebookEntry({
      id: "entry-1",
      title: "Secret note",
      type: "note",
      text: "password=abc123 should not appear",
      now: 1,
    });
    const receipt = buildNotebookEntryCreatedReceipt(entry);
    expect(receipt).toMatchObject({
      module: "notebook",
      action: NOTEBOOK_RECEIPT_ACTION.entryCreated,
      changedLocalStorage: true,
      relatedItemId: "entry-1",
    });
    expect(JSON.stringify(receipt)).not.toContain("abc123");
  });

  it("builds delete/export/handoff metadata safely", () => {
    expect(buildNotebookEntryDeletedReceipt("entry-1")).toMatchObject({
      action: NOTEBOOK_RECEIPT_ACTION.entryDeleted,
      relatedItemId: "entry-1",
    });
    expect(buildNotebookBundleExportedReceipt(3).metadata).toEqual({ entryCount: 3 });
    expect(buildNotebookVelumHandoffCreatedReceipt({ edit: true, entryId: "entry-1" })).toMatchObject({
      action: NOTEBOOK_RECEIPT_ACTION.velumHandoffCreated,
      relatedItemId: "entry-1",
      modelUsed: false,
    });
  });
});
