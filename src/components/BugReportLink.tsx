"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  buildBugReportMailto,
  buildReceiptBugReportMailto,
  getClientBugReportContext,
  getConfiguredBugReportEmail,
  type BugReportContext,
} from "@/lib/support/bugReport";
import type { TabulariumReceipt } from "@/lib/tabularium/receipts";

interface BugReportLinkProps {
  pageModule: string;
  issueSummary?: string;
  receipt?: TabulariumReceipt;
  children?: ReactNode;
  unavailableChildren?: ReactNode;
  className?: string;
}

export function BugReportLink({
  pageModule,
  issueSummary,
  receipt,
  children = "Report issue",
  unavailableChildren = "Report issue unavailable",
  className,
}: BugReportLinkProps) {
  const [href, setHref] = useState<string | null>(() => {
    const to = getConfiguredBugReportEmail();
    if (!to) return null;
    return receipt
      ? buildReceiptBugReportMailto({ to, receipt })
      : buildBugReportMailto({
          to,
          issueSummary,
          pageModule,
          localCloudMode: "local-first / no cloud fallback",
        });
  });

  useEffect(() => {
    const to = getConfiguredBugReportEmail();
    if (!to) {
      setHref(null);
      return;
    }
    const clientContext = getClientBugReportContext(pageModule);
    const context: BugReportContext = {
      to,
      issueSummary,
      localCloudMode: "local-first / no cloud fallback",
      ...clientContext,
    };
    setHref(receipt
      ? buildReceiptBugReportMailto({
          to,
          receipt,
          browserUserAgent: clientContext.browserUserAgent,
          currentUrl: clientContext.currentUrl,
        })
      : buildBugReportMailto(context));
  }, [issueSummary, pageModule, receipt]);

  if (!href) {
    return (
      <span
        title="Bug reporting email is not configured."
        className={className ?? "text-xs text-ink-400"}
      >
        {unavailableChildren}
      </span>
    );
  }

  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
