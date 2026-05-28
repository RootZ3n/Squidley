/**
 * Teacher Layer chat integration.
 *
 * Intercepts teacher-intent questions before they go to the local model
 * and answers them deterministically from the concept/capability registry.
 *
 * Does not call cloud. Does not require a local model.
 * Provenance says "teacher_layer" to distinguish from model-generated text.
 */

import type { TeacherExplanationResult } from "./types";
import { isTeacherIntent } from "./detect";
import { explainPehConcept } from "./explain";
import type { ResponseMode } from "../chat/responseMode";

export type TeacherResponseMode = "teacher_layer";

export interface TeacherChatResult {
  /** Whether the question was handled by the teacher layer. */
  handled: boolean;
  /** The teacher's response, if handled. */
  reply?: string;
  /** Provenance source. */
  source?: "teacher_layer";
  /** Which response mode to use in provenance. */
  responseMode?: ResponseMode;
  /** Concepts covered in the answer. */
  conceptsCovered?: readonly string[];
  /** Suggested next lesson. */
  suggestedNextLesson?: string;
  /** Related questions the user might ask. */
  relatedQuestions?: readonly string[];
  /** Mode context string. */
  modeContext?: string;
  /** Safety notes, if any. */
  safetyNotes?: readonly string[];
  /** Source docs referenced. */
  sourceDocs?: readonly string[];
}

/**
 * Try to answer a user message using the Teacher Layer.
 *
 * If the message is a teacher-intent question, returns a structured
 * answer from the concept registry. If not, returns { handled: false }
 * and the caller should route to the local model.
 *
 * Never calls cloud. Never calls a model.
 */
export function tryTeacherAnswer(
  message: string,
  currentMode: "local" | "cloud" = "local",
): TeacherChatResult {
  if (!isTeacherIntent(message)) {
    return { handled: false };
  }

  const explanation = explainPehConcept({
    userQuestion: message,
    currentMode,
    includeExamples: true,
    includeRisks: true,
    includeNextStep: true,
  });

  // If confidence is low, let the model handle it
  if (explanation.confidence === "low") {
    return { handled: false };
  }

  // Build the reply with related questions appended
  let reply = explanation.answer;

  if (explanation.safetyNotes.length > 0) {
    reply += "\n\n" + explanation.safetyNotes.map((n) => `Note: ${n}`).join("\n");
  }

  if (explanation.relatedQuestions.length > 0) {
    reply += "\n\nYou might also ask:\n" +
      explanation.relatedQuestions.slice(0, 3).map((q) => `- ${q}`).join("\n");
  }

  return {
    handled: true,
    reply,
    source: "teacher_layer",
    responseMode: "local_model", // Uses existing ResponseMode; teacher_layer tracked separately
    conceptsCovered: explanation.conceptsCovered,
    suggestedNextLesson: explanation.suggestedNextLesson,
    relatedQuestions: explanation.relatedQuestions,
    modeContext: explanation.modeContext,
    safetyNotes: explanation.safetyNotes,
    sourceDocs: explanation.sourceDocs,
  };
}

/**
 * Format a TeacherChatResult into a ChatSuccessBody-compatible payload.
 */
export function teacherResultToPayload(result: TeacherChatResult, now: () => number = Date.now) {
  const ts = now();
  return {
    ok: true as const,
    provider: "local" as const,
    cloudUsed: false as const,
    toolsUsed: false as const,
    model: "teacher_layer",
    reply: result.reply ?? "",
    startedAt: ts,
    completedAt: ts,
    durationMs: 0,
    responseMode: "local_model" as const,
    teacherSource: "teacher_layer" as const,
    conceptsCovered: result.conceptsCovered,
    suggestedNextLesson: result.suggestedNextLesson,
    relatedQuestions: result.relatedQuestions,
    modeContext: result.modeContext,
  };
}
