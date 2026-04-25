/**
 * First-run state — persisted in localStorage.
 *
 * Keys (plain strings so they're debuggable from devtools):
 *   squidley.firstRun.completed  → "true" once the user has chosen.
 *   squidley.tourMode            → "on" | "off".
 *   squidley.tourCompleted       → "true" once a tour has been finished or
 *                                  ended at least once. Useful for friendlier
 *                                  copy on returning visits.
 */

export const KEYS = {
  firstRunCompleted: "squidley.firstRun.completed",
  tourMode: "squidley.tourMode",
  tourCompleted: "squidley.tourCompleted",
} as const;

export type TourMode = "on" | "off";

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readFirstRunCompleted(): boolean {
  return ls()?.getItem(KEYS.firstRunCompleted) === "true";
}

export function readTourMode(): TourMode {
  return ls()?.getItem(KEYS.tourMode) === "on" ? "on" : "off";
}

export function readTourCompleted(): boolean {
  return ls()?.getItem(KEYS.tourCompleted) === "true";
}

export function writeFirstRunChoice(tour: TourMode): void {
  const s = ls();
  if (!s) return;
  s.setItem(KEYS.firstRunCompleted, "true");
  s.setItem(KEYS.tourMode, tour);
}

/**
 * Called when the user finishes or ends the tour. Stops auto-restart on
 * future visits and remembers that they've done one before.
 */
export function markTourCompleted(): void {
  const s = ls();
  if (!s) return;
  s.setItem(KEYS.tourMode, "off");
  s.setItem(KEYS.tourCompleted, "true");
}

/**
 * Called when the user explicitly asks to retake the tour.
 */
export function restartTour(): void {
  const s = ls();
  if (!s) return;
  s.setItem(KEYS.tourMode, "on");
}

export function resetFirstRun(): void {
  const s = ls();
  if (!s) return;
  s.removeItem(KEYS.firstRunCompleted);
  s.removeItem(KEYS.tourMode);
  s.removeItem(KEYS.tourCompleted);
}
