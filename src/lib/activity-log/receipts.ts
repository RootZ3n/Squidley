export { ACTIVITY_LOG_STORAGE_KEY } from "@/lib/activity-log/constants";
import {
  ACTIVITY_LOG_EXPORT_HEADER,
  ACTIVITY_LOG_STORAGE_KEY,
} from "@/lib/activity-log/constants";
export const ACTIVITY_LOG_STORAGE_VERSION = 1;
export const ACTIVITY_LOG_MAX_RECEIPTS = 200;
export const ACTIVITY_LOG_SUMMARY_MAX_CHARS = 220;
export const ACTIVITY_LOG_MAX_METADATA_ENTRIES = 16;

export type ActivityModule = "colloquium" | "velum" | "archivum" | "oculus" | "fabrica" | "nous" | "settings" | "system";
export type ActivityStatus = "running" | "succeeded" | "failed" | "interrupted" | "info";
export type ActivityModuleFilter = "all" | ActivityModule;
export type ActivityStatusFilter = "all" | ActivityStatus;
export type ActivityModelFilter = "all" | "model-used" | "no-model";

export interface ActivityReceipt {
  id: string;
  createdAt: number;
  completedAt?: number;
  module: ActivityModule;
  action: string;
  status: ActivityStatus;
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

export interface ActivityDocument {
  version: typeof ACTIVITY_LOG_STORAGE_VERSION;
  savedAt: number;
  localOnly: true;
  cloudUsed: false;
  receipts: ActivityReceipt[];
}

export type ActivityReceiptInput = Parameters<typeof createActivityReceipt>[0];

export function sanitizeReceiptText(value: string, maxChars = ACTIVITY_LOG_SUMMARY_MAX_CHARS): string {
  const compact = value.replace(/\s+/g, " ").trim();
  const redacted = compact
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:sk|pk|ghp|gho|github_pat|xoxb|xoxp)[A-Za-z0-9_-]{8,}\b/g, "[secret]")
    .replace(/\b(?:password|passwd|pwd|api[_-]?key|token|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return redacted.length <= maxChars ? redacted : `${redacted.slice(0, maxChars - 1)}…`;
}

export function createActivityReceipt(args: {
  id?: string;
  createdAt?: number;
  completedAt?: number;
  module: ActivityModule;
  action: string;
  status?: ActivityStatus;
  title: string;
  summary: string;
  provider?: "local";
  model?: string;
  modelUsed?: boolean;
  changedLocalStorage?: boolean;
  relatedItemId?: string;
  metadata?: Record<string, string | number | boolean>;
}): ActivityReceipt {
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

export function createActivityDocument(
  receipts: readonly ActivityReceipt[] = [],
  now = Date.now(),
): ActivityDocument {
  return {
    version: ACTIVITY_LOG_STORAGE_VERSION,
    savedAt: now,
    localOnly: true,
    cloudUsed: false,
    receipts: receipts.map(normalizeReceipt).filter(isReceipt).slice(0, ACTIVITY_LOG_MAX_RECEIPTS),
  };
}

export function deserializeActivity(raw: string | null): ActivityDocument {
  if (typeof raw !== "string" || raw.trim().length === 0) return createActivityDocument();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createActivityDocument();
  }
  const doc = parsed as Partial<ActivityDocument> | null;
  if (
    !doc ||
    doc.version !== ACTIVITY_LOG_STORAGE_VERSION ||
    doc.localOnly !== true ||
    doc.cloudUsed !== false ||
    !Array.isArray(doc.receipts)
  ) {
    return createActivityDocument();
  }
  return createActivityDocument(doc.receipts, typeof doc.savedAt === "number" ? doc.savedAt : Date.now());
}

export function serializeActivity(doc: ActivityDocument, now = Date.now()): string {
  return JSON.stringify(createActivityDocument(doc.receipts, now));
}

export function loadActivity(storage: Pick<Storage, "getItem">): ActivityDocument {
  try {
    return deserializeActivity(storage.getItem(ACTIVITY_LOG_STORAGE_KEY));
  } catch {
    return createActivityDocument();
  }
}

export function saveActivity(storage: Pick<Storage, "setItem">, doc: ActivityDocument): void {
  try {
    storage.setItem(ACTIVITY_LOG_STORAGE_KEY, serializeActivity(doc));
  } catch {
    // Local storage may be unavailable or full; receipts should never break a workflow.
  }
}

export function appendActivityReceipt(
  doc: ActivityDocument,
  receipt: ActivityReceipt,
  now = Date.now(),
): ActivityDocument {
  return createActivityDocument([receipt, ...doc.receipts.filter((r) => r.id !== receipt.id)], now);
}

export function updateActivityReceiptStatus(
  doc: ActivityDocument,
  id: string,
  status: ActivityStatus,
  args: { completedAt?: number; summary?: string; model?: string } = {},
  now = Date.now(),
): ActivityDocument {
  const next = doc.receipts.map((receipt) => {
    if (receipt.id !== id) return receipt;
    return createActivityReceipt({
      ...receipt,
      status,
      completedAt: args.completedAt ?? receipt.completedAt ?? now,
      summary: args.summary ?? receipt.summary,
      model: args.model ?? receipt.model,
      modelUsed: receipt.modelUsed || Boolean(args.model),
    });
  });
  return createActivityDocument(next, now);
}

export function logActivityReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: Parameters<typeof createActivityReceipt>[0],
): ActivityReceipt | null {
  const receipt = createActivityReceipt(args);
  try {
    const doc = loadActivity(storage);
    saveActivity(storage, appendActivityReceipt(doc, receipt));
    return receipt;
  } catch {
    return null;
  }
}

export function clearActivityReceipts(now = Date.now()): ActivityDocument {
  return createActivityDocument([], now);
}

export function filterActivityReceipts(args: {
  receipts: readonly ActivityReceipt[];
  query?: string;
  module?: ActivityModuleFilter;
  status?: ActivityStatusFilter;
  model?: ActivityModelFilter;
}): ActivityReceipt[] {
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

export function formatActivityExport(
  doc: ActivityDocument,
  exportedAt = new Date().toISOString(),
): string {
  return [
    ACTIVITY_LOG_EXPORT_HEADER,
    `exportedAt: ${exportedAt}`,
    "localOnly: true",
    "cloudUsed: false",
    "",
    JSON.stringify(createActivityDocument(doc.receipts), null, 2),
    "",
  ].join("\n");
}

function normalizeReceipt(raw: unknown): ActivityReceipt | null {
  const receipt = raw as Partial<ActivityReceipt> | null;
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
  return createActivityReceipt({
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
    Object.entries(value).slice(0, ACTIVITY_LOG_MAX_METADATA_ENTRIES).map(([key, item]) => [
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

function isModule(value: unknown): value is ActivityModule {
  return value === "colloquium" || value === "velum" || value === "archivum" || value === "oculus" || value === "fabrica" || value === "nous" || value === "settings" || value === "system";
}

function isStatus(value: unknown): value is ActivityStatus {
  return value === "running" || value === "succeeded" || value === "failed" || value === "interrupted" || value === "info";
}

function isReceipt(receipt: ActivityReceipt | null): receipt is ActivityReceipt {
  return receipt !== null;
}
