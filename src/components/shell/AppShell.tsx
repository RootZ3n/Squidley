"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DesktopSidebar, MobileTabBar } from "./Sidebar";
import { runStorageMigrations } from "@/lib/compat/storage";

/**
 * One-time, client-only Peh->Peh localStorage migration (peh-pub).
 *
 * Run during AppShell render (not in an effect) and guarded by a module-scope
 * flag: child page effects run before parent effects, so an effect here would
 * fire AFTER a returning user's page already read the (empty) Peh keys. Doing
 * it at render time guarantees saved state is migrated before any page reads.
 * Idempotent and best-effort — storage may be unavailable in privacy mode.
 */
let storageMigrated = false;
function ensureStorageMigrated(): void {
  if (storageMigrated || typeof window === "undefined") return;
  storageMigrated = true;
  try {
    if (window.localStorage) runStorageMigrations(window.localStorage);
  } catch {
    /* best-effort */
  }
}

/**
 * AppShell — desktop sidebar on wide screens, bottom tab bar on mobile.
 *
 * The shell owns:
 *   - the persistent left sidebar (desktop) / bottom tab bar (mobile)
 *   - the top pulse line that ties the page to the Peh identity
 *   - the scrollable <main> region
 *
 * Pages render their own header / content inside <main>. The shell does
 * not inject a topbar so each page can choose between a glass header
 * (AppPageShell) or a custom layout (Chat).
 */
export function AppShell({ children }: { children: ReactNode }) {
  ensureStorageMigrated();
  const [isMobile, setIsMobile] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const mq = window.matchMedia("(max-width: 880px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const pulseLine = (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        background:
          "linear-gradient(90deg, transparent 0%, var(--accent-chat) 20%, var(--accent-vision) 50%, var(--accent-planner) 80%, transparent 100%)",
        opacity: 0.55,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    />
  );

  // Avoid hydration mismatch by rendering the desktop layout on the
  // server. The client effect above swaps to mobile after mount.
  if (!hydrated || !isMobile) {
    return (
      <div
        style={{
          display: "flex",
          height: "100dvh",
          width: "100%",
          maxWidth: "100vw",
          overflow: "hidden",
          position: "relative",
          zIndex: 1,
        }}
      >
        {pulseLine}
        <DesktopSidebar />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <main
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        width: "100%",
        maxWidth: "100vw",
        overflow: "hidden",
        position: "relative",
        zIndex: 1,
      }}
    >
      {pulseLine}
      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {children}
      </main>
      <MobileTabBar />
    </div>
  );
}

export default AppShell;
