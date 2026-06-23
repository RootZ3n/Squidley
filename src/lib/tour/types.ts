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
    | "message-metrics"
    | "velum-paste"
    | "velum-review"
    | "velum-findings"
    | "velum-redaction"
    | "notebook-list"
    | "more-input-form"
    | "notebook-velum-review"
    | "notebook-save"
    | "notebook-badges"
    | "notebook-entry-actions"
    | "notebook-entry-detail"
    | "tabularium-filters"
    | "tabularium-list"
    | "tabularium-detail"
    | "tabularium-actions"
    | "vision-picker"
    | "vision-preview"
    | "vision-vision"
    | "vision-result"
    | "vision-handoff"
    | "workshop-inputs"
    | "workshop-change"
    | "workshop-model"
    | "workshop-limits"
    | "workshop-output"
    | "insights-asi"
    | "insights-module-map"
    | "insights-model-controls"
    | "insights-provider-registry"
    | "insights-cloud-lock";
}

export interface ModuleTour {
  moduleId: string;
  moduleName: string;
  steps: TourStep[];
}
