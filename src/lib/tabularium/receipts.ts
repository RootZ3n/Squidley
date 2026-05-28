export { TABULARIUM_STORAGE_KEY } from "@/lib/tabularium/constants";
import {
  TABULARIUM_EXPORT_HEADER,
  TABULARIUM_STORAGE_KEY,
} from "@/lib/tabularium/constants";
export const TABULARIUM_STORAGE_VERSION = 1;
export const TABULARIUM_MAX_RECEIPTS = 200;
export const TABULARIUM_SUMMARY_MAX_CHARS = 220;
export const TABULARIUM_MAX_METADATA_ENTRIES = 16;

export type TabulariumModule = "colloquium" | "velum" | "archivum" | "oculus" | "fabrica" | "nous" | "settings" | "system";
export type TabulariumStatus = "running" | "succeeded" | "failed" | "interrupted" | "info";
export type TabulariumModuleFilter = "all" | TabulariumModule;
export type TabulariumStatusFilter = "all" | TabulariumStatus;
export type TabulariumModelFilter = "all" | "model-used" | "no-model";

export interface TabulariumReceipt {
  id: string;
  createdAt: number;
  completedAt?: number;
  module: TabulariumModule;
  action: string;
  status: TabulariumStatus;
  title: string;
  summary: string;
  provider?: "local";
  model?: string;
  localOnly: true;
  cloudUsed: false;
  modelUsed: boolean;
  toolsUsed: false;
  changedLocalStorage?: boolean;
  relatedItemId?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface TabulariumDocument {
  version: typeof TABULARIUM_STORAGE_VERSION;
  savedAt: number;
  localOnly: true;
  cloudUsed: false;
  receipts: TabulariumReceipt[];
}

export type TabulariumReceiptInput = Parameters<typeof createTabulariumReceipt>[0];

export function sanitizeReceiptText(value: string, maxChars = TABULARIUM_SUMMARY_MAX_CHARS): string {
  const compact = value.replace(/\s+/g, " ").trim();
  const redacted = compact
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:sk|pk|ghp|gho|github_pat|xoxb|xoxp)[A-Za-z0-9_-]{8,}\b/g, "[secret]")
    .replace(/\b(?:password|passwd|pwd|api[_-]?key|token|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return redacted.length <= maxChars ? redacted : `${redacted.slice(0, maxChars - 1)}…`;
}

export function createTabulariumReceipt(args: {
  id?: string;
  createdAt?: number;
  completedAt?: number;
  module: TabulariumModule;
  action: string;
  status?: TabulariumStatus;
  title: string;
  summary: string;
  provider?: "local";
  model?: string;
  modelUsed?: boolean;
  changedLocalStorage?: boolean;
  relatedItemId?: string;
  metadata?: Record<string, string | number | boolean>;
}): TabulariumReceipt {
  const createdAt = args.createdAt ?? Date.now();
  const modelUsed = args.modelUsed ?? Boolean(args.model);
  return {
    id: args.id ?? `tab-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    ...(typeof args.completedAt === "number" ? { completedAt: args.completedAt } : {}),
    module: args.module,
    action: sanitizeKey(args.action),
    status: args.status ?? "info",
    title: sanitizeReceiptText(args.title, 96) || "Peh receipt",
    summary: sanitizeReceiptText(args.summary),
    ...(args.provider ? { provider: args.provider } : {}),
    ...(args.model ? { model: sanitizeReceiptText(args.model, 96) } : {}),
    localOnly: true,
    cloudUsed: false,
    modelUsed,
    toolsUsed: false,
    ...(typeof args.changedLocalStorage === "boolean"
      ? { changedLocalStorage: args.changedLocalStorage }
      : {}),
    ...(args.relatedItemId ? { relatedItemId: sanitizeReceiptText(args.relatedItemId, 120) } : {}),
    ...(args.metadata ? { metadata: sanitizeMetadata(args.metadata) } : {}),
  };
}

export function createTabulariumDocument(
  receipts: readonly TabulariumReceipt[] = [],
  now = Date.now(),
): TabulariumDocument {
  return {
    version: TABULARIUM_STORAGE_VERSION,
    savedAt: now,
    localOnly: true,
    cloudUsed: false,
    receipts: receipts.map(normalizeReceipt).filter(isReceipt).slice(0, TABULARIUM_MAX_RECEIPTS),
  };
}

export function deserializeTabularium(raw: string | null): TabulariumDocument {
  if (typeof raw !== "string" || raw.trim().length === 0) return createTabulariumDocument();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createTabulariumDocument();
  }
  const doc = parsed as Partial<TabulariumDocument> | null;
  if (
    !doc ||
    doc.version !== TABULARIUM_STORAGE_VERSION ||
    doc.localOnly !== true ||
    doc.cloudUsed !== false ||
    !Array.isArray(doc.receipts)
  ) {
    return createTabulariumDocument();
  }
  return createTabulariumDocument(doc.receipts, typeof doc.savedAt === "number" ? doc.savedAt : Date.now());
}

export function serializeTabularium(doc: TabulariumDocument, now = Date.now()): string {
  return JSON.stringify(createTabulariumDocument(doc.receipts, now));
}

export function loadTabularium(storage: Pick<Storage, "getItem">): TabulariumDocument {
  try {
    return deserializeTabularium(storage.getItem(TABULARIUM_STORAGE_KEY));
  } catch {
    return createTabulariumDocument();
  }
}

export function saveTabularium(storage: Pick<Storage, "setItem">, doc: TabulariumDocument): void {
  try {
    storage.setItem(TABULARIUM_STORAGE_KEY, serializeTabularium(doc));
  } catch {
    // Local storage may be unavailable or full; receipts should never break a workflow.
  }
}

export function appendTabulariumReceipt(
  doc: TabulariumDocument,
  receipt: TabulariumReceipt,
  now = Date.now(),
): TabulariumDocument {
  return createTabulariumDocument([receipt, ...doc.receipts.filter((r) => r.id !== receipt.id)], now);
}

export function updateTabulariumReceiptStatus(
  doc: TabulariumDocument,
  id: string,
  status: TabulariumStatus,
  args: { completedAt?: number; summary?: string; model?: string } = {},
  now = Date.now(),
): TabulariumDocument {
  const next = doc.receipts.map((receipt) => {
    if (receipt.id !== id) return receipt;
    return createTabulariumReceipt({
      ...receipt,
      status,
      completedAt: args.completedAt ?? receipt.completedAt ?? now,
      summary: args.summary ?? receipt.summary,
      model: args.model ?? receipt.model,
      modelUsed: receipt.modelUsed || Boolean(args.model),
    });
  });
  return createTabulariumDocument(next, now);
}

export function logTabulariumReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: Parameters<typeof createTabulariumReceipt>[0],
): TabulariumReceipt | null {
  const receipt = createTabulariumReceipt(args);
  try {
    const doc = loadTabularium(storage);
    saveTabularium(storage, appendTabulariumReceipt(doc, receipt));
    return receipt;
  } catch {
    return null;
  }
}

export function clearTabulariumReceipts(now = Date.now()): TabulariumDocument {
  return createTabulariumDocument([], now);
}

export function filterTabulariumReceipts(args: {
  receipts: readonly TabulariumReceipt[];
  query?: string;
  module?: TabulariumModuleFilter;
  status?: TabulariumStatusFilter;
  model?: TabulariumModelFilter;
}): TabulariumReceipt[] {
  const query = (args.query ?? "").trim().toLowerCase();
  const moduleFilter = args.module ?? "all";
  const status = args.status ?? "all";
  const model = args.model ?? "all";
  return args.receipts.filter((receipt) => {
    if (moduleFilter !== "all" && receipt.module !== moduleFilter) return false;
    if (status !== "all" && receipt.status !== status) return false;
    if (model === "model-used" && !receipt.modelUsed) return false;
    if (model === "no-model" && receipt.modelUsed) return false;
    if (query.length === 0) return true;
    const haystack = `${receipt.title} ${receipt.summary} ${receipt.module} ${receipt.action}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function formatTabulariumExport(
  doc: TabulariumDocument,
  exportedAt = new Date().toISOString(),
): string {
  return [
    TABULARIUM_EXPORT_HEADER,
    `exportedAt: ${exportedAt}`,
    "localOnly: true",
    "cloudUsed: false",
    "",
    JSON.stringify(createTabulariumDocument(doc.receipts), null, 2),
    "",
  ].join("\n");
}

function normalizeReceipt(raw: unknown): TabulariumReceipt | null {
  const receipt = raw as Partial<TabulariumReceipt> | null;
  if (
    !receipt ||
    typeof receipt.id !== "string" ||
    typeof receipt.createdAt !== "number" ||
    !isModule(receipt.module) ||
    typeof receipt.action !== "string" ||
    !isStatus(receipt.status) ||
    typeof receipt.title !== "string" ||
    typeof receipt.summary !== "string" ||
    receipt.localOnly !== true ||
    receipt.cloudUsed !== false ||
    typeof receipt.modelUsed !== "boolean" ||
    receipt.toolsUsed !== false
  ) {
    return null;
  }
  return createTabulariumReceipt({
    id: receipt.id,
    createdAt: receipt.createdAt,
    completedAt: typeof receipt.completedAt === "number" ? receipt.completedAt : undefined,
    module: receipt.module,
    action: receipt.action,
    status: receipt.status,
    title: receipt.title,
    summary: receipt.summary,
    provider: receipt.provider === "local" ? "local" : undefined,
    model: typeof receipt.model === "string" ? receipt.model : undefined,
    modelUsed: receipt.modelUsed,
    changedLocalStorage:
      typeof receipt.changedLocalStorage === "boolean" ? receipt.changedLocalStorage : undefined,
    relatedItemId: typeof receipt.relatedItemId === "string" ? receipt.relatedItemId : undefined,
    metadata: isMetadata(receipt.metadata) ? receipt.metadata : undefined,
  });
}

function sanitizeKey(value: string): string {
  return value.replace(/[^a-z0-9._:-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "info";
}

function sanitizeMetadata(value: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(value).slice(0, TABULARIUM_MAX_METADATA_ENTRIES).map(([key, item]) => [
      sanitizeKey(key),
      typeof item === "string" ? sanitizeReceiptText(item, 80) : item,
    ]),
  );
}

function isMetadata(value: unknown): value is Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(
    (item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean",
  );
}

function isModule(value: unknown): value is TabulariumModule {
  return value === "colloquium" || value === "velum" || value === "archivum" || value === "oculus" || value === "fabrica" || value === "nous" || value === "settings" || value === "system";
}

function isStatus(value: unknown): value is TabulariumStatus {
  return value === "running" || value === "succeeded" || value === "failed" || value === "interrupted" || value === "info";
}

function isReceipt(receipt: TabulariumReceipt | null): receipt is TabulariumReceipt {
  return receipt !== null;
}
