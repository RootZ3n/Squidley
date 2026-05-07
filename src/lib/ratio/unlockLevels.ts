import type { RatioUnlockLevel } from "./types";

export const RATIO_UNLOCK_LEVELS: readonly RatioUnlockLevel[] = [
  "public-local",
  "local-plus",
  "cloud-connected",
  "cloud-assisted",
  "cloud-agent",
  "lab-power",
] as const;

export function unlockMeets(actual: RatioUnlockLevel, required: RatioUnlockLevel): boolean {
  return RATIO_UNLOCK_LEVELS.indexOf(actual) >= RATIO_UNLOCK_LEVELS.indexOf(required);
}
