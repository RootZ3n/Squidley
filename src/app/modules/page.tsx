import Link from "next/link";
import {
  getCloudUnlockModules,
  getCoreLocalModules,
  type PublicModule,
} from "@/lib/modules/registry";

export const metadata = {
  title: "Modules · Squidley",
};

export default function ModulesPage() {
  const core = getCoreLocalModules();
  const cloud = getCloudUnlockModules();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-iris-600 dark:text-iris-300">
          Squidley · Modules
        </p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-ink-900 dark:text-ink-50">
          What Squidley can do
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-600 dark:text-ink-300">
          Squidley is made of small, named modules. Core modules run locally
          and work without an account. Advanced modules are listed too — so
          you can see what is coming — but they are locked in public mode.
        </p>
      </header>

      <Section
        title="Core Local Modules"
        accent="emerald"
        subtitle="Beginner-safe. These work without a cloud account."
      >
        <Grid modules={core} variant="local" />
      </Section>

      <Section
        title="Cloud Unlock Modules"
        accent="amber"
        subtitle="Advanced. Shown so you know they exist; locked in public mode."
      >
        <Grid modules={cloud} variant="locked" />
      </Section>

      <p className="mt-12 text-xs text-ink-400">
        <Link href="/colloquium" className="underline decoration-dotted">
          ← Back to Colloquium
        </Link>
      </p>
    </main>
  );
}

function Section({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  accent: "emerald" | "amber";
  children: React.ReactNode;
}) {
  const dot =
    accent === "emerald"
      ? "bg-emerald-500"
      : accent === "amber"
        ? "bg-amber-500"
        : "bg-iris-500";
  return (
    <section className="mt-6">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
        <h2 className="font-serif text-xl font-semibold text-ink-800 dark:text-ink-100">
          {title}
        </h2>
      </div>
      <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-300">
        {subtitle}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Grid({
  modules,
  variant,
}: {
  modules: PublicModule[];
  variant: "local" | "locked";
}) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {modules.map((m) => (
        <ModuleCard key={m.id} module={m} variant={variant} />
      ))}
    </ul>
  );
}

function ModuleCard({
  module: m,
  variant,
}: {
  module: PublicModule;
  variant: "local" | "locked";
}) {
  const locked = variant === "locked";
  return (
    <li
      className={`relative flex flex-col rounded-2xl border p-4 shadow-sm transition ${
        locked
          ? "border-amber-200 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-900/10"
          : "border-ink-200 bg-white hover:border-iris-200 dark:border-ink-700 dark:bg-ink-800 dark:hover:border-iris-700/60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">
            {m.displayName}
          </h3>
          {m.latinMeaning && (
            <p className="mt-0.5 text-[11px] italic text-ink-400">
              Latin: {m.latinMeaning}
            </p>
          )}
        </div>
        {locked ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-200"
            aria-label="Locked in public mode"
          >
            <span aria-hidden>🔒</span> Locked
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200">
            Local
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-ink-600 dark:text-ink-200">
        {m.beginnerDescription}
      </p>

      {m.limitations && m.limitations.length > 0 && (
        <div className="mt-3 rounded-xl border border-ink-100 bg-ink-50/70 p-3 dark:border-ink-700/60 dark:bg-ink-900/40">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500 dark:text-ink-300">
            In public mode
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-ink-600 dark:text-ink-200">
            {m.limitations.map((l) => (
              <li key={l} className="flex gap-1.5">
                <span aria-hidden className="text-ink-400">
                  •
                </span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        {locked ? (
          <span className="text-xs text-ink-400">
            Available with Cloud Unlock
          </span>
        ) : (
          <span className="text-xs text-emerald-700 dark:text-emerald-300">
            Runs locally
          </span>
        )}
        {!locked && m.route && (
          <Link
            href={m.route}
            className="text-sm font-medium text-iris-600 hover:text-iris-700 dark:text-iris-300"
          >
            Open →
          </Link>
        )}
      </div>
    </li>
  );
}
