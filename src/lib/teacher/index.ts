export type {
  TeacherConcept,
  TeacherLesson,
  TeacherPath,
  TeacherExplanationRequest,
  TeacherExplanationResult,
  OnboardingStage,
  RuntimeTeachingEvent,
  RuntimeTeachingHook,
  ConceptLevel,
  LessonModule,
} from "./types";

export {
  TEACHER_CONCEPTS,
  getConceptById,
  getConceptsByIds,
  getConceptsForLevel,
  REQUIRED_GLOSSARY_TERMS,
} from "./concepts";

export {
  TEACHER_LESSONS,
  TEACHER_PATHS,
  getLessonById,
  getLessonsByModule,
  getRequiredLessons,
  getPathById,
} from "./lessonRegistry";

export {
  RUNTIME_TEACHING_HOOKS,
  getHookByEvent,
  getHooksForConcept,
} from "./runtimeHooks";

export {
  ONBOARDING_STAGES,
  getStageById,
  getStagesInOrder,
} from "./onboarding";

export { explainPehConcept } from "./explain";

export { isTeacherIntent } from "./detect";

export { tryTeacherAnswer, teacherResultToPayload } from "./chatIntegration";
export type { TeacherChatResult } from "./chatIntegration";

export {
  createInitialProgress,
  completeStage,
  skipStage,
  resetProgress,
  resolveNextStage,
  setExperienceLevel,
  dismissTip,
  completeConcept,
  getCompletionPercentage,
  ONBOARDING_STORAGE_KEY,
} from "./onboardingProgress";
export type { OnboardingProgress, UserExperienceLevel } from "./onboardingProgress";

export { getRuntimeTeachingExplanation } from "./runtimeExplain";
export type { RuntimeExplanation } from "./runtimeExplain";

export {
  loadTeachingSettings,
  saveTeachingSettings,
  markFirstRunCompleted,
  TEACHING_SETTINGS_KEY,
  DEFAULT_TEACHING_SETTINGS,
} from "./teachingSettings";
export type { TeachingSettings } from "./teachingSettings";

export {
  buildTeachingCard,
  buildTeachWhileChattingNote,
  EXPLAIN_THIS_LABELS,
} from "./teachingCards";
export type { TeachingCard } from "./teachingCards";
