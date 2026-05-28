import type { MessageMetrics } from "./metrics";
import type { Receipt } from "./receipts";
export {
  COLLOQUIUM_SESSIONS_STORAGE_KEY,
  COLLOQUIUM_STORAGE_KEY,
} from "@/lib/colloquium/constants";
import {
  COLLOQUIUM_SESSIONS_STORAGE_KEY,
  COLLOQUIUM_STORAGE_KEY,
} from "@/lib/colloquium/constants";

export const COLLOQUIUM_STORAGE_VERSION = 1;
export const COLLOQUIUM_SESSIONS_STORAGE_VERSION = 2;

export type StoredMessageRole = "user" | "assistant" | "error";

export interface StoredConversationMessage {
  id: string;
  role: StoredMessageRole;
  text: string;
  createdAt: number;
  provider: "local";
  model?: string;
  receiptId?: string;
  metrics?: MessageMetrics;
}

export interface StoredConversation {
  version: typeof COLLOQUIUM_STORAGE_VERSION;
  savedAt: number;
  localOnly: true;
  cloudUsed: false;
  messages: StoredConversationMessage[];
  receipts: Receipt[];
}

export interface RestoredConversation {
  messages: StoredConversationMessage[];
  receipts: Receipt[];
}

export interface StoredChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  localOnly: true;
  cloudUsed: false;
  messages: StoredConversationMessage[];
  receipts: Receipt[];
}

export interface StoredChatSessionsDocument {
  version: typeof COLLOQUIUM_SESSIONS_STORAGE_VERSION;
  savedAt: number;
  localOnly: true;
  cloudUsed: false;
  activeSessionId: string;
  sessions: StoredChatSession[];
}

export function serializeConversation(args: {
  messages: readonly StoredConversationMessage[];
  receipts: readonly Receipt[];
  now?: number;
}): string {
  const payload: StoredConversation = {
    version: COLLOQUIUM_STORAGE_VERSION,
    savedAt: args.now ?? Date.now(),
    localOnly: true,
    cloudUsed: false,
    messages: args.messages.map(normalizeMessageForSave).filter(isStoredMessage),
    receipts: args.receipts.map(normalizeReceiptForSave).filter(isReceipt).slice(-30),
  };
  return JSON.stringify(payload);
}

export function deserializeConversation(raw: string | null, now = Date.now()): RestoredConversation {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return emptyConversation();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyConversation();
  }

  const data = parsed as Partial<StoredConversation> | null;
  if (
    !data ||
    data.version !== COLLOQUIUM_STORAGE_VERSION ||
    data.localOnly !== true ||
    data.cloudUsed !== false ||
    !Array.isArray(data.messages)
  ) {
    return emptyConversation();
  }

  const messages = data.messages
    .map(normalizeMessageForRestore)
    .filter(isStoredMessage);

  const restoredMessages = messages.flatMap((message): StoredConversationMessage[] => {
    if (message.role !== "assistant" || message.metrics) return [message];
    if (message.text.trim().length === 0) return [];
    return [
      {
        ...message,
        text: `${message.text}\n\n[Interrupted before completion.]`,
      },
    ];
  });

  const receipts = Array.isArray(data.receipts)
    ? data.receipts.map((r) => normalizeReceiptForRestore(r, now)).filter(isReceipt)
    : [];

  return {
    messages: restoredMessages,
    receipts: receipts.slice(-30),
  };
}

export function clearStoredConversation(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(COLLOQUIUM_STORAGE_KEY);
  } catch {
    // Local browser storage can be unavailable; clearing should not crash UI.
  }
}

export function makeSessionTitle(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length === 0) return "New chat";
  return compact.length <= 48 ? compact : `${compact.slice(0, 47)}…`;
}

export function createEmptySession(now = Date.now(), id = createSessionId(now)): StoredChatSession {
  return {
    id,
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    localOnly: true,
    cloudUsed: false,
    messages: [],
    receipts: [],
  };
}

export function createSessionsDocument(args: {
  sessions?: readonly StoredChatSession[];
  activeSessionId?: string;
  now?: number;
} = {}): StoredChatSessionsDocument {
  const now = args.now ?? Date.now();
  const sessions = args.sessions && args.sessions.length > 0
    ? args.sessions.map((s) => normalizeSessionForSave(s, now)).filter(isSession)
    : [createEmptySession(now)];
  const activeSessionId =
    args.activeSessionId && sessions.some((s) => s.id === args.activeSessionId)
      ? args.activeSessionId
      : sessions[0].id;

  return {
    version: COLLOQUIUM_SESSIONS_STORAGE_VERSION,
    savedAt: now,
    localOnly: true,
    cloudUsed: false,
    activeSessionId,
    sessions,
  };
}

export function serializeSessionsDocument(doc: StoredChatSessionsDocument, now = Date.now()): string {
  return JSON.stringify(createSessionsDocument({
    sessions: doc.sessions,
    activeSessionId: doc.activeSessionId,
    now,
  }));
}

export function deserializeSessionsDocument(raw: string | null, now = Date.now()): StoredChatSessionsDocument | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const data = parsed as Partial<StoredChatSessionsDocument> | null;
  if (
    !data ||
    data.version !== COLLOQUIUM_SESSIONS_STORAGE_VERSION ||
    data.localOnly !== true ||
    data.cloudUsed !== false ||
    !Array.isArray(data.sessions)
  ) {
    return null;
  }

  const sessions = data.sessions
    .map((s) => normalizeSessionForRestore(s, now))
    .filter(isSession);
  if (sessions.length === 0) return null;

  return createSessionsDocument({
    sessions,
    activeSessionId: typeof data.activeSessionId === "string" ? data.activeSessionId : undefined,
    now: typeof data.savedAt === "number" ? data.savedAt : now,
  });
}

export function adaptConversationToSession(
  conversation: RestoredConversation,
  now = Date.now(),
  id = createSessionId(now),
): StoredChatSession {
  const firstUser = conversation.messages.find((m) => m.role === "user");
  return {
    id,
    title: firstUser ? makeSessionTitle(firstUser.text) : "New chat",
    createdAt: conversation.messages[0]?.createdAt ?? now,
    updatedAt:
      conversation.messages[conversation.messages.length - 1]?.createdAt ??
      conversation.receipts[conversation.receipts.length - 1]?.completedAt ??
      now,
    localOnly: true,
    cloudUsed: false,
    messages: conversation.messages,
    receipts: conversation.receipts,
  };
}

export function loadStoredSessions(
  storage: Pick<Storage, "getItem">,
  now = Date.now(),
): StoredChatSessionsDocument {
  try {
    const v2 = deserializeSessionsDocument(storage.getItem(COLLOQUIUM_SESSIONS_STORAGE_KEY), now);
    if (v2) return v2;

    const v1 = deserializeConversation(storage.getItem(COLLOQUIUM_STORAGE_KEY), now);
    if (v1.messages.length > 0 || v1.receipts.length > 0) {
      const migrated = adaptConversationToSession(v1, now, "session-migrated-v1");
      return createSessionsDocument({
        sessions: [migrated],
        activeSessionId: migrated.id,
        now,
      });
    }
  } catch {
    // Fall through to a fresh local session.
  }
  return createSessionsDocument({ now });
}

export function saveStoredSessions(
  storage: Pick<Storage, "setItem">,
  doc: StoredChatSessionsDocument,
  now = Date.now(),
): void {
  try {
    storage.setItem(COLLOQUIUM_SESSIONS_STORAGE_KEY, serializeSessionsDocument(doc, now));
  } catch {
    // Quota/private-mode failures should not break chat.
  }
}

export function clearAllStoredSessions(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(COLLOQUIUM_SESSIONS_STORAGE_KEY);
    storage.removeItem(COLLOQUIUM_STORAGE_KEY);
  } catch {
    // Local browser storage can be unavailable; clearing should not crash UI.
  }
}

export function upsertSession(
  doc: StoredChatSessionsDocument,
  session: StoredChatSession,
  now = Date.now(),
): StoredChatSessionsDocument {
  const normalized = normalizeSessionForSave(session, now) ?? createEmptySession(now, session.id);
  const index = doc.sessions.findIndex((s) => s.id === normalized.id);
  const sessions =
    index === -1
      ? [...doc.sessions, normalized]
      : doc.sessions.map((s, i) => (i === index ? normalized : s));
  return createSessionsDocument({
    sessions,
    activeSessionId: normalized.id,
    now,
  });
}

export function createNewSession(
  doc: StoredChatSessionsDocument,
  now = Date.now(),
  id = createSessionId(now),
): StoredChatSessionsDocument {
  const session = createEmptySession(now, id);
  return createSessionsDocument({
    sessions: [session, ...doc.sessions],
    activeSessionId: session.id,
    now,
  });
}

export function deleteSession(
  doc: StoredChatSessionsDocument,
  sessionId: string,
  now = Date.now(),
): StoredChatSessionsDocument {
  const remaining = doc.sessions.filter((s) => s.id !== sessionId);
  if (remaining.length === 0) {
    return createSessionsDocument({ sessions: [createEmptySession(now)], now });
  }
  return createSessionsDocument({
    sessions: remaining,
    activeSessionId:
      doc.activeSessionId === sessionId ? remaining[0].id : doc.activeSessionId,
    now,
  });
}

export function clearCurrentSession(
  doc: StoredChatSessionsDocument,
  sessionId: string,
  now = Date.now(),
): StoredChatSessionsDocument {
  const session = doc.sessions.find((s) => s.id === sessionId) ?? createEmptySession(now, sessionId);
  return upsertSession(
    doc,
    {
      ...session,
      title: "New chat",
      updatedAt: now,
      messages: [],
      receipts: [],
    },
    now,
  );
}

export function titleSessionFromFirstUserMessage(session: StoredChatSession): StoredChatSession {
  if (session.title !== "New chat") return session;
  const firstUser = session.messages.find((m) => m.role === "user");
  if (!firstUser) return session;
  return { ...session, title: makeSessionTitle(firstUser.text) };
}

export function loadStoredConversation(
  storage: Pick<Storage, "getItem">,
  now = Date.now(),
): RestoredConversation {
  try {
    return deserializeConversation(storage.getItem(COLLOQUIUM_STORAGE_KEY), now);
  } catch {
    return emptyConversation();
  }
}

export function saveStoredConversation(
  storage: Pick<Storage, "setItem">,
  conversation: {
    messages: readonly StoredConversationMessage[];
    receipts: readonly Receipt[];
  },
  now = Date.now(),
): void {
  try {
    storage.setItem(
      COLLOQUIUM_STORAGE_KEY,
      serializeConversation({
        messages: conversation.messages,
        receipts: conversation.receipts,
        now,
      }),
    );
  } catch {
    // Quota/private-mode failures should not break chat.
  }
}

export function formatConversationExport(args: {
  messages: readonly StoredConversationMessage[];
  receipts: readonly Receipt[];
  exportedAt?: string;
}): string {
  const exportedAt = args.exportedAt ?? new Date().toISOString();
  const lines = [
    "Peh Public Colloquium Export",
    `exportedAt: ${exportedAt}`,
    "localOnly: true",
    "cloudUsed: false",
    "",
  ];

  for (const message of args.messages) {
    const time = new Date(message.createdAt).toISOString();
    const model = message.model ? ` model=${message.model}` : "";
    lines.push(`[${time}] ${message.role.toUpperCase()}${model}`);
    lines.push(message.text);
    lines.push("");
  }

  if (args.receipts.length > 0) {
    lines.push("Receipts");
    for (const receipt of args.receipts) {
      const duration =
        typeof receipt.completedAt === "number"
          ? Math.max(0, receipt.completedAt - receipt.startedAt)
          : "";
      lines.push(
        `${receipt.id} status=${receipt.status} provider=local model=${receipt.model} cloudUsed=false toolsUsed=false durationMs=${duration}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function emptyConversation(): RestoredConversation {
  return { messages: [], receipts: [] };
}

function createSessionId(now: number): string {
  return `session-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSessionForSave(session: StoredChatSession, now: number): StoredChatSession | null {
  const normalized = normalizeSessionForRestore(session, now);
  if (!normalized) return null;
  return titleSessionFromFirstUserMessage(normalized);
}

function normalizeSessionForRestore(raw: unknown, now: number): StoredChatSession | null {
  const session = raw as Partial<StoredChatSession> | null;
  if (
    !session ||
    typeof session.id !== "string" ||
    typeof session.title !== "string" ||
    typeof session.createdAt !== "number" ||
    typeof session.updatedAt !== "number" ||
    session.localOnly !== true ||
    session.cloudUsed !== false ||
    !Array.isArray(session.messages)
  ) {
    return null;
  }

  const conversation = deserializeConversation(
    JSON.stringify({
      version: COLLOQUIUM_STORAGE_VERSION,
      savedAt: now,
      localOnly: true,
      cloudUsed: false,
      messages: session.messages,
      receipts: Array.isArray(session.receipts) ? session.receipts : [],
    }),
    now,
  );

  return {
    id: session.id,
    title: session.title.trim().length > 0 ? session.title.trim() : "New chat",
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    localOnly: true,
    cloudUsed: false,
    messages: conversation.messages,
    receipts: conversation.receipts,
  };
}

function isSession(session: StoredChatSession | null): session is StoredChatSession {
  return session !== null;
}

function normalizeMessageForSave(message: StoredConversationMessage): StoredConversationMessage | null {
  if (message.role === "assistant" && message.text.trim().length === 0) return null;
  return normalizeMessageForRestore(message);
}

function normalizeMessageForRestore(raw: unknown): StoredConversationMessage | null {
  const message = raw as Partial<StoredConversationMessage> | null;
  if (!message || typeof message.id !== "string" || typeof message.text !== "string") {
    return null;
  }
  if (message.role !== "user" && message.role !== "assistant" && message.role !== "error") {
    return null;
  }
  if (typeof message.createdAt !== "number" || !Number.isFinite(message.createdAt)) {
    return null;
  }

  return {
    id: message.id,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt,
    provider: "local",
    ...(typeof message.model === "string" && message.model.length > 0
      ? { model: message.model }
      : {}),
    ...(typeof message.receiptId === "string" && message.receiptId.length > 0
      ? { receiptId: message.receiptId }
      : {}),
    ...(isMetrics(message.metrics) ? { metrics: message.metrics } : {}),
  };
}

function normalizeReceiptForSave(receipt: Receipt): Receipt | null {
  return normalizeReceiptForRestore(receipt, Date.now());
}

function normalizeReceiptForRestore(raw: unknown, now: number): Receipt | null {
  const receipt = raw as Partial<Receipt> | null;
  if (
    !receipt ||
    typeof receipt.id !== "string" ||
    receipt.provider !== "local" ||
    typeof receipt.model !== "string" ||
    typeof receipt.startedAt !== "number" ||
    receipt.cloudUsed !== false ||
    receipt.toolsUsed !== false
  ) {
    return null;
  }
  if (
    receipt.status !== "running" &&
    receipt.status !== "succeeded" &&
    receipt.status !== "failed"
  ) {
    return null;
  }

  if (receipt.status === "running") {
    return {
      id: receipt.id,
      provider: "local",
      model: receipt.model,
      startedAt: receipt.startedAt,
      completedAt: now,
      status: "failed",
      cloudUsed: false,
      toolsUsed: false,
      errorMessage: "Interrupted before completion.",
    };
  }

  return {
    id: receipt.id,
    provider: "local",
    model: receipt.model,
    startedAt: receipt.startedAt,
    status: receipt.status,
    cloudUsed: false,
    toolsUsed: false,
    ...(typeof receipt.completedAt === "number" ? { completedAt: receipt.completedAt } : {}),
    ...(typeof receipt.errorMessage === "string" ? { errorMessage: receipt.errorMessage } : {}),
  };
}

function isStoredMessage(message: StoredConversationMessage | null): message is StoredConversationMessage {
  return message !== null;
}

function isReceipt(receipt: Receipt | null): receipt is Receipt {
  return receipt !== null;
}

function isMetrics(metrics: unknown): metrics is MessageMetrics {
  const m = metrics as Partial<MessageMetrics> | null;
  return (
    !!m &&
    m.source === "local" &&
    typeof m.model === "string" &&
    typeof m.durationMs === "number" &&
    typeof m.characterCount === "number" &&
    typeof m.tokenCount === "number" &&
    (m.tokenSource === "model-reported" || m.tokenSource === "approximate") &&
    m.cloudUsed === false &&
    m.toolsUsed === false
  );
}
