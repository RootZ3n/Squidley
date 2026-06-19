import { describe, expect, it, vi } from "vitest";
import type { Receipt } from "./receipts";
import {
  CHAT_STORAGE_KEY,
  CHAT_SESSIONS_STORAGE_KEY,
  adaptConversationToSession,
  clearAllStoredSessions,
  clearCurrentSession,
  clearStoredConversation,
  createNewSession,
  createSessionsDocument,
  deleteSession,
  deserializeConversation,
  deserializeSessionsDocument,
  formatConversationExport,
  loadStoredConversation,
  loadStoredSessions,
  makeSessionTitle,
  saveStoredConversation,
  saveStoredSessions,
  serializeConversation,
  serializeSessionsDocument,
  type StoredConversationMessage,
} from "./conversationStorage";

const messages: StoredConversationMessage[] = [
  {
    id: "u1",
    role: "user",
    text: "hello",
    createdAt: 1000,
    provider: "local",
    receiptId: "r1",
  },
  {
    id: "a1",
    role: "assistant",
    text: "hi",
    createdAt: 1100,
    provider: "local",
    model: "llama3.2",
    receiptId: "r1",
    metrics: {
      source: "local",
      model: "llama3.2",
      durationMs: 20,
      characterCount: 2,
      tokenCount: 1,
      tokenSource: "approximate",
      cloudUsed: false,
      toolsUsed: false,
    },
  },
];

const receipts: Receipt[] = [
  {
    id: "r1",
    provider: "local",
    model: "llama3.2",
    status: "succeeded",
    startedAt: 1000,
    completedAt: 1120,
    cloudUsed: false,
    toolsUsed: false,
  },
];

describe("conversation serialization", () => {
  it("round-trips messages, receipts, version, and local-only metadata", () => {
    const serialized = serializeConversation({ messages, receipts, now: 2000 });
    const parsed = JSON.parse(serialized);

    expect(parsed.version).toBe(1);
    expect(parsed.localOnly).toBe(true);
    expect(parsed.cloudUsed).toBe(false);

    const restored = deserializeConversation(serialized, 3000);
    expect(restored.messages).toEqual(messages);
    expect(restored.receipts).toEqual(receipts);
  });

  it("ignores invalid JSON and unsupported versions gracefully", () => {
    expect(deserializeConversation("not json")).toEqual({ messages: [], receipts: [] });
    expect(
      deserializeConversation(
        JSON.stringify({ version: 999, localOnly: true, cloudUsed: false, messages: [] }),
      ),
    ).toEqual({ messages: [], receipts: [] });
  });

  it("removes empty assistant placeholders and marks partial assistant replies interrupted", () => {
    const serialized = serializeConversation({
      messages: [
        {
          id: "blank",
          role: "assistant",
          text: "",
          createdAt: 1,
          provider: "local",
        },
        {
          id: "partial",
          role: "assistant",
          text: "part",
          createdAt: 2,
          provider: "local",
        },
      ],
      receipts: [],
      now: 3,
    });

    const restored = deserializeConversation(serialized, 4);
    expect(restored.messages).toHaveLength(1);
    expect(restored.messages[0].id).toBe("partial");
    expect(restored.messages[0].text).toContain("Interrupted before completion");
  });

  it("marks running receipts failed on restore", () => {
    const restored = deserializeConversation(
      JSON.stringify({
        version: 1,
        savedAt: 1,
        localOnly: true,
        cloudUsed: false,
        messages: [],
        receipts: [
          {
            id: "r1",
            provider: "local",
            model: "llama3.2",
            status: "running",
            startedAt: 100,
            cloudUsed: false,
            toolsUsed: false,
          },
        ],
      }),
      200,
    );

    expect(restored.receipts[0]).toMatchObject({
      id: "r1",
      status: "failed",
      completedAt: 200,
      cloudUsed: false,
      toolsUsed: false,
    });
  });
});

describe("browser storage wrappers", () => {
  it("loads empty data when storage throws", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };
    expect(loadStoredConversation(storage)).toEqual({ messages: [], receipts: [] });
  });

  it("saves and clears the expected key", () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    saveStoredConversation(storage, { messages, receipts }, 1234);
    expect(storage.setItem.mock.calls[0][0]).toBe(CHAT_STORAGE_KEY);
    expect(storage.setItem.mock.calls[0][1]).toContain('"localOnly":true');

    clearStoredConversation(storage);
    expect(storage.removeItem).toHaveBeenCalledWith(CHAT_STORAGE_KEY);
  });
});

describe("conversation export", () => {
  it("formats a local-only text export without uploading anything", () => {
    const text = formatConversationExport({
      messages,
      receipts,
      exportedAt: "2026-04-25T12:00:00.000Z",
    });

    expect(text).toContain("Peh Public Chat Export");
    expect(text).toContain("exportedAt: 2026-04-25T12:00:00.000Z");
    expect(text).toContain("localOnly: true");
    expect(text).toContain("cloudUsed: false");
    expect(text).toContain("USER");
    expect(text).toContain("ASSISTANT model=llama3.2");
    expect(text).toContain("toolsUsed=false");
  });
});

describe("local chat sessions", () => {
  it("serializes and restores a v2 sessions document with local-only metadata", () => {
    const doc = createSessionsDocument({
      now: 5000,
      activeSessionId: "s1",
      sessions: [
        {
          id: "s1",
          title: "New chat",
          createdAt: 1000,
          updatedAt: 1100,
          localOnly: true,
          cloudUsed: false,
          messages,
          receipts,
        },
      ],
    });

    const restored = deserializeSessionsDocument(serializeSessionsDocument(doc, 6000), 7000);
    expect(restored?.version).toBe(2);
    expect(restored?.localOnly).toBe(true);
    expect(restored?.cloudUsed).toBe(false);
    expect(restored?.activeSessionId).toBe("s1");
    expect(restored?.sessions[0].title).toBe("hello");
    expect(restored?.sessions[0].messages).toEqual(messages);
  });

  it("adapts old v1 conversation storage into the first session", () => {
    const v1 = serializeConversation({ messages, receipts, now: 2000 });
    const storage = {
      getItem: (key: string) => (key === CHAT_STORAGE_KEY ? v1 : null),
    };

    const doc = loadStoredSessions(storage, 3000);
    expect(doc.sessions).toHaveLength(1);
    expect(doc.activeSessionId).toBe("session-migrated-v1");
    expect(doc.sessions[0].title).toBe("hello");
    expect(doc.sessions[0].messages).toEqual(messages);
  });

  it("creates new chats without deleting previous sessions", () => {
    const doc = createSessionsDocument({
      sessions: [
        {
          id: "s1",
          title: "First",
          createdAt: 1,
          updatedAt: 1,
          localOnly: true,
          cloudUsed: false,
          messages: [],
          receipts: [],
        },
      ],
      activeSessionId: "s1",
      now: 1,
    });

    const next = createNewSession(doc, 2, "s2");
    expect(next.sessions.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(next.activeSessionId).toBe("s2");
  });

  it("generates short safe session titles", () => {
    expect(makeSessionTitle("   hello     local world   ")).toBe("hello local world");
    expect(makeSessionTitle("x".repeat(60))).toHaveLength(48);
    expect(makeSessionTitle("   ")).toBe("New chat");
  });

  it("deletes the current session and creates a fresh one when deleting the last session", () => {
    const one = createSessionsDocument({
      sessions: [
        {
          id: "s1",
          title: "Only",
          createdAt: 1,
          updatedAt: 1,
          localOnly: true,
          cloudUsed: false,
          messages,
          receipts,
        },
      ],
      activeSessionId: "s1",
      now: 1,
    });

    const next = deleteSession(one, "s1", 2);
    expect(next.sessions).toHaveLength(1);
    expect(next.sessions[0].messages).toEqual([]);
    expect(next.sessions[0].receipts).toEqual([]);
  });

  it("clears only the current session", () => {
    const doc = createSessionsDocument({
      sessions: [
        {
          id: "s1",
          title: "One",
          createdAt: 1,
          updatedAt: 1,
          localOnly: true,
          cloudUsed: false,
          messages,
          receipts,
        },
        {
          id: "s2",
          title: "Two",
          createdAt: 2,
          updatedAt: 2,
          localOnly: true,
          cloudUsed: false,
          messages,
          receipts,
        },
      ],
      activeSessionId: "s1",
      now: 3,
    });

    const next = clearCurrentSession(doc, "s1", 4);
    expect(next.sessions.find((s) => s.id === "s1")?.messages).toEqual([]);
    expect(next.sessions.find((s) => s.id === "s2")?.messages).toEqual(messages);
  });

  it("ignores corrupt v2 storage and falls back to a fresh local session", () => {
    const storage = {
      getItem: () => "{bad",
    };
    const doc = loadStoredSessions(storage, 100);
    expect(doc.sessions).toHaveLength(1);
    expect(doc.sessions[0].title).toBe("New chat");
  });

  it("clears all v1 and v2 local chat keys", () => {
    const storage = { removeItem: vi.fn() };
    clearAllStoredSessions(storage);
    expect(storage.removeItem).toHaveBeenCalledWith(CHAT_SESSIONS_STORAGE_KEY);
    expect(storage.removeItem).toHaveBeenCalledWith(CHAT_STORAGE_KEY);
  });

  it("saves v2 sessions to the v2 key", () => {
    const storage = { setItem: vi.fn() };
    const doc = createSessionsDocument({ now: 1 });
    saveStoredSessions(storage, doc, 2);
    expect(storage.setItem.mock.calls[0][0]).toBe(CHAT_SESSIONS_STORAGE_KEY);
    expect(storage.setItem.mock.calls[0][1]).toContain('"localOnly":true');
  });

  it("can adapt a conversation directly", () => {
    const session = adaptConversationToSession({ messages, receipts }, 9, "s");
    expect(session.id).toBe("s");
    expect(session.title).toBe("hello");
    expect(session.localOnly).toBe(true);
    expect(session.cloudUsed).toBe(false);
  });
});
