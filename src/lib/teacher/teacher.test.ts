import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  TEACHER_CONCEPTS,
  getConceptById,
  REQUIRED_GLOSSARY_TERMS,
} from "./concepts";
import {
  TEACHER_LESSONS,
  TEACHER_PATHS,
  getLessonById,
  getRequiredLessons,
} from "./lessonRegistry";
import {
  RUNTIME_TEACHING_HOOKS,
  getHookByEvent,
  getHooksForConcept,
} from "./runtimeHooks";
import {
  ONBOARDING_STAGES,
  getStagesInOrder,
} from "./onboarding";
import { explainPehConcept } from "./explain";
import type { RuntimeTeachingEvent } from "./types";

const REPO_ROOT = path.resolve(__dirname, "../../..");

function kbFileExists(name: string): boolean {
  return existsSync(path.join(REPO_ROOT, "docs/teacher-kb", name));
}

function readKbFile(name: string): string {
  try {
    return readFileSync(path.join(REPO_ROOT, "docs/teacher-kb", name), "utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Required teacher docs exist
// ---------------------------------------------------------------------------

describe("Required teacher docs", () => {
  it("TEACHER_FIRST_DOCTRINE.md exists", () => {
    expect(existsSync(path.join(REPO_ROOT, "docs/TEACHER_FIRST_DOCTRINE.md"))).toBe(true);
  });

  it("teacher-kb/manifest.json exists", () => {
    expect(kbFileExists("manifest.json")).toBe(true);
  });

  it("teacher-kb/README.md exists", () => {
    expect(kbFileExists("README.md")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Manifest contains required modules
// ---------------------------------------------------------------------------

describe("Teacher KB manifest", () => {
  const manifest = JSON.parse(readKbFile("manifest.json") || "{}");
  const modules = manifest.modules ?? [];

  it("has at least 14 modules", () => {
    expect(modules.length).toBeGreaterThanOrEqual(14);
  });

  it("all required modules are present", () => {
    const required = modules.filter((m: { required: boolean }) => m.required);
    expect(required.length).toBeGreaterThanOrEqual(14);
  });

  it("every manifest module has a file that exists", () => {
    for (const mod of modules) {
      expect(kbFileExists(mod.file)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Glossary contains core terms
// ---------------------------------------------------------------------------

describe("Glossary contains core terms", () => {
  const glossary = readKbFile("14-glossary.md").toLowerCase();

  for (const term of REQUIRED_GLOSSARY_TERMS) {
    it(`glossary contains "${term}" concept`, () => {
      // Look for the concept's title in the glossary
      const concept = getConceptById(term);
      if (concept) {
        const titleLower = concept.title.toLowerCase();
        // Check first word of title as minimum
        const firstWord = titleLower.split(/[\s(/]/)[0];
        expect(glossary).toContain(firstWord);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Concept registry
// ---------------------------------------------------------------------------

describe("Concept registry", () => {
  it("has at least 20 concepts", () => {
    expect(TEACHER_CONCEPTS.length).toBeGreaterThanOrEqual(20);
  });

  it("every concept has a plainLanguageDefinition", () => {
    for (const concept of TEACHER_CONCEPTS) {
      expect(concept.plainLanguageDefinition.length).toBeGreaterThan(0);
    }
  });

  it("every concept has a beginnerExplanation", () => {
    for (const concept of TEACHER_CONCEPTS) {
      expect(concept.beginnerExplanation.length).toBeGreaterThan(0);
    }
  });

  it("every concept has at least one example", () => {
    for (const concept of TEACHER_CONCEPTS) {
      expect(concept.examples.length).toBeGreaterThan(0);
    }
  });

  it("every required glossary term has a concept entry", () => {
    for (const term of REQUIRED_GLOSSARY_TERMS) {
      const concept = getConceptById(term);
      expect(concept).toBeDefined();
    }
  });

  it("prerequisite concepts reference existing concepts", () => {
    for (const concept of TEACHER_CONCEPTS) {
      for (const prereq of concept.prerequisiteConcepts) {
        expect(getConceptById(prereq)).toBeDefined();
      }
    }
  });

  it("related concepts reference existing concepts", () => {
    for (const concept of TEACHER_CONCEPTS) {
      for (const related of concept.relatedConcepts) {
        expect(getConceptById(related)).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Lesson registry
// ---------------------------------------------------------------------------

describe("Lesson registry", () => {
  it("has at least 14 lessons", () => {
    expect(TEACHER_LESSONS.length).toBeGreaterThanOrEqual(14);
  });

  it("every lesson references existing concepts", () => {
    for (const lesson of TEACHER_LESSONS) {
      for (const conceptId of lesson.concepts) {
        expect(getConceptById(conceptId)).toBeDefined();
      }
    }
  });

  it("every lesson references existing prerequisites", () => {
    for (const lesson of TEACHER_LESSONS) {
      for (const prereqId of lesson.prerequisites) {
        expect(getLessonById(prereqId)).toBeDefined();
      }
    }
  });

  it("every lesson has a markdownPath that exists", () => {
    for (const lesson of TEACHER_LESSONS) {
      expect(existsSync(path.join(REPO_ROOT, lesson.markdownPath))).toBe(true);
    }
  });

  it("all required lessons are present", () => {
    const required = getRequiredLessons();
    expect(required.length).toBeGreaterThanOrEqual(14);
  });

  it("learning paths reference existing lessons", () => {
    for (const pathEntry of TEACHER_PATHS) {
      for (const lessonId of pathEntry.lessons) {
        expect(getLessonById(lessonId)).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Runtime hooks
// ---------------------------------------------------------------------------

describe("Runtime teaching hooks", () => {
  it("has at least 20 hooks", () => {
    expect(RUNTIME_TEACHING_HOOKS.length).toBeGreaterThanOrEqual(20);
  });

  it("every hook maps to at least one concept", () => {
    for (const hook of RUNTIME_TEACHING_HOOKS) {
      expect(hook.conceptIds.length).toBeGreaterThan(0);
    }
  });

  it("every hook concept references an existing concept", () => {
    for (const hook of RUNTIME_TEACHING_HOOKS) {
      for (const conceptId of hook.conceptIds) {
        expect(getConceptById(conceptId)).toBeDefined();
      }
    }
  });

  it("every hook has whatHappened, whyItMatters, whatYouCanDoNext", () => {
    for (const hook of RUNTIME_TEACHING_HOOKS) {
      expect(hook.whatHappened.length).toBeGreaterThan(0);
      expect(hook.whyItMatters.length).toBeGreaterThan(0);
      expect(hook.whatYouCanDoNext.length).toBeGreaterThan(0);
    }
  });

  it("core events have hooks", () => {
    const coreEvents: RuntimeTeachingEvent[] = [
      "mode_selected",
      "local_model_selected",
      "tool_call_requested",
      "tool_call_blocked",
      "approval_requested",
      "receipt_created",
      "no_cloud_call_made",
      "response_model_only",
      "capability_not_implemented",
    ];
    for (const event of coreEvents) {
      expect(getHookByEvent(event)).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Onboarding stages
// ---------------------------------------------------------------------------

describe("Onboarding stages", () => {
  it("has at least 12 stages", () => {
    expect(ONBOARDING_STAGES.length).toBeGreaterThanOrEqual(12);
  });

  it("stages are ordered and complete (no broken nextStage chain)", () => {
    const ordered = getStagesInOrder();
    expect(ordered.length).toBe(ONBOARDING_STAGES.length);
    expect(ordered[0].id).toBe("welcome");
  });

  it("every stage has an objective and pehExplanation", () => {
    for (const stage of ONBOARDING_STAGES) {
      expect(stage.objective.length).toBeGreaterThan(0);
      expect(stage.pehExplanation.length).toBeGreaterThan(0);
    }
  });

  it("stage concepts reference existing concepts", () => {
    for (const stage of ONBOARDING_STAGES) {
      for (const conceptId of stage.requiredConcepts) {
        expect(getConceptById(conceptId)).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Self-explanation engine
// ---------------------------------------------------------------------------

describe("Self-explanation engine", () => {
  it("can answer: what is a tool call?", () => {
    const result = explainPehConcept({ userQuestion: "What is a tool call?" });
    expect(result.confidence).not.toBe("low");
    expect(result.conceptsCovered).toContain("tool_call");
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("can answer: what is a token?", () => {
    const result = explainPehConcept({ userQuestion: "What is a token?" });
    expect(result.conceptsCovered).toContain("token");
    expect(result.answer).toContain("token");
  });

  it("can answer: what is Local Mode?", () => {
    const result = explainPehConcept({ userQuestion: "What is Local Mode?" });
    expect(result.conceptsCovered).toContain("local_mode");
    expect(result.answer).toContain("machine");
  });

  it("can answer: what is Cloud Mode?", () => {
    const result = explainPehConcept({ userQuestion: "What is Cloud Mode?" });
    expect(result.conceptsCovered).toContain("cloud_mode");
    expect(result.answer.toLowerCase()).toContain("cloud");
  });

  it("can answer: what is a receipt?", () => {
    const result = explainPehConcept({ userQuestion: "What is a receipt?" });
    expect(result.conceptsCovered).toContain("receipt");
    expect(result.answer.toLowerCase()).toContain("proof");
  });

  it("can answer: what can you do locally?", () => {
    const result = explainPehConcept({
      userQuestion: "What can you do?",
      currentMode: "local",
    });
    expect(result.answer).toContain("Local Mode");
    expect(result.answer).toContain("I can:");
  });

  it("can answer: did anything leave my computer?", () => {
    const result = explainPehConcept({
      userQuestion: "Did anything leave my computer?",
      currentMode: "local",
    });
    expect(result.conceptsCovered).toContain("privacy");
    expect(result.modeContext).toContain("Local Mode");
  });

  it("does not claim Cloud Mode is implemented", () => {
    const result = explainPehConcept({
      userQuestion: "What is Cloud Mode?",
      currentMode: "cloud",
    });
    expect(result.answer.toLowerCase()).toContain("not yet implemented");
  });

  it("does not claim fs.write/shell/web are available if matrix says NOT_IMPLEMENTED", () => {
    const result = explainPehConcept({
      userQuestion: "Can you write a file for me?",
      currentMode: "local",
    });
    // Must mention tool limitations — should match tool_call pattern
    expect(result.answer).toContain("Not implemented");
  });

  it("returns low confidence for unrecognized questions", () => {
    const result = explainPehConcept({ userQuestion: "xyzzy plugh" });
    expect(result.confidence).toBe("low");
  });

  it("includes safety notes for risky topics", () => {
    const result = explainPehConcept({ userQuestion: "What is an approval gate?" });
    expect(result.safetyNotes.length).toBeGreaterThan(0);
  });

  it("includes source docs when concepts have linked docs", () => {
    const result = explainPehConcept({ userQuestion: "What is a receipt?" });
    expect(result.sourceDocs.length).toBeGreaterThan(0);
  });
});
