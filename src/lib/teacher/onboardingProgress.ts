/**
 * Onboarding progress model for Peh.
 *
 * Tracks which onboarding stages the user has completed, skipped, or
 * is currently viewing. Pure data model — storage is handled by the
 * caller (browser localStorage or similar).
 *
 * No cloud/network involved. No model calls.
 */

import { ONBOARDING_STAGES, getStagesInOrder } from "./onboarding";
import { TEACHER_CONCEPTS } from "./concepts";

export type UserExperienceLevel = "brand_new" | "beginner" | "intermediate" | "advanced";

export interface OnboardingProgress {
  currentStage: string;
  completedStages: string[];
  skippedStages: string[];
  lastSeenAt: number;
  userExperienceLevel: UserExperienceLevel;
  completedConcepts: string[];
  dismissedTips: string[];
}

export function createInitialProgress(): OnboardingProgress {
  return {
    currentStage: "welcome",
    completedStages: [],
    skippedStages: [],
    lastSeenAt: Date.now(),
    userExperienceLevel: "brand_new",
    completedConcepts: [],
    dismissedTips: [],
  };
}

function isValidStageId(id: string): boolean {
  return ONBOARDING_STAGES.some((s) => s.id === id);
}

function isValidConceptId(id: string): boolean {
  return TEACHER_CONCEPTS.some((c) => c.id === id);
}

export function completeStage(
  progress: OnboardingProgress,
  stageId: string,
): OnboardingProgress {
  if (!isValidStageId(stageId)) return progress;
  if (progress.completedStages.includes(stageId)) return progress;

  const stage = ONBOARDING_STAGES.find((s) => s.id === stageId);
  const completedConcepts = [...progress.completedConcepts];
  if (stage) {
    for (const c of stage.requiredConcepts) {
      if (!completedConcepts.includes(c)) completedConcepts.push(c);
    }
  }

  const nextStage = stage?.nextStage ?? progress.currentStage;
  return {
    ...progress,
    completedStages: [...progress.completedStages, stageId],
    currentStage: isValidStageId(nextStage) ? nextStage : progress.currentStage,
    lastSeenAt: Date.now(),
    completedConcepts,
  };
}

export function skipStage(
  progress: OnboardingProgress,
  stageId: string,
): OnboardingProgress {
  if (!isValidStageId(stageId)) return progress;
  if (progress.skippedStages.includes(stageId)) return progress;

  const stage = ONBOARDING_STAGES.find((s) => s.id === stageId);
  const nextStage = stage?.nextStage ?? progress.currentStage;
  return {
    ...progress,
    skippedStages: [...progress.skippedStages, stageId],
    currentStage: isValidStageId(nextStage) ? nextStage : progress.currentStage,
    lastSeenAt: Date.now(),
  };
}

export function resetProgress(): OnboardingProgress {
  return createInitialProgress();
}

export function resolveNextStage(progress: OnboardingProgress): string | null {
  const ordered = getStagesInOrder();
  const currentIdx = ordered.findIndex((s) => s.id === progress.currentStage);
  if (currentIdx === -1 || currentIdx >= ordered.length - 1) return null;
  return ordered[currentIdx + 1].id;
}

export function setExperienceLevel(
  progress: OnboardingProgress,
  level: UserExperienceLevel,
): OnboardingProgress {
  return { ...progress, userExperienceLevel: level, lastSeenAt: Date.now() };
}

export function dismissTip(
  progress: OnboardingProgress,
  tipId: string,
): OnboardingProgress {
  if (progress.dismissedTips.includes(tipId)) return progress;
  return { ...progress, dismissedTips: [...progress.dismissedTips, tipId], lastSeenAt: Date.now() };
}

export function completeConcept(
  progress: OnboardingProgress,
  conceptId: string,
): OnboardingProgress {
  if (!isValidConceptId(conceptId)) return progress;
  if (progress.completedConcepts.includes(conceptId)) return progress;
  return { ...progress, completedConcepts: [...progress.completedConcepts, conceptId], lastSeenAt: Date.now() };
}

export function getCompletionPercentage(progress: OnboardingProgress): number {
  const total = ONBOARDING_STAGES.length;
  if (total === 0) return 0;
  return Math.round((progress.completedStages.length / total) * 100);
}

/**
 * Storage key for browser localStorage.
 */
export const ONBOARDING_STORAGE_KEY = "peh_onboarding_progress";
