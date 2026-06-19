/**
 * Self-explanation engine for Peh.
 *
 * Resolves user questions to concept explanations using the concept
 * registry, capability matrix, and tool registry. Does not use RAG
 * or retrieval — works from the static registries.
 *
 * Key rules:
 * - Never invent unsupported capabilities
 * - Use capability/tool matrix when explaining "what can you do?"
 * - Say when a capability is not implemented
 * - Distinguish Local Mode vs Cloud Mode clearly
 */

import type { TeacherExplanationRequest, TeacherExplanationResult } from "./types";
import { TEACHER_CONCEPTS, getConceptById, REQUIRED_GLOSSARY_TERMS } from "./concepts";
import { TEACHER_LESSONS } from "./lessonRegistry";
import { MODE_CAPABILITY_MATRIX } from "../mode/capabilityMatrix";
import { TOOL_REGISTRY } from "../mode/toolRegistry";
import { PUBLIC_RELEASE_READY } from "../mode/productStatus";

/**
 * Simple keyword-to-concept matching. Maps common question patterns
 * to concept IDs.
 */
const QUESTION_PATTERNS: readonly { pattern: RegExp; conceptIds: string[] }[] = [
  { pattern: /\bwhat (?:are you|is (?:peh|peh))\b/i, conceptIds: ["agent", "local_mode"] },
  { pattern: /\bwhat (?:is|are) (?:a )?tool(?:s| call)?\b/i, conceptIds: ["tool_call", "tool_backed_action"] },
  { pattern: /\bwhat (?:is|are) (?:a )?token/i, conceptIds: ["token", "context_window", "cost"] },
  { pattern: /\bwhat (?:is )?local mode\b/i, conceptIds: ["local_mode", "local_model", "privacy"] },
  { pattern: /\bwhat (?:is )?cloud mode\b/i, conceptIds: ["cloud_mode", "cloud_model", "provider", "cost"] },
  { pattern: /\bwhat (?:is|are) (?:a )?receipt/i, conceptIds: ["receipt", "provenance", "activity-log"] },
  { pattern: /\bwhat can you do\b/i, conceptIds: ["capability_matrix", "local_mode"] },
  { pattern: /\bwhat can(?:'t| not|t) you do\b/i, conceptIds: ["capability_matrix", "local_mode", "cloud_mode"] },
  { pattern: /\bleave (?:my )?(?:machine|computer|device)\b/i, conceptIds: ["privacy", "egress", "local_mode"] },
  { pattern: /\bcloud call\b/i, conceptIds: ["cloud_mode", "privacy", "provenance"] },
  { pattern: /\bno cloud call\b/i, conceptIds: ["local_mode", "privacy", "provenance"] },
  { pattern: /\bapi key\b/i, conceptIds: ["api_key", "provider", "cost"] },
  { pattern: /\bprovider\b/i, conceptIds: ["provider", "cloud_model"] },
  { pattern: /\bhallucin/i, conceptIds: ["hallucination", "honesty"] },
  { pattern: /\bapproval|permission|approve\b/i, conceptIds: ["approval", "risk_tiers"] },
  { pattern: /\brisk/i, conceptIds: ["risk_tiers", "approval", "safety"] },
  { pattern: /\bollama\b/i, conceptIds: ["ollama", "local_model"] },
  { pattern: /\bllama[.-]?(?:cpp|server)\b/i, conceptIds: ["llama_cpp", "local_model"] },
  { pattern: /\bcost|money|pay|price\b/i, conceptIds: ["cost", "token", "api_key"] },
  { pattern: /\bpriv(?:acy|ate)\b/i, conceptIds: ["privacy", "local_mode", "egress"] },
  { pattern: /\bprovenance|footer\b/i, conceptIds: ["provenance", "receipt"] },
  { pattern: /\bsafe(?:ty|ly)?\b/i, conceptIds: ["safety", "approval", "egress"] },
  { pattern: /\bagent|autonomous|workflow\b/i, conceptIds: ["agent", "autonomous_workflow"] },
  { pattern: /\bmodel\b/i, conceptIds: ["model"] },
  { pattern: /\bprompt(?! injection)\b/i, conceptIds: ["prompt"] },
  { pattern: /\bprompt injection\b/i, conceptIds: ["prompt_injection", "safety"] },
  { pattern: /\bwrite (?:a )?file\b/i, conceptIds: ["tool_call", "approval", "local_mode"] },
  { pattern: /\bweb search\b/i, conceptIds: ["tool_call", "local_mode", "cloud_mode"] },
  { pattern: /\b(?:run|execute) (?:a )?(?:command|shell)\b/i, conceptIds: ["tool_call", "approval", "local_mode"] },
  { pattern: /\bsearch the web\b/i, conceptIds: ["tool_call", "local_mode", "cloud_mode"] },
  { pattern: /\bbrowse the web\b/i, conceptIds: ["tool_call", "local_mode", "cloud_mode"] },
  { pattern: /\bdon(?:'t|t) know what (?:an? )?agent/i, conceptIds: ["agent", "tool_call"] },
  { pattern: /\bdon(?:'t|t) know what (?:an? )?token/i, conceptIds: ["token", "context_window"] },
  { pattern: /\bdon(?:'t|t) know what (?:an? )?tool/i, conceptIds: ["tool_call", "tool_backed_action"] },
  { pattern: /\bdon(?:'t|t) know what (?:an? )?receipt/i, conceptIds: ["receipt", "provenance"] },
  { pattern: /\bhow (?:do i|can i) (?:start|begin|get started)\b/i, conceptIds: ["local_mode", "ollama"] },
  { pattern: /\bwhy can(?:'t|t) you (?:browse|access|use) the web\b/i, conceptIds: ["tool_call", "local_mode", "capability_matrix"] },
  { pattern: /\bno cloud\b.*\bmean\b/i, conceptIds: ["local_mode", "privacy", "provenance"] },
  { pattern: /\bno tool\b.*\bmean\b/i, conceptIds: ["model_only_answer", "tool_call"] },
  { pattern: /\blocal.only\b.*\bmean\b/i, conceptIds: ["local_mode", "privacy"] },
  { pattern: /\bmodel.only\b.*\bmean\b/i, conceptIds: ["model_only_answer", "provenance"] },
  { pattern: /\bnot.implemented\b.*\bmean\b/i, conceptIds: ["capability_matrix", "local_mode", "cloud_mode"] },
];

function matchConcepts(question: string): string[] {
  const matched = new Set<string>();
  for (const { pattern, conceptIds } of QUESTION_PATTERNS) {
    if (pattern.test(question)) {
      for (const id of conceptIds) {
        matched.add(id);
      }
    }
  }
  return Array.from(matched);
}

function buildCapabilityAnswer(mode: "local" | "cloud" | undefined): string {
  const relevantMode = mode ?? "local";
  const ready = MODE_CAPABILITY_MATRIX.filter(
    (c) => (relevantMode === "local" ? c.localModeStatus : c.cloudModeStatus) === "READY",
  );
  const partial = MODE_CAPABILITY_MATRIX.filter(
    (c) => (relevantMode === "local" ? c.localModeStatus : c.cloudModeStatus) === "PARTIAL",
  );
  const notImpl = MODE_CAPABILITY_MATRIX.filter(
    (c) => (relevantMode === "local" ? c.localModeStatus : c.cloudModeStatus) === "NOT_IMPLEMENTED",
  );

  const lines: string[] = [];
  if (ready.length > 0) {
    lines.push(`In ${relevantMode === "local" ? "Local" : "Cloud"} Mode, I can: ${ready.map((c) => c.name).join(", ")}.`);
  }
  if (partial.length > 0) {
    lines.push(`Partially available: ${partial.map((c) => c.name).join(", ")}.`);
  }
  if (notImpl.length > 0) {
    lines.push(`Not implemented yet: ${notImpl.map((c) => c.name).join(", ")}.`);
  }
  return lines.join(" ");
}

function buildToolAnswer(mode: "local" | "cloud" | undefined): string {
  const relevantMode = mode ?? "local";
  const available = TOOL_REGISTRY.filter(
    (t) => {
      const status = relevantMode === "local" ? t.localStatus : t.cloudStatus;
      return status === "READY" || status === "PARTIAL";
    },
  );
  const notImpl = TOOL_REGISTRY.filter(
    (t) => {
      const status = relevantMode === "local" ? t.localStatus : t.cloudStatus;
      return status === "NOT_IMPLEMENTED";
    },
  );

  const lines: string[] = [];
  if (available.length > 0) {
    lines.push(`Available tools: ${available.map((t) => t.name).join(", ")}.`);
  }
  if (notImpl.length > 0) {
    lines.push(`Not implemented: ${notImpl.map((t) => t.name).join(", ")}.`);
  }
  return lines.join(" ");
}

function suggestNextLesson(conceptIds: string[]): string | undefined {
  for (const lesson of TEACHER_LESSONS) {
    const covers = lesson.concepts.some((c) => conceptIds.includes(c));
    if (covers) return lesson.id;
  }
  return undefined;
}

function getRelatedQuestions(conceptIds: string[]): string[] {
  const questions: string[] = [];
  for (const id of conceptIds) {
    const concept = getConceptById(id);
    if (concept) {
      for (const q of concept.checkYourUnderstandingQuestions) {
        if (!questions.includes(q)) questions.push(q);
      }
    }
  }
  return questions.slice(0, 5);
}

/**
 * Explain a concept or answer a question using the teaching registry.
 *
 * This is a structured, testable explanation engine — not a model call.
 * It uses the concept registry, capability matrix, and tool registry
 * to produce accurate, honest answers.
 */
export function explainPehConcept(
  request: TeacherExplanationRequest,
): TeacherExplanationResult {
  const conceptIds = matchConcepts(request.userQuestion);

  if (conceptIds.length === 0) {
    return {
      answer: "I'm not sure I understand that question. Try asking about Local Mode, Cloud Mode, tools, receipts, or what I can do.",
      conceptsCovered: [],
      relatedQuestions: ["What can you do?", "What is Local Mode?", "What is a tool call?"],
      safetyNotes: [],
      confidence: "low",
      sourceDocs: [],
    };
  }

  const concepts = conceptIds
    .map((id) => getConceptById(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  // Build answer from concept explanations
  const answerParts: string[] = [];
  const sourceDocs: string[] = [];
  const safetyNotes: string[] = [];

  for (const concept of concepts) {
    answerParts.push(concept.beginnerExplanation);
    for (const doc of concept.linkedDocs) {
      if (!sourceDocs.includes(doc)) sourceDocs.push(doc);
    }
  }

  // Add capability context if asking about what Peh can do
  if (conceptIds.includes("capability_matrix") || conceptIds.includes("local_mode") || conceptIds.includes("cloud_mode")) {
    answerParts.push(buildCapabilityAnswer(request.currentMode));
  }

  // Add tool context if asking about tools
  if (conceptIds.includes("tool_call") || conceptIds.includes("tool_backed_action")) {
    answerParts.push(buildToolAnswer(request.currentMode));
  }

  // Add mode context
  let modeContext: string | undefined;
  if (request.currentMode === "local") {
    modeContext = "You are currently in Local Mode. Everything stays on your machine.";
  } else if (request.currentMode === "cloud") {
    modeContext = "You are currently in Cloud Mode. Cloud calls may send data to a provider.";
    if (!PUBLIC_RELEASE_READY) {
      modeContext += " Note: Cloud Mode is not yet fully implemented.";
    }
  }

  // Add safety notes for risky concepts
  if (conceptIds.includes("approval") || conceptIds.includes("risk_tiers")) {
    safetyNotes.push("High-risk actions always require your explicit approval.");
  }
  if (conceptIds.includes("cost") || conceptIds.includes("api_key")) {
    safetyNotes.push("Cloud calls cost money. Peh will warn you before making paid calls.");
  }
  if (conceptIds.includes("privacy") || conceptIds.includes("egress")) {
    safetyNotes.push("In Local Mode, nothing leaves your machine. In Cloud Mode, your text goes to the provider.");
  }

  // Add next step if requested
  if (request.includeNextStep) {
    const suggested = suggestNextLesson(conceptIds);
    if (suggested) {
      const lesson = TEACHER_LESSONS.find((l) => l.id === suggested);
      if (lesson) {
        answerParts.push(`To learn more, check the lesson: "${lesson.title}".`);
      }
    }
  }

  return {
    answer: answerParts.join("\n\n"),
    conceptsCovered: conceptIds,
    suggestedNextLesson: suggestNextLesson(conceptIds),
    relatedQuestions: getRelatedQuestions(conceptIds),
    modeContext,
    safetyNotes,
    confidence: concepts.length > 0 ? "high" : "medium",
    sourceDocs,
  };
}
