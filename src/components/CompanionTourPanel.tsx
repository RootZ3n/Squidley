"use client";

import { useCallback, useEffect, useState } from "react";
import { PehMascot } from "@/components/PehMascot";
import type { ModuleTour } from "@/lib/tour";

/**
 * Companion tour card. Anchors itself bottom-right, walks the user through
 * `tour.steps` in order, and emits the active step's `target` so the host
 * page can highlight the matching `data-tour` region.
 *
 * Keyboard:
 *   ←      back
 *   → / Enter   next / finish
 *   Esc    end the tour
 */
export function CompanionTourPanel({
  tour,
  onActiveTargetChange,
  onClose,
  onFinish,
}: {
  tour: ModuleTour;
  onActiveTargetChange?: (target: string | null) => void;
  /** Called when the user dismisses the tour without completing it. */
  onClose?: () => void;
  /** Called when the user reaches and confirms the final step. */
  onFinish?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const total = tour.steps.length;
  const step = tour.steps[index];
  const isLast = index === total - 1;

  useEffect(() => {
    if (done) {
      onActiveTargetChange?.(null);
      return;
    }
    onActiveTargetChange?.(step?.target ?? null);
  }, [step, done, onActiveTargetChange]);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i < total - 1) return i + 1;
      setDone(true);
      return i;
    });
  }, [total]);

  const prev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const close = useCallback(() => {
    onActiveTargetChange?.(null);
    onClose?.();
  }, [onActiveTargetChange, onClose]);

  const finish = useCallback(() => {
    onActiveTargetChange?.(null);
    onFinish?.();
  }, [onActiveTargetChange, onFinish]);

  // Keyboard navigation. Skip when focus is in an editable field so a user
  // typing in the chat doesn't accidentally advance the tour.
  useEffect(() => {
    function isEditable(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    }
    function onKey(e: KeyboardEvent) {
      if (isEditable(e.target)) return;
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (done) finish();
        else next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (!done) prev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (done) finish();
        else close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, close, finish, done]);

  if (done) {
    return (
      <aside
        role="dialog"
        aria-label={`${tour.moduleName} tour complete`}
        className="motion-safe:animate-panel-in fixed bottom-6 right-6 z-40 w-[min(92vw,360px)] rounded-2xl border border-iris-200 bg-white p-5 shadow-xl dark:border-iris-700/60 dark:bg-ink-800"
      >
        <div className="flex items-start gap-3">
          <PehMascot size={56} framed className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-iris-600 dark:text-iris-300">
              All done
            </p>
            <h2 className="mt-1 font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">
              You&rsquo;re set.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-200">
              Try sending a message whenever you&rsquo;re ready. I&rsquo;ll be
              here if you want to retake the tour from the header.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={finish}
            className="rounded-lg bg-squid-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-squid-700 focus:outline-none focus:ring-2 focus:ring-squid-400 focus:ring-offset-2"
            autoFocus
          >
            Got it
          </button>
        </div>
      </aside>
    );
  }

  if (!step) return null;

  return (
    <aside
      role="dialog"
      aria-label={`${tour.moduleName} tour, step ${index + 1} of ${total}`}
      className="motion-safe:animate-panel-in fixed bottom-6 right-6 z-40 w-[min(92vw,380px)] rounded-2xl border border-ink-200 bg-white/95 p-4 shadow-xl backdrop-blur-sm dark:border-ink-700 dark:bg-ink-800/95"
    >
      <div className="flex items-start gap-3">
        <PehMascot size={56} framed className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-iris-600 dark:text-iris-300">
              {tour.moduleName} tour · Step {index + 1} of {total}
            </p>
            <button
              type="button"
              onClick={close}
              className="text-xs text-ink-400 hover:text-ink-700 focus:outline-none focus:underline dark:hover:text-ink-100"
            >
              End tour
            </button>
          </div>
          <h2 className="mt-1 font-serif text-lg font-semibold leading-snug text-ink-900 dark:text-ink-50">
            {step.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-200">
            {step.body}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-700">
        <div
          className="h-full bg-gradient-to-r from-squid-400 via-iris-400 to-lotus-400 transition-[width] duration-300"
          style={{ width: `${((index + 1) / total) * 100}%` }}
          aria-hidden
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prev}
          disabled={index === 0}
          className="rounded-lg px-2 py-1 text-sm text-ink-500 hover:text-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-300 disabled:opacity-40 dark:hover:text-ink-100"
        >
          ← Back
        </button>
        <span className="text-[11px] text-ink-400">
          Use ← → keys to navigate
        </span>
        <button
          type="button"
          onClick={next}
          className="rounded-lg bg-squid-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-squid-700 focus:outline-none focus:ring-2 focus:ring-squid-400 focus:ring-offset-2"
          autoFocus
        >
          {isLast ? "Finish tour" : "Next →"}
        </button>
      </div>
    </aside>
  );
}

export default CompanionTourPanel;
