import type { ArchivumDocument } from "@/lib/archivum/storage";
import type { StoredChatSessionsDocument } from "@/lib/chat/conversationStorage";
import type { TabulariumDocument } from "@/lib/tabularium/receipts";

export interface ChatStorageSummary {
  sessionCount: number;
  messageCount: number;
  receiptCount: number;
  localOnly: true;
  cloudUsed: false;
}

export interface ArchivumStorageSummary {
  entryCount: number;
  tagCount: number;
  characterCount: number;
  localOnly: true;
  cloudUsed: false;
}

export interface TabulariumStorageSummary {
  receiptCount: number;
  oldestReceiptAt?: number;
  newestReceiptAt?: number;
  localOnly: true;
  cloudUsed: false;
}

export function summarizeChatStorage(doc: StoredChatSessionsDocument | null): ChatStorageSummary {
  const sessions = doc?.sessions ?? [];
  return {
    sessionCount: sessions.length,
    messageCount: sessions.reduce((sum, session) => sum + session.messages.length, 0),
    receiptCount: sessions.reduce((sum, session) => sum + session.receipts.length, 0),
    localOnly: true,
    cloudUsed: false,
  };
}

export function summarizeArchivumStorage(doc: ArchivumDocument | null): ArchivumStorageSummary {
  const entries = doc?.entries ?? [];
  const tags = new Set(entries.flatMap((entry) => entry.tags.map((tag) => tag.toLowerCase())));
  return {
    entryCount: entries.length,
    tagCount: tags.size,
    characterCount: entries.reduce((sum, entry) => sum + entry.text.length, 0),
    localOnly: true,
    cloudUsed: false,
  };
}

export function summarizeTabulariumStorage(doc: TabulariumDocument | null): TabulariumStorageSummary {
  const receipts = doc?.receipts ?? [];
  const times = receipts.map((receipt) => receipt.createdAt).filter((time) => Number.isFinite(time));
  return {
    receiptCount: receipts.length,
    ...(times.length > 0 ? { oldestReceiptAt: Math.min(...times), newestReceiptAt: Math.max(...times) } : {}),
    localOnly: true,
    cloudUsed: false,
  };
}

export function formatChatSessionsExport(
  doc: StoredChatSessionsDocument,
  exportedAt = new Date().toISOString(),
): string {
  return [
    "Peh Public Local Chat Export",
    `exportedAt: ${exportedAt}`,
    "localOnly: true",
    "cloudUsed: false",
    "",
    JSON.stringify(doc, null, 2),
    "",
  ].join("\n");
}
