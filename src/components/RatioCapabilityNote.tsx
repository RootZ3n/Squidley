import Link from "next/link";
import type { RatioDecision } from "@/lib/ratio";
import { getRatioStatusLabel, getRatioUnlockLine } from "@/lib/ratio";

export function RatioCapabilityNote({
  decision,
  title = "Ratio decision",
  compact = false,
  showNousLink = true,
  className = "",
}: {
  decision: RatioDecision;
  title?: string;
  compact?: boolean;
  showNousLink?: boolean;
  className?: string;
}) {
  const unlockLine = getRatioUnlockLine(decision);
  const safetyNote = decision.safetyNotes[0] ?? null;
  return (
    <section className={`rounded-xl border border-ink-200 bg-white/90 p-3 text-sm shadow-sm dark:border-ink-700 dark:bg-ink-800/90 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-sm font-semibold text-ink-900 dark:text-ink-50">
          {title}
        </h3>
        <span className={ratioStatusClass(decision.status)}>
          {getRatioStatusLabel(decision.status)}
        </span>
      </div>
      <p className={`mt-2 text-ink-600 dark:text-ink-300 ${compact ? "text-xs leading-5" : "text-sm leading-6"}`}>
        {decision.beginnerMessage}
      </p>
      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{decision.reason}</p>
      {!compact && <p className="mt-1 text-xs text-ink-400 dark:text-ink-500">{decision.modelSummary}</p>}
      {safetyNote && <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">{safetyNote}</p>}
      {unlockLine && <p className="mt-2 text-xs text-iris-700 dark:text-iris-200">{unlockLine}</p>}
      {showNousLink && (
        <Link href="/nous" className="mt-2 inline-flex text-xs font-medium text-iris-600 underline decoration-dotted underline-offset-4 dark:text-iris-300">
          See Ratio in Nous
        </Link>
      )}
    </section>
  );
}

function ratioStatusClass(status: RatioDecision["status"]): string {
  const base = "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]";
  if (status === "available") {
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100`;
  }
  if (status === "limited" || status === "needs-stronger-model" || status === "requires-approval") {
    return `${base} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100`;
  }
  if (status === "needs-cloud-unlock" || status === "needs-tool-permission" || status === "needs-workspace" || status === "future") {
    return `${base} border-iris-200 bg-iris-50 text-iris-800 dark:border-iris-700/60 dark:bg-iris-900/20 dark:text-iris-100`;
  }
  return `${base} border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-100`;
}
