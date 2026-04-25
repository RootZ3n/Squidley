import { Suspense } from "react";
import ColloquiumClient from "./ColloquiumClient";

export default function ColloquiumPage() {
  return (
    <Suspense fallback={<ColloquiumLoading />}>
      <ColloquiumClient />
    </Suspense>
  );
}

function ColloquiumLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-6">
      <p className="text-sm text-ink-400">Loading Colloquium…</p>
    </main>
  );
}
