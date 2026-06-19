import {
  appendActivityReceipt,
  createActivityReceipt,
  loadActivity,
  saveActivity,
  type ActivityModule,
  type ActivityReceipt,
} from "./receipts";

export type GatewayReceiptAction =
  | "prompt-gateway-blocked"
  | "prompt-gateway-caution-added"
  | "prompt-gateway-warning";

export interface PromptGatewayResponseMetadata {
  promptGatewayRisk?: unknown;
  promptGatewayAllowed?: unknown;
  promptGatewayFindings?: unknown;
  promptGatewayCategories?: unknown;
  promptGatewaySafeSummary?: unknown;
  risk?: unknown;
  allowed?: unknown;
  findingCategories?: unknown;
  safeSummary?: unknown;
}

export interface GatewayReceiptArgs {
  module: Extract<ActivityModule, "colloquium" | "fabrica" | "oculus" | "system">;
  route: string;
  metadata: unknown;
  modelUsed: boolean;
  dedupeKey: string;
  now?: number;
}

interface NormalizedGatewayMetadata {
  risk: string;
  allowed: boolean;
  categories: string[];
  findingCount: number;
  safeSummary: string;
}

export function normalizePromptGatewayMetadata(metadata: unknown): NormalizedGatewayMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const data = metadata as PromptGatewayResponseMetadata;
  const risk = cleanRisk(data.promptGatewayRisk ?? data.risk);
  if (!risk) return null;
  const allowed =
    typeof data.promptGatewayAllowed === "boolean"
      ? data.promptGatewayAllowed
      : typeof data.allowed === "boolean"
        ? data.allowed
        : risk !== "blocked";
  const categories = cleanCategories(data.promptGatewayCategories ?? data.findingCategories);
  const findingCount =
    typeof data.promptGatewayFindings === "number" && Number.isFinite(data.promptGatewayFindings)
      ? Math.max(0, Math.floor(data.promptGatewayFindings))
      : categories.length;
  const safeSummary = cleanSummary(
    typeof data.promptGatewaySafeSummary === "string"
      ? data.promptGatewaySafeSummary
      : typeof data.safeSummary === "string"
        ? data.safeSummary
        : "",
  ) || fallbackSummary(risk, allowed, categories);

  return { risk, allowed, categories, findingCount, safeSummary };
}

export function gatewayReceiptAction(metadata: NormalizedGatewayMetadata): GatewayReceiptAction | null {
  if (!metadata.allowed || metadata.risk === "blocked") return "prompt-gateway-blocked";
  if (metadata.risk === "medium" || metadata.risk === "high") return "prompt-gateway-caution-added";
  if (metadata.findingCount > 0) return "prompt-gateway-warning";
  return null;
}

export function createPromptGatewayReceipt(args: GatewayReceiptArgs): ActivityReceipt | null {
  const metadata = normalizePromptGatewayMetadata(args.metadata);
  if (!metadata) return null;
  const action = gatewayReceiptAction(metadata);
  if (!action) return null;
  const now = args.now ?? Date.now();
  const receiptId = buildGatewayReceiptId(args.module, args.dedupeKey, action);
  return createActivityReceipt({
    id: receiptId,
    createdAt: now,
    completedAt: now,
    module: args.module,
    action,
    status: action === "prompt-gateway-blocked" ? "failed" : "info",
    title: gatewayReceiptTitle(action),
    summary: metadata.safeSummary,
    modelUsed: action === "prompt-gateway-blocked" ? false : args.modelUsed,
    metadata: {
      route: args.route,
      module: args.module,
      risk: metadata.risk,
      findingCategories: metadata.categories.join(",") || "none",
      findingCount: metadata.findingCount,
    },
  });
}

export function logPromptGatewayReceipt(
  storage: Pick<Storage, "getItem" | "setItem">,
  args: GatewayReceiptArgs,
): string | null {
  const receipt = createPromptGatewayReceipt(args);
  if (!receipt) return null;
  const doc = loadActivity(storage);
  if (doc.receipts.some((item) => item.id === receipt.id)) return receipt.id;
  saveActivity(storage, appendActivityReceipt(doc, receipt));
  return receipt.id;
}

export function activityReceiptUrl(receiptId: string): string {
  const safeId = sanitizeReceiptId(receiptId);
  return safeId ? `/tabularium?receipt=${encodeURIComponent(safeId)}` : "/activity-log";
}

export function findReceiptByQueryId<T extends { id: string }>(
  receipts: readonly T[],
  queryId: string | null,
): T | null {
  const safeId = sanitizeReceiptId(queryId ?? "");
  if (!safeId) return null;
  return receipts.find((receipt) => receipt.id === safeId) ?? null;
}

export function gatewayReceiptTitle(action: GatewayReceiptAction): string {
  switch (action) {
    case "prompt-gateway-blocked":
      return "Prompt Gateway paused a request";
    case "prompt-gateway-caution-added":
      return "Prompt Gateway added caution";
    case "prompt-gateway-warning":
      return "Prompt Gateway noticed suspicious text";
  }
}

function cleanRisk(value: unknown): string {
  if (value === "low" || value === "medium" || value === "high" || value === "blocked") return value;
  return "";
}

function buildGatewayReceiptId(
  module: GatewayReceiptArgs["module"],
  dedupeKey: string,
  action: GatewayReceiptAction,
): string {
  return `gateway-${module}-${sanitizeReceiptIdComponent(dedupeKey)}-${action}`;
}

function sanitizeReceiptId(value: string): string {
  const trimmed = value.trim();
  if (!/^[a-z0-9._:-]+$/i.test(trimmed)) return "";
  return trimmed.slice(0, 180);
}

function sanitizeReceiptIdComponent(value: string): string {
  return value.replace(/[^a-z0-9._:-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "event";
}

function cleanCategories(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return Array.from(new Set(raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/[^a-z0-9._:-]+/gi, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .slice(0, 8)));
}

function cleanSummary(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:sk|pk|ghp|gho|github_pat|xoxb|xoxp)[A-Za-z0-9_-]{8,}\b/g, "[secret]")
    .replace(/\b(?:password|passwd|pwd|api[_-]?key|token|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .trim()
    .slice(0, 220);
}

function fallbackSummary(risk: string, allowed: boolean, categories: readonly string[]): string {
  const categoryText = categories.length > 0 ? categories.join(", ") : "none";
  return `Prompt Gateway ${allowed ? "guarded" : "paused"} a local model request with ${risk} risk. Categories: ${categoryText}.`;
}
