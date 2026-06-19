/**
 * Core types for Peh's teaching architecture.
 *
 * Teaching is first-class architecture, not an afterthought.
 * Peh is Magister for AI agents — a guided learning
 * environment that starts users locally and graduates them through
 * cloud mode and autonomous workflows safely.
 */

export type ConceptLevel = "beginner" | "intermediate" | "advanced";

export type LessonModule =
  | "ai_basics"
  | "local_mode"
  | "cloud_mode"
  | "tools"
  | "approvals"
  | "receipts"
  | "safety"
  | "autonomous_agents";

export interface TeacherConcept {
  readonly id: string;
  readonly title: string;
  readonly plainLanguageDefinition: string;
  readonly beginnerExplanation: string;
  readonly examples: readonly string[];
  readonly relatedConcepts: readonly string[];
  readonly prerequisiteConcepts: readonly string[];
  readonly commonMisunderstandings: readonly string[];
  readonly checkYourUnderstandingQuestions: readonly string[];
  readonly linkedDocs: readonly string[];
}

export interface TeacherLesson {
  readonly id: string;
  readonly title: string;
  readonly level: ConceptLevel;
  readonly module: LessonModule;
  readonly objectives: readonly string[];
  readonly concepts: readonly string[];
  readonly prerequisites: readonly string[];
  readonly estimatedMinutes: number;
  readonly markdownPath: string;
  readonly requiredForRelease: boolean;
  readonly teachesPehFeature?: string;
  readonly userCanAsk: readonly string[];
  readonly completionCheck: string;
}

export interface TeacherPath {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly targetAudience: string;
  readonly lessons: readonly string[];
  readonly graduationCriteria: string;
}

export interface TeacherExplanationRequest {
  readonly userQuestion: string;
  readonly currentMode?: "local" | "cloud";
  readonly currentCapability?: string;
  readonly currentTool?: string;
  readonly userExperienceLevel?: ConceptLevel;
  readonly includeExamples?: boolean;
  readonly includeRisks?: boolean;
  readonly includeNextStep?: boolean;
}

export interface TeacherExplanationResult {
  readonly answer: string;
  readonly conceptsCovered: readonly string[];
  readonly suggestedNextLesson?: string;
  readonly relatedQuestions: readonly string[];
  readonly modeContext?: string;
  readonly safetyNotes: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  readonly sourceDocs: readonly string[];
}

export interface OnboardingStage {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly requiredConcepts: readonly string[];
  readonly userAction: string;
  readonly pehExplanation: string;
  readonly completionCriteria: string;
  readonly nextStage?: string;
}

export type RuntimeTeachingEvent =
  | "mode_selected"
  | "local_model_selected"
  | "cloud_mode_requested"
  | "cloud_provider_configured"
  | "api_key_needed"
  | "cloud_consent_requested"
  | "tool_call_requested"
  | "tool_call_blocked"
  | "approval_requested"
  | "approval_denied"
  | "approval_granted"
  | "receipt_created"
  | "tool_failed"
  | "local_model_failed"
  | "cloud_provider_failed"
  | "capability_not_implemented"
  | "no_cloud_call_made"
  | "response_model_only"
  | "response_tool_backed"
  | "diagnostic_failed"
  | "gauntlet_try_verify";

export interface RuntimeTeachingHook {
  readonly event: RuntimeTeachingEvent;
  readonly conceptIds: readonly string[];
  readonly whatHappened: string;
  readonly whyItMatters: string;
  readonly whatYouCanDoNext: string;
  readonly docsLink?: string;
}
