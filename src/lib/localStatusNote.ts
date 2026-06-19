export type LocalStatusNoteVariant = "localOnly" | "cloudLocked" | "noModelNeeded" | "preparedNotActive";

export interface LocalStatusNoteCopy {
  text: string;
  className: string;
}

export function getLocalStatusNoteCopy(variant: LocalStatusNoteVariant): LocalStatusNoteCopy {
  switch (variant) {
    case "cloudLocked":
      return {
        text: "Cloud providers are prepared but locked. No cloud fallback is used.",
        className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100",
      };
    case "noModelNeeded":
      return {
        text: "This module does not need a model.",
        className: "border-ink-200 bg-ink-50 text-ink-600 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-200",
      };
    case "preparedNotActive":
      return {
        text: "Prepared for later, but not active in this public pass.",
        className: "border-iris-200 bg-iris-50 text-iris-800 dark:border-iris-700/60 dark:bg-iris-900/20 dark:text-iris-100",
      };
    case "localOnly":
    default:
      return {
        text: "This stays local in your browser or local model server. No cloud fallback is used.",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100",
      };
  }
}
