import type { AssessmentUnlockLevel } from "./types";

export const RATIO_UNLOCK_LEVELS: readonly AssessmentUnlockLevel[] = [
  "public-local",
  "local-plus",
  "cloud-connected",
  "cloud-assisted",
  "cloud-agent",
  "lab-power",
] as const;

export function unlockMeets(actual: AssessmentUnlockLevel, required: AssessmentUnlockLevel): boolean {
  return RATIO_UNLOCK_LEVELS.indexOf(actual) >= RATIO_UNLOCK_LEVELS.indexOf(required);
}
