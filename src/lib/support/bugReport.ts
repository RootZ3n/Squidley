import type { ActivityReceipt } from "@/lib/activity-log/receipts";

export const BUG_REPORT_PRODUCT = "Peh Public";
export const UNKNOWN_BUILD = "unknown";
export const BUG_REPORT_SUBJECT_PREFIX = "[Peh Public Bug]";

export interface BugReportContext {
  to?: string;
  issueSummary?: string;
  product?: string;
  buildVersion?: string;
  pageModule?: string;
  localCloudMode?: string;
  model?: string;
  provider?: string;
  browserUserAgent?: string;
  currentUrl?: string;
  receiptId?: string;
  receiptModule?: string;
  receiptAction?: string;
  receiptStatus?: string;
  receiptSummary?: string;
  receiptMetadata?: Record<string, string | number | boolean>;
}

export function getConfiguredBugReportEmail(
  value = process.env.NEXT_PUBLIC_BUG_REPORT_EMAIL,
): string | null {
  const email = (value ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function getClientBugReportContext(pageModule: string): Pick<
  BugReportContext,
  "browserUserAgent" | "currentUrl" | "pageModule"
> {
  if (typeof window === "undefined") return { pageModule };
  return {
    pageModule,
    browserUserAgent: window.navigator.userAgent,
    currentUrl: window.location.href,
  };
}

export function buildBugReportMailto(args: BugReportContext): string | null {
  const to = getConfiguredBugReportEmail(args.to);
  if (!to) return null;
  const subject = `${BUG_REPORT_SUBJECT_PREFIX} ${shortIssueSummary(args.issueSummary)}`;
  const body = buildBugReportBody(args);
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildReceiptBugReportMailto(args: {
  to?: string;
  receipt: ActivityReceipt;
  browserUserAgent?: string;
  currentUrl?: string;
}): string | null {
  const { receipt } = args;
  return buildBugReportMailto({
    to: args.to,
    issueSummary: `${receipt.module} ${receipt.action}`,
    pageModule: "ActivityLog",
    localCloudMode: receipt.cloudUsed ? "cloud-used" : "local-only",
    model: receipt.model,
    provider: receipt.provider,
    browserUserAgent: args.browserUserAgent,
    currentUrl: args.currentUrl,
    receiptId: receipt.id,
    receiptModule: receipt.module,
    receiptAction: receipt.action,
    receiptStatus: receipt.status,
    receiptSummary: receipt.summary,
    receiptMetadata: receipt.metadata,
  });
}

export function buildBugReportBody(args: BugReportContext): string {
  const lines = [
    `Product: ${args.product ?? BUG_REPORT_PRODUCT}`,
    `Version/build: ${args.buildVersion ?? UNKNOWN_BUILD}`,
    `Page/module: ${args.pageModule ?? "unknown"}`,
    `Local/cloud mode: ${args.localCloudMode ?? "local-first / no cloud fallback"}`,
    `Model/provider: ${formatModelProvider(args.model, args.provider)}`,
    `Browser user agent: ${args.browserUserAgent ?? "unknown"}`,
    `Current URL/path: ${args.currentUrl ?? "unknown"}`,
    `ActivityLog receipt id: ${args.receiptId ?? "none"}`,
  ];

  if (args.receiptModule || args.receiptAction || args.receiptStatus || args.receiptSummary) {
    lines.push(
      "",
      "Safe receipt context:",
      `- Module: ${args.receiptModule ?? "unknown"}`,
      `- Action: ${args.receiptAction ?? "unknown"}`,
      `- Status: ${args.receiptStatus ?? "unknown"}`,
      `- Safe summary: ${args.receiptSummary ?? "none"}`,
    );
    const metadata = formatSafeMetadata(args.receiptMetadata);
    if (metadata.length > 0) {
      lines.push("- Safe metadata:", ...metadata.map((item) => `  - ${item}`));
    }
  }

  lines.push(
    "",
    "What happened:",
    "",
    "What I expected:",
    "",
    "Steps to reproduce:",
    "1. ",
    "2. ",
    "3. ",
    "",
    "Screenshots/logs attached manually:",
    "",
    "Privacy note: Peh did not attach raw prompts, document text, secrets, image data, local storage, or logs automatically.",
  );

  return lines.join("\n");
}

function shortIssueSummary(value: string | undefined): string {
  const summary = (value ?? "").replace(/\s+/g, " ").trim();
  if (!summary) return "<short issue summary>";
  return summary.length <= 80 ? summary : `${summary.slice(0, 79)}…`;
}

function formatModelProvider(model: string | undefined, provider: string | undefined): string {
  if (model && provider) return `${model} / ${provider}`;
  return model ?? provider ?? "unknown";
}

function formatSafeMetadata(metadata: Record<string, string | number | boolean> | undefined): string[] {
  if (!metadata) return [];
  return Object.entries(metadata).map(([key, value]) => `${key}: ${String(value)}`);
}
