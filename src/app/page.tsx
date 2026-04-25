"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SquidleyMascot } from "@/components/SquidleyMascot";
import {
  readFirstRunCompleted,
  readTourCompleted,
  readTourMode,
  writeFirstRunChoice,
} from "@/lib/firstRun";
import {
  getCloudUnlockModules,
  getCoreLocalModules,
} from "@/lib/modules/registry";

const VALUE_POINTS = [
  {
    icon: "🛡",
    title: "Local-first",
    body: "Core modules run on your device. Nothing is sent anywhere unless you ask.",
  },
  {
    icon: "🧭",
    title: "Squidley teaches as you go",
    body: "A short tour shows you each part of the screen, in plain language.",
  },
  {
    icon: "🌱",
    title: "Beginner-safe by default",
    body: "Calm defaults, no autonomous shells, no surprise cloud calls.",
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [returning, setReturning] = useState(false);
  const [tourCompleted, setTourCompleted] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setReturning(readFirstRunCompleted());
    setTourCompleted(readTourCompleted());
  }, []);

  function startTour() {
    writeFirstRunChoice("on");
    router.push("/colloquium?tour=1");
  }

  function skipTour() {
    writeFirstRunChoice("off");
    router.push("/colloquium");
  }

  function continueAsBefore() {
    const mode = readTourMode();
    router.push(mode === "on" ? "/colloquium?tour=1" : "/colloquium");
  }

  const core = getCoreLocalModules();
  const cloud = getCloudUnlockModules();

  return (
    <main className="bg-welcome-aurora min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 py-12">
        {/* Hero */}
        <section className="flex flex-col items-center pt-6 text-center sm:pt-12">
          <SquidleyMascot
            size={220}
            animated
            priority
            className="drop-shadow-[0_24px_48px_rgba(118,68,180,0.25)]"
          />

          <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-iris-600 dark:text-iris-300">
            Public Squidley
          </p>
          <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl dark:text-ink-50">
            Hi, I&rsquo;m Squidley.
          </h1>
          <p className="mt-3 max-w-xl text-balance text-base text-ink-600 dark:text-ink-200">
            A friendly companion that runs on your device. I can give you a
            short guided tour of the app, or you can jump straight in.
          </p>

          {/* Primary actions */}
          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={startTour}
                className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-xl bg-gradient-to-br from-squid-500 to-iris-500 px-6 text-base font-medium text-white shadow-md shadow-iris-500/20 transition hover:from-squid-600 hover:to-iris-600 focus:outline-none focus:ring-2 focus:ring-iris-400 focus:ring-offset-2"
              >
                Start Tour
              </button>
              <span className="mt-1.5 text-[11px] text-ink-400">
                About 60 seconds
              </span>
            </div>

            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={skipTour}
                className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-xl border border-ink-200 bg-white px-6 text-base font-medium text-ink-700 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-ink-300 focus:ring-offset-2 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100 dark:hover:bg-ink-700"
              >
                Skip Tour
              </button>
              <span className="mt-1.5 text-[11px] text-ink-400">
                You can start it any time
              </span>
            </div>
          </div>

          {/* Returning user */}
          {hydrated && returning && (
            <button
              type="button"
              onClick={continueAsBefore}
              className="mt-5 text-sm text-ink-500 underline decoration-dotted underline-offset-4 hover:text-ink-700 dark:text-ink-300 dark:hover:text-ink-50"
            >
              {tourCompleted ? "Continue where I left off" : "Continue as before"}
            </button>
          )}

          {/* Local-only reassurance */}
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-white/70 px-3 py-1 text-xs text-emerald-800 shadow-sm backdrop-blur dark:border-emerald-700/40 dark:bg-emerald-900/30 dark:text-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Local-only · stays on this device
          </p>
        </section>

        {/* Value props */}
        <section className="mt-14 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          {VALUE_POINTS.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-white/40 bg-white/70 p-4 shadow-sm backdrop-blur-sm dark:border-ink-700/60 dark:bg-ink-800/60"
            >
              <div className="text-xl" aria-hidden>
                {p.icon}
              </div>
              <h3 className="mt-2 font-serif text-base font-semibold text-ink-900 dark:text-ink-50">
                {p.title}
              </h3>
              <p className="mt-1 text-sm text-ink-600 dark:text-ink-200">
                {p.body}
              </p>
            </div>
          ))}
        </section>

        {/* Module preview */}
        <section className="mt-12 w-full">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
                Core modules
              </h2>
              <p className="text-xs text-ink-500 dark:text-ink-300">
                Beginner-safe · work locally without a cloud account.
              </p>
            </div>
            <Link
              href="/modules"
              className="text-sm text-iris-600 underline decoration-dotted underline-offset-4 hover:text-iris-700 dark:text-iris-300"
            >
              See all →
            </Link>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {core.map((m) => (
              <li
                key={m.id}
                className="rounded-full border border-emerald-200/70 bg-white/70 px-3 py-1 text-xs text-ink-700 shadow-sm backdrop-blur-sm dark:border-emerald-700/40 dark:bg-ink-800/60 dark:text-ink-100"
                title={m.beginnerDescription}
              >
                {m.displayName}
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <h2 className="font-serif text-xl font-semibold text-ink-900 dark:text-ink-50">
              Cloud Unlock
            </h2>
            <p className="text-xs text-ink-500 dark:text-ink-300">
              Advanced modules · shown so you know they exist. Locked in public
              mode.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {cloud.map((m) => (
                <li
                  key={m.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-white/60 px-3 py-1 text-xs text-ink-500 shadow-sm backdrop-blur-sm dark:border-amber-700/40 dark:bg-ink-800/40 dark:text-ink-300"
                  title={`${m.beginnerDescription} (locked in public mode)`}
                >
                  <span aria-hidden>🔒</span>
                  <span>{m.displayName}</span>
                  <span className="sr-only">(locked in public mode)</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <p className="mt-12 max-w-md text-center text-xs text-ink-400">
          Your choice is saved on this device only.
        </p>
      </div>
    </main>
  );
}
