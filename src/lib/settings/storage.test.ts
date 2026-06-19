import { describe, expect, it } from "vitest";
import { createNotebookDocument, createNotebookEntry } from "@/lib/notebook/storage";
import { createEmptySession, createSessionsDocument } from "@/lib/chat/conversationStorage";
import { createRunningReceipt } from "@/lib/chat/receipts";
import { createActivityDocument, createActivityReceipt } from "@/lib/activity-log/receipts";
import {
  formatChatSessionsExport,
  summarizeNotebookStorage,
  summarizeChatStorage,
  summarizeActivityLogStorage,
} from "./storage";

describe("settings storage helpers", () => {
  it("summarizes chat sessions and messages", () => {
    const session = createEmptySession(1, "s1");
    session.messages = [
      { id: "m1", role: "user", text: "hi", createdAt: 1, provider: "local" },
      { id: "m2", role: "assistant", text: "hello", createdAt: 2, provider: "local" },
    ];
    session.receipts = [createRunningReceipt({ id: "r1", model: "llama3.2", startedAt: 1 })];
    const summary = summarizeChatStorage(createSessionsDocument({ sessions: [session], activeSessionId: "s1", now: 2 }));
    expect(summary).toEqual({
      sessionCount: 1,
      messageCount: 2,
      receiptCount: 1,
      localOnly: true,
      cloudUsed: false,
    });
  });

  it("summarizes Notebook entries, tags, and characters", () => {
    const doc = createNotebookDocument([
      createNotebookEntry({ id: "a", title: "A", type: "note", text: "abcd", tags: "one, two", now: 1 }),
      createNotebookEntry({ id: "b", title: "B", type: "note", text: "ef", tags: "two", now: 2 }),
    ]);
    expect(summarizeNotebookStorage(doc)).toMatchObject({
      entryCount: 2,
      tagCount: 2,
      characterCount: 6,
      localOnly: true,
      cloudUsed: false,
    });
  });

  it("summarizes ActivityLog receipt dates", () => {
    const doc = createActivityDocument([
      createActivityReceipt({ id: "r1", createdAt: 10, module: "system", action: "a", title: "A", summary: "A" }),
      createActivityReceipt({ id: "r2", createdAt: 20, module: "system", action: "b", title: "B", summary: "B" }),
    ]);
    expect(summarizeActivityLogStorage(doc)).toMatchObject({
      receiptCount: 2,
      oldestReceiptAt: 10,
      newestReceiptAt: 20,
      localOnly: true,
      cloudUsed: false,
    });
  });

  it("formats local chat export with local-only metadata", () => {
    const exported = formatChatSessionsExport(createSessionsDocument({ now: 1 }), "2026-04-25T00:00:00.000Z");
    expect(exported).toContain("Peh Public Local Chat Export");
    expect(exported).toContain("localOnly: true");
    expect(exported).toContain("cloudUsed: false");
  });
});
