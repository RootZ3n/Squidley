"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CompanionTourPanel } from "@/components/CompanionTourPanel";
import { RatioCapabilityNote } from "@/components/RatioCapabilityNote";
import { TourHighlight } from "@/components/TourHighlight";
import {
  markTourCompleted,
  readTourMode,
  restartTour as persistRestartTour,
} from "@/lib/firstRun";
import { getTour } from "@/lib/tour";
import {
  createVelumRedactedPreview,
  reviewVelumText,
  type VelumFinding,
  type VelumReviewResult,
  type VelumSeverity,
} from "@/lib/velum/review";
import {
  consumeColloquiumToVelumHandoff,
  consumeMoreInputToVelumHandoff,
  saveVelumHandoff,
  saveVelumToMoreInputHandoff,
} from "@/lib/velum/handoff";
import { logTabulariumReceipt } from "@/lib/tabularium/receipts";
import { velumDeterministicReviewDecision } from "@/lib/ratio";
import {
  buildVelumHandoffFromColloquiumReceipt,
  buildVelumHandoffFromMoreInputReceipt,
  buildVelumHandoffToColloquiumReceipt,
  buildVelumHandoffToMoreInputReceipt,
  buildVelumRedactionCreatedReceipt,
  buildVelumReviewReceipt,
} from "@/lib/velum/receipts";
import { recordVelumCapabilityDecisionReceipt } from "@/lib/velum/capabilityReceipts";

export default function VelumPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [review, setReview] = useState<VelumReviewResult | null>(null);
  const [redacted, setRedacted] = useState("");
  const [tourActive, setTourActive] = useState(false);
  const [tourRunId, setTourRunId] = useState(0);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const [sourceTarget, setSourceTarget] = useState<"colloquium" | "more-input" | null>(null);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceEntryType, setSourceEntryType] = useState("");
  const [sourceEntryId, setSourceEntryId] = useState("");

  const tour = useMemo(() => getTour("velum")!, []);
  const reviewRatio = useMemo(() => velumDeterministicReviewDecision(), []);
  const grouped = useMemo(() => groupFindings(review?.findings ?? []), [review]);

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("tour") === "1";
    setTourActive(fromQuery || readTourMode() === "on");
  }, []);

  useEffect(() => {
    const handoff = consumeColloquiumToVelumHandoff(window.sessionStorage);
    if (handoff) {
      setText(handoff.draftText);
      setSourceTarget("colloquium");
      setSourceNote("This draft came from Colloquium for review. Click Review text when you are ready.");
      logTabulariumReceipt(window.localStorage, buildVelumHandoffFromColloquiumReceipt());
      return;
    }
    const moreInput = consumeMoreInputToVelumHandoff(window.sessionStorage);
    if (!moreInput) return;
    setText(moreInput.draftText);
    setSourceTarget("more-input");
    setSourceTitle(moreInput.title ?? "");
    setSourceEntryType(moreInput.entryType ?? "");
    setSourceEntryId(moreInput.entryId ?? "");
    setSourceNote("This text came from More Input for review. Click Review text when you are ready.");
    logTabulariumReceipt(window.localStorage, buildVelumHandoffFromMoreInputReceipt());
  }, []);

  function handleReview() {
    const next = reviewVelumText(text);
    setReview(next);
    setRedacted("");
    logTabulariumReceipt(window.localStorage, buildVelumReviewReceipt(next));
    recordVelumCapabilityDecisionReceipt(window.localStorage, { reviewCompleted: true });
  }

  function handleClear() {
    setText("");
    setReview(null);
    setRedacted("");
    setSourceNote(null);
    setSourceTarget(null);
    setSourceTitle("");
    setSourceEntryType("");
    setSourceEntryId("");
  }

  function handleRedact() {
    setRedacted(createVelumRedactedPreview(text));
    logTabulariumReceipt(window.localStorage, buildVelumRedactionCreatedReceipt());
  }

  function handleRestartTour() {
    persistRestartTour();
    setTourRunId((n) => n + 1);
    setTourActive(true);
  }

  function handleEndTour() {
    markTourCompleted();
    setTourActive(false);
    setActiveTarget(null);
  }

  function handleSendToColloquium() {
    const ok = saveVelumHandoff(window.sessionStorage, redacted);
    if (!ok) {
      setHandoffError("Velum could not prepare the redacted draft in this browser.");
      return;
    }
    logTabulariumReceipt(window.localStorage, buildVelumHandoffToColloquiumReceipt());
    router.push("/colloquium?from=velum");
  }

  function handleSendToMoreInput() {
    const ok = saveVelumToMoreInputHandoff(window.sessionStorage, {
      redactedText: redacted,
      title: sourceTitle,
      entryType: sourceEntryType,
      entryId: sourceEntryId,
      riskSummary: review ? summarizeRisk(review) : undefined,
    });
    if (!ok) {
      setHandoffError("Velum could not prepare the redacted text for More Input in this browser.");
      return;
    }
    logTabulariumReceipt(window.localStorage, buildVelumHandoffToMoreInputReceipt());
    router.push("/archivum?from=velum");
  }

  return (
    <div className="sq-page mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <TourHighlight target="intro" active={activeTarget}>
        <header className="border-b border-ink-200 pb-5 dark:border-ink-700">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-iris-600 dark:text-iris-300">
            Squidley · Velum
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-ink-900 dark:text-ink-50">
            What am I about to share?
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600 dark:text-ink-300">
            Velum helps you pause before sharing text with AI. It looks for things
            you may not want to send, such as secrets, private details,
            suspicious instructions, or hidden prompt-like commands.
          </p>
          <TourHighlight target="local-only-indicator" active={activeTarget}>
            <p
              className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100"
              title="Pattern-based checks run in your browser. No AI model is called. Helpful, but not a guarantee of safety."
            >
              Local-only · pattern-based checks · no model call
            </p>
          </TourHighlight>
          <nav className="mt-4 flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={handleRestartTour}
              className="rounded-lg border border-iris-200 bg-white px-3 py-1.5 font-medium text-iris-700 shadow-sm hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-800 dark:text-iris-100"
            >
              Restart tour
            </button>
          <Link href="/colloquium" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
            Colloquium
          </Link>
          <Link href="/modules" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
            Modules
          </Link>
          <Link href="/tabularium" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
            Tabularium
          </Link>
          <Link href="/nous" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
            Nous
          </Link>
          </nav>
        </header>
      </TourHighlight>

      <div className="mt-4">
        <RatioCapabilityNote
          decision={reviewRatio}
          title="Ratio: deterministic review"
          compact
        />
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <TourHighlight
          target="velum-paste"
          active={activeTarget}
          className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800"
        >
          <label htmlFor="velum-text" className="text-sm font-semibold text-ink-800 dark:text-ink-100">
            Paste text to review
          </label>
          {sourceNote && (
            <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100">
              {sourceNote}
            </p>
          )}
          <textarea
            id="velum-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            className="mt-3 w-full resize-y rounded-xl border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm text-ink-900 outline-none focus:border-squid-300 focus:ring-2 focus:ring-squid-200 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
            placeholder="Paste text here before sending it to AI, saving it, or importing it somewhere else."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <TourHighlight target="velum-review" active={activeTarget}>
              <button
                type="button"
                onClick={handleReview}
                className="rounded-lg bg-squid-600 px-4 py-2 text-sm font-medium text-white hover:bg-squid-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={text.trim().length === 0}
              >
                Review text
              </button>
            </TourHighlight>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleRedact}
              className="rounded-lg border border-iris-200 bg-white px-4 py-2 text-sm font-medium text-iris-700 hover:bg-iris-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100"
              disabled={text.trim().length === 0}
            >
              Create redacted preview
            </button>
          </div>
        </TourHighlight>

        <aside className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
          <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">
            How to use this
          </h2>
          <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
            Velum is a review helper, not a legal or security guarantee. It uses
            simple local pattern checks so you can slow down and decide what to remove.
          </p>
          <ul className="mt-3 space-y-2 text-xs text-ink-500 dark:text-ink-300">
            <li>Review before sharing.</li>
            <li>Remove or redact possible secrets.</li>
            <li>Keep sensitive details local when unsure.</li>
            <li>No cloud fallback is used.</li>
          </ul>
        </aside>
      </section>

      <TourHighlight target="velum-findings" active={activeTarget}>
        <section className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
              Review results
            </h2>
            {review ? <RiskBadge risk={review.overallRisk} /> : null}
          </div>
          {review ? (
            <p className="mt-2 text-sm text-ink-500 dark:text-ink-300">
              I found {review.findings.length} possible issue{review.findings.length === 1 ? "" : "s"}.
              Review before sharing. Local-only: yes. Cloud used: no. Model used: no.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-500 dark:text-ink-300">
              Results will appear here after you review text.
            </p>
          )}

          {review && review.findings.length === 0 ? (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100">
              I did not find the simple risk signals Velum checks for. Still review
              anything sensitive before sharing it.
            </p>
          ) : review ? (
            <div className="mt-4 grid gap-3">
              {(["high", "medium", "low"] as const).map((severity) =>
                grouped[severity].length > 0 ? (
                  <FindingGroup
                    key={severity}
                    severity={severity}
                    findings={grouped[severity]}
                  />
                ) : null,
              )}
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <InfoBox
              title="Why this matters"
              body="Text pasted into AI can include account secrets, personal details, or instructions that change how a model behaves. Velum helps you notice those before you share."
            />
            <InfoBox
              title="What you can do next"
              body="Remove or redact risky parts, keep the text local, or manually copy a cleaned version into Colloquium without including secrets."
            />
          </div>
        </section>
      </TourHighlight>

      <TourHighlight target="velum-redaction" active={activeTarget}>
        <section className="mt-4 rounded-xl border border-iris-200 bg-iris-50/50 p-4 shadow-sm dark:border-iris-700/60 dark:bg-iris-900/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">
              Redacted preview
            </h2>
            <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setText(redacted)}
              className="rounded-lg bg-iris-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-iris-700"
              disabled={!redacted}
            >
              Use redacted version
            </button>
              <button
                type="button"
                onClick={handleSendToColloquium}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700/60 dark:bg-ink-900 dark:text-emerald-100"
                disabled={!redacted}
              >
                Send redacted version to Colloquium
              </button>
              {sourceTarget === "more-input" && (
                <button
                  type="button"
                  onClick={handleSendToMoreInput}
                  className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700/60 dark:bg-ink-900 dark:text-emerald-100"
                  disabled={!redacted}
                >
                  Send redacted version to More Input
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-iris-800 dark:text-iris-100">
            Only this redacted preview is handed off. Your original pasted text stays on this page. Colloquium will still wait for you to click Send.
          </p>
          {handoffError && (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{handoffError}</p>
          )}
          {redacted ? (
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-iris-200 bg-white p-3 text-xs text-ink-800 dark:border-iris-700/60 dark:bg-ink-900 dark:text-ink-100">
              {redacted}
            </pre>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-iris-200 bg-white/70 p-3 text-xs text-ink-500 dark:border-iris-700/60 dark:bg-ink-900/40 dark:text-ink-300">
              Create a redacted preview to see it here.
            </p>
          )}
        </section>
      </TourHighlight>

      {tourActive && (
        <CompanionTourPanel
          key={tourRunId}
          tour={tour}
          onActiveTargetChange={setActiveTarget}
          onClose={handleEndTour}
          onFinish={handleEndTour}
        />
      )}
    </div>
  );
}

function RiskBadge({ risk }: { risk: VelumReviewResult["overallRisk"] }) {
  const cls =
    risk === "high"
      ? "border-amber-300 bg-amber-100 text-amber-900"
      : risk === "medium"
        ? "border-iris-300 bg-iris-50 text-iris-800"
        : "border-emerald-300 bg-emerald-50 text-emerald-800";
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase ${cls}`}>
      {risk} risk
    </span>
  );
}

function FindingGroup({
  severity,
  findings,
}: {
  severity: VelumSeverity;
  findings: VelumFinding[];
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
        {severity} severity
      </h3>
      <ul className="mt-2 space-y-2">
        {findings.map((finding) => (
          <li key={finding.id} className="rounded-lg border border-ink-100 bg-ink-50/70 p-3 text-sm dark:border-ink-700/60 dark:bg-ink-900/40">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink-800 dark:text-ink-100">
                {finding.label}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase text-ink-500 dark:bg-ink-800">
                {finding.category}
              </span>
            </div>
            <p className="mt-1 text-ink-600 dark:text-ink-300">{finding.explanation}</p>
            <p className="mt-2 font-mono text-xs text-ink-500 dark:text-ink-400">
              Found: {finding.matchedPreview}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InfoBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/70 p-3 dark:border-ink-700/60 dark:bg-ink-900/40">
      <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">{title}</h3>
      <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{body}</p>
    </div>
  );
}

function groupFindings(findings: VelumFinding[]): Record<VelumSeverity, VelumFinding[]> {
  return {
    high: findings.filter((f) => f.severity === "high"),
    medium: findings.filter((f) => f.severity === "medium"),
    low: findings.filter((f) => f.severity === "low"),
  };
}

function summarizeRisk(review: VelumReviewResult) {
  const order: Record<VelumSeverity, number> = { low: 1, medium: 2, high: 3 };
  const highest = review.findings.reduce<VelumSeverity>(
    (max, finding) => (order[finding.severity] > order[max] ? finding.severity : max),
    "low",
  );
  return {
    overallRisk: review.overallRisk,
    findingCount: review.findings.length,
    highestSeverity: highest,
  };
}
