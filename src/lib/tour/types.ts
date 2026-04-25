/**
 * Companion Tour Mode — shared types.
 *
 * Tours are data-driven so future modules can register their own walkthroughs
 * without touching UI code. Each step targets a named region of the page,
 * which the page renders with a matching `data-tour="<target>"` attribute.
 */

export interface TourStep {
  /** Stable id, unique within the tour. */
  id: string;
  /** Short heading shown in the companion card. */
  title: string;
  /** Beginner-friendly explanation. Plain prose, no jargon. */
  body: string;
  /** Region of the page this step is about (matches `data-tour="..."`). */
  target:
    | "intro"
    | "chat-thread"
    | "input-box"
    | "local-only-indicator"
    | "model-selector"
    | "receipts"
    | "message-metrics";
}

export interface ModuleTour {
  moduleId: string;
  moduleName: string;
  steps: TourStep[];
}
