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
    | "archivum-list"
    | "more-input-form"
    | "archivum-velum-review"
    | "archivum-save"
    | "archivum-badges"
    | "archivum-entry-actions"
    | "archivum-entry-detail"
    | "tabularium-filters"
    | "tabularium-list"
    | "tabularium-detail"
    | "tabularium-actions"
    | "oculus-picker"
    | "oculus-preview"
    | "oculus-vision"
    | "oculus-result"
    | "oculus-handoff"
    | "fabrica-inputs"
    | "fabrica-change"
    | "fabrica-model"
    | "fabrica-limits"
    | "fabrica-output"
    | "nous-asi"
    | "nous-module-map"
    | "nous-model-controls"
    | "nous-provider-registry"
    | "nous-cloud-lock";
}

export interface ModuleTour {
  moduleId: string;
  moduleName: string;
  steps: TourStep[];
}
